"""실인증 코어 — 비밀번호(scrypt)·세션(JWT HS256)·2FA(TOTP)·1회용 토큰.

외부 의존성 없이 표준 라이브러리로 구현한다 (감사 가능성·배포 단순성).
비밀 소스: JWT_SECRET > ADMIN_KEY > TOKEN_ENC_KEY. 셋 다 없으면 프로세스별
임시 키(재시작 시 전원 로그아웃)로 동작하며 경고를 남긴다.

AUTH_REQUIRED=1 이면 보호 라우트에서 JWT를 강제한다. 꺼져 있으면(파일럿)
기존 간이 키(X-Admin-Key)와 병행 — 데모·리허설 흐름이 깨지지 않는다.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import struct
import time

from fastapi import Header, HTTPException

from .db import connect

log = logging.getLogger(__name__)

_FALLBACK_SECRET = secrets.token_hex(32)
TOKEN_TTL_H = int(os.environ.get("JWT_TTL_HOURS", "24"))


def _secret() -> str:
    s = (os.environ.get("JWT_SECRET") or os.environ.get("ADMIN_KEY")
         or os.environ.get("TOKEN_ENC_KEY"))
    if not s:
        log.warning("JWT_SECRET 미설정 — 임시 키 사용(재시작 시 세션 무효)")
        return _FALLBACK_SECRET
    return s


def auth_required() -> bool:
    return os.environ.get("AUTH_REQUIRED") == "1"


# ── 비밀번호: scrypt (stdlib) ────────────────────────────────────

def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1)
    return f"scrypt${salt.hex()}${h.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, salt_hex, h_hex = stored.split("$")
        h = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt_hex),
                           n=2 ** 14, r=8, p=1)
        return hmac.compare_digest(h.hex(), h_hex)
    except Exception:
        return False


# ── JWT HS256 (수제 — 20줄이면 충분) ─────────────────────────────

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue_jwt(claims: dict, ttl_h: int = TOKEN_TTL_H) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64(json.dumps(
        {**claims, "exp": int(time.time()) + ttl_h * 3600},
        ensure_ascii=False).encode())
    sig = _b64(hmac.new(_secret().encode(), f"{header}.{payload}".encode(),
                        hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def decode_jwt(token: str) -> dict:
    try:
        header, payload, sig = token.split(".")
        good = _b64(hmac.new(_secret().encode(), f"{header}.{payload}".encode(),
                             hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            raise ValueError("서명 불일치")
        claims = json.loads(_unb64(payload))
        if claims.get("exp", 0) < time.time():
            raise ValueError("만료")
        return claims
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(401, f"세션이 유효하지 않습니다 ({e}) — 다시 로그인하세요")


# ── TOTP (RFC 6238, SHA-1/30s/6자리 — 구글 OTP 호환) ────────────

def totp_new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode()


def totp_code(secret_b32: str, at: int | None = None) -> str:
    key = base64.b32decode(secret_b32)
    counter = int((at or time.time()) // 30)
    msg = struct.pack(">Q", counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[19] & 0xF
    code = (struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{code:06d}"


def totp_verify(secret_b32: str, code: str) -> bool:
    now = int(time.time())
    return any(hmac.compare_digest(totp_code(secret_b32, now + d), code.strip())
               for d in (-30, 0, 30))          # 시계 오차 ±30초 허용


def totp_uri(secret_b32: str, email: str) -> str:
    return (f"otpauth://totp/ThePRList:{email}"
            f"?secret={secret_b32}&issuer=ThePRList")


# ── 1회용 토큰 (매직링크·초대) — DB에는 해시만 ───────────────────

def one_time_token(conn, user_id, kind: str, ttl_min: int) -> str:
    raw = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at)"
        " VALUES (%s,%s,%s, now() + make_interval(mins => %s))",
        (user_id, kind, hashlib.sha256(raw.encode()).hexdigest(), ttl_min))
    return raw


def consume_token(conn, raw: str, kind: str) -> dict:
    row = conn.execute(
        "UPDATE auth_tokens SET used_at=now()"
        " WHERE token_hash=%s AND kind=%s AND used_at IS NULL"
        "   AND expires_at > now() RETURNING user_id",
        (hashlib.sha256(raw.encode()).hexdigest(), kind)).fetchone()
    if not row:
        raise HTTPException(400, "링크가 만료됐거나 이미 사용되었습니다 — 다시 요청하세요")
    u = conn.execute("SELECT * FROM users WHERE user_id=%s AND state='active'",
                     (row["user_id"],)).fetchone()
    if not u:
        raise HTTPException(401, "계정을 사용할 수 없습니다")
    return u


# ── 세션 무효화(epoch) — 비밀번호 재설정 시 기존 JWT 전부 폐기 ────
# JWT는 무상태지만, 발급 시 넣은 se(session_epoch)를 users.session_epoch와
# 비교한다. 재설정이 epoch를 올리면 이전 토큰(se 불일치·se 없음=0)이 모두
# 무효가 된다. 짧은 캐시로 요청당 조회를 줄인다(폐기 반영 지연 최대 10초,
# 같은 프로세스에서 bump 시 즉시 반영).

_EPOCH_CACHE_TTL = 10.0
_epoch_cache: dict[str, tuple[int, float]] = {}


def _session_epoch(user_id: str) -> int | None:
    now = time.time()
    hit = _epoch_cache.get(str(user_id))
    if hit and now - hit[1] < _EPOCH_CACHE_TTL:
        return hit[0]
    try:
        with connect() as conn:
            row = conn.execute(
                "SELECT session_epoch, state FROM users WHERE user_id=%s::uuid",
                (str(user_id),)).fetchone()
    except Exception:
        if auth_required():
            raise HTTPException(503, "세션 확인이 지연되고 있습니다 — 잠시 후 다시 시도하세요")
        return None
    if auth_required() and (not row or row['state'] != 'active'):
        raise HTTPException(401, "계정을 사용할 수 없습니다")
    epoch = row["session_epoch"] if row else 0
    _epoch_cache[str(user_id)] = (epoch, now)
    return epoch


def bump_session_epoch(conn, user_id) -> None:
    """이 사용자의 기존 세션 전부 무효화(비밀번호 재설정 등)."""
    conn.execute("UPDATE users SET session_epoch=session_epoch+1"
                 " WHERE user_id=%s", (user_id,))
    _epoch_cache.pop(str(user_id), None)


# ── FastAPI 의존성 ───────────────────────────────────────────────

def current_user(authorization: str = Header(default="")) -> dict | None:
    """Bearer JWT → 클레임. 토큰이 없으면 None (강제는 라우트별 가드에서)."""
    if not authorization.startswith("Bearer "):
        return None
    claims = decode_jwt(authorization.removeprefix("Bearer ").strip())
    if claims.get("sub") and claims.get("kind") in ("admin", "brand",
                                                    "creator"):
        epoch = _session_epoch(claims["sub"])
        if epoch is not None and int(claims.get("se", 0)) != epoch:
            raise HTTPException(401, "세션이 무효화되었습니다 — 다시 로그인하세요")
    return claims


def require_brand(brand_id: str,
                  authorization: str = Header(default=""),
                  x_admin_key: str = Header(default="")) -> dict:
    """브랜드 라우트 가드 — 그 브랜드의 JWT, 어드민 JWT, 또는(전환기) 간이 키."""
    u = current_user(authorization)
    if u:
        if u.get("otp") == "pending":
            raise HTTPException(401, "2단계 인증을 완료하세요")
        if u.get("kind") == "admin" or (u.get("kind") == "brand"
                                        and u.get("brand_id") == brand_id):
            return u
        raise HTTPException(403, "이 브랜드에 대한 권한이 없습니다")
    if not auth_required():
        required = os.environ.get("ADMIN_KEY", "")
        if not required or x_admin_key == required:
            return {"kind": "legacy-key", "brand_id": brand_id}
    raise HTTPException(401, "로그인이 필요합니다")


def require_admin_jwt(authorization: str = Header(default="")) -> dict:
    u = current_user(authorization)
    if not u or u.get("kind") != "admin":
        raise HTTPException(401, "어드민 로그인이 필요합니다")
    if u.get("otp") == "pending":
        raise HTTPException(401, "2단계 인증(OTP)을 완료하세요")
    return u
