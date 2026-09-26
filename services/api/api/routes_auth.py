"""실인증 API — 브랜드 로그인 / 크리에이터 매직링크 / 어드민 2FA / 초대.

메일 발송이 필요한 흐름(매직링크·초대)은 데모 모드(GOOGLE·SENDGRID 키 없음)에서
링크를 응답에 직접 담아준다 — 실모드 전환 시 같은 API로 메일 발송된다.
"""

import logging
import os

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from . import auth
from .db import connect, ledger_append

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth")

MAGIC_TTL_MIN, INVITE_TTL_MIN = 15, 60 * 72   # 매직링크 15분 · 초대 72시간
SITE = os.environ.get("SITE_URL", "https://theprlist.net")
# 매직링크는 크리에이터 앱 고정 origin으로만 발급한다(P0: 랜딩 오분기 수정).
# 요청 파라미터로 임의 redirect URL을 받지 않는다 — env 또는 이 기본값뿐.
APP_SITE = os.environ.get("CREATOR_APP_URL", "https://app.theprlist.net")


def _mail_demo_mode() -> bool:
    return not (os.environ.get("SENDGRID_API_KEY")
                or os.environ.get("GOOGLE_CLIENT_ID"))


def _send_system_mail(to: str, subject: str, body: str) -> bool:
    """시스템 메일(초대·매직링크) — SYSTEM_MAIL_BRAND에 연결된 지메일로 발송.

    실모드에서만 시도. 실패해도 예외를 올리지 않는다(호출측이 힌트 응답).
    """
    from .routes_gmail import _demo_mode, send_via_brand_gmail
    if _demo_mode():
        return False
    brand = os.environ.get("SYSTEM_MAIL_BRAND", "glowlab")
    try:
        with connect() as conn:
            return bool(send_via_brand_gmail(conn, brand, to, subject, body))
    except Exception:
        log.exception("시스템 메일 발송 실패 → %s", to)
        return False


def _user_out(u: dict) -> dict:
    return {"userId": str(u["user_id"]), "kind": u["kind"], "email": u["email"],
            "brandId": u["brand_id"], "creatorId": u["creator_id"],
            "totpEnabled": u["totp_enabled"]}


def _issue(u: dict, **extra) -> dict:
    claims = {"sub": str(u["user_id"]), "kind": u["kind"],
              "brand_id": u["brand_id"], "creator_id": u["creator_id"],
              "se": u.get("session_epoch", 0), **extra}
    return {"token": auth.issue_jwt(claims), "user": _user_out(u)}


def _touch_login(conn, user_id) -> None:
    conn.execute("UPDATE users SET last_login_at=now() WHERE user_id=%s",
                 (user_id,))


@router.get("/status")
def status() -> dict:
    with connect() as conn:
        has_admin = bool(conn.execute(
            "SELECT 1 FROM users WHERE kind='admin' LIMIT 1").fetchone())
    return {"authRequired": auth.auth_required(), "hasAdmin": has_admin}


# ── 부트스트랩: 최초 어드민 1명 (ADMIN_KEY로만, 1회) ─────────────

class BootstrapIn(BaseModel):
    email: str
    password: str


@router.post("/bootstrap")
def bootstrap(body: BootstrapIn, x_admin_key: str = Header(default="")) -> dict:
    required = os.environ.get("ADMIN_KEY", "")
    if required and x_admin_key != required:
        raise HTTPException(401, "어드민 키 불일치")
    if len(body.password) < 10:
        raise HTTPException(400, "비밀번호는 10자 이상")
    with connect() as conn:
        if conn.execute("SELECT 1 FROM users WHERE kind='admin'").fetchone():
            raise HTTPException(409, "어드민이 이미 존재합니다 — 로그인하세요")
        u = conn.execute(
            "INSERT INTO users (kind, email, password_hash) VALUES"
            " ('admin', %s, %s) RETURNING *",
            (body.email.strip().lower(),
             auth.hash_password(body.password))).fetchone()
        ledger_append(conn, "system", "ADMIN_BOOTSTRAPPED", str(u["user_id"]),
                      {"email": u["email"]})
    return _issue(u)


# ── 이메일+비밀번호 로그인 (브랜드·어드민) ───────────────────────

class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(body: LoginIn) -> dict:
    with connect() as conn:
        u = conn.execute(
            "SELECT * FROM users WHERE email=%s AND state='active'",
            (body.email.strip().lower(),)).fetchone()
        if not u or not u["password_hash"] or not auth.verify_password(
                body.password, u["password_hash"]):
            raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다")
        if u["kind"] == "admin" and u["totp_enabled"]:
            # 2FA 대기 토큰 — OTP 검증 전엔 어드민 라우트에서 거부된다
            return {**_issue(u, otp="pending"), "needOtp": True}
        _touch_login(conn, u["user_id"])
    return _issue(u)


class OtpIn(BaseModel):
    code: str


@router.post("/otp/verify")
def otp_verify(body: OtpIn, authorization: str = Header(default="")) -> dict:
    claims = auth.current_user(authorization)
    if not claims or claims.get("otp") != "pending":
        raise HTTPException(400, "OTP 대기 상태가 아닙니다 — 먼저 로그인하세요")
    with connect() as conn:
        u = conn.execute("SELECT * FROM users WHERE user_id=%s",
                         (claims["sub"],)).fetchone()
        if not u or not auth.totp_verify(u["totp_secret"] or "", body.code):
            raise HTTPException(401, "OTP 코드가 일치하지 않습니다")
        _touch_login(conn, u["user_id"])
    return _issue(u)


# ── 어드민 2FA 설정 ──────────────────────────────────────────────

@router.post("/otp/setup")
def otp_setup(authorization: str = Header(default="")) -> dict:
    """OTP 앱 등록용 비밀키 발급 — 아직 미활성(enable에서 코드 확인 후 강제)."""
    claims = auth.current_user(authorization)
    if not claims or claims.get("kind") != "admin" or claims.get("otp") == "pending":
        raise HTTPException(401, "어드민 로그인이 필요합니다")
    secret = auth.totp_new_secret()
    with connect() as conn:
        u = conn.execute(
            "UPDATE users SET totp_secret=%s, totp_enabled=false"
            " WHERE user_id=%s RETURNING *", (secret, claims["sub"])).fetchone()
    return {"secret": secret, "otpauthUri": auth.totp_uri(secret, u["email"]),
            "hint": "구글 OTP·1Password 등에 등록 후 /auth/otp/enable로 코드 확인"}


@router.post("/otp/enable")
def otp_enable(body: OtpIn, authorization: str = Header(default="")) -> dict:
    claims = auth.current_user(authorization)
    if not claims or claims.get("kind") != "admin" or claims.get("otp") == "pending":
        raise HTTPException(401, "어드민 로그인이 필요합니다")
    with connect() as conn:
        u = conn.execute("SELECT * FROM users WHERE user_id=%s",
                         (claims["sub"],)).fetchone()
        if not u["totp_secret"] or not auth.totp_verify(u["totp_secret"],
                                                        body.code):
            raise HTTPException(401, "코드 불일치 — OTP 앱의 6자리를 다시 확인하세요")
        conn.execute("UPDATE users SET totp_enabled=true WHERE user_id=%s",
                     (u["user_id"],))
        ledger_append(conn, f"admin:{u['email']}", "ADMIN_2FA_ENABLED",
                      str(u["user_id"]), {})
    return {"ok": True, "totpEnabled": True}


# ── 브랜드 초대 → 수락(비밀번호 설정) ────────────────────────────

class InviteIn(BaseModel):
    email: str
    brand_id: str


@router.post("/invite")
def invite_brand(body: InviteIn, authorization: str = Header(default=""),
                 x_admin_key: str = Header(default="")) -> dict:
    """어드민이 브랜드 담당자를 초대 — 가입 승인 흐름에서 호출된다."""
    u = auth.current_user(authorization)
    # 검수 반영: 2FA 미완료(otp=pending) 어드민 토큰으로는 초대 발급 불가
    if not (u and u.get("kind") == "admin" and u.get("otp") != "pending"):
        required = os.environ.get("ADMIN_KEY", "")
        legacy_ok = (not auth.auth_required()
                     and (not required or x_admin_key == required))
        if not legacy_ok:
            raise HTTPException(401, "어드민 권한이 필요합니다")
    email = body.email.strip().lower()
    with connect() as conn:
        exists = conn.execute("SELECT * FROM users WHERE email=%s",
                              (email,)).fetchone()
        # 검수 반영: 브랜드 초대는 브랜드 계정 목적 전용 — 관리자·크리에이터
        # 계정으로의 초대(=비밀번호 우회 재설정 경로)를 차단하고, 기존 브랜드
        # 계정은 소유 브랜드가 일치할 때만 재초대(비밀번호 재설정)한다.
        if exists and exists["kind"] != "brand":
            raise HTTPException(409, "브랜드 초대는 브랜드 계정에만 보낼 수 있습니다"
                                     " — 비밀번호는 재설정 기능을 사용하세요")
        if exists and exists["brand_id"] and exists["brand_id"] != body.brand_id:
            raise HTTPException(409, "이미 다른 브랜드에 연결된 담당자 이메일입니다")
        target = exists or conn.execute(
            "INSERT INTO users (kind, email, brand_id) VALUES"
            " ('brand', %s, %s) RETURNING *", (email, body.brand_id)).fetchone()
        raw = auth.one_time_token(conn, target["user_id"], "invite",
                                  INVITE_TTL_MIN)
        ledger_append(conn, "admin", "BRAND_INVITED", str(target["user_id"]),
                      {"email": email, "brand": body.brand_id})
    link = f"{SITE}/?invite={raw}"
    out = {"ok": True, "email": email}
    if _mail_demo_mode():
        out["demoLink"] = link      # 실모드에선 메일로만 발송
    else:
        sent = _send_system_mail(
            email, "theprlist — 브랜드 콘솔 초대",
            f"안녕하세요, theprlist입니다.\n\n{body.brand_id} 브랜드 콘솔 계정이"
            f" 준비됐어요. 아래 링크에서 비밀번호를 설정하면 바로 시작됩니다"
            f" (72시간 유효).\n\n{link}\n\n— theprlist 드림")
        out["sent"] = sent
        if not sent:
            out["demoLink"] = link
            out["hint"] = "시스템 발신 지메일 미연결 — 링크를 직접 전달하세요 (SYSTEM_MAIL_BRAND)"
    return out


class AcceptIn(BaseModel):
    token: str
    password: str


@router.post("/accept")
def accept_invite(body: AcceptIn) -> dict:
    if len(body.password) < 10:
        raise HTTPException(400, "비밀번호는 10자 이상")
    with connect() as conn:
        u = auth.consume_token(conn, body.token, "invite")
        # 검수 반영: 초대 수락은 브랜드 계정 전용 — 관리자 계정에 발급된
        # 초대 토큰으로 즉시 세션을 얻는 우회를 차단한다.
        if u["kind"] != "brand":
            raise HTTPException(400, "이 초대는 브랜드 계정 전용입니다"
                                     " — 비밀번호는 재설정 기능을 사용하세요")
        u = conn.execute(
            "UPDATE users SET password_hash=%s WHERE user_id=%s RETURNING *",
            (auth.hash_password(body.password), u["user_id"])).fetchone()
        _touch_login(conn, u["user_id"])
        ledger_append(conn, f"brand:{u['brand_id']}", "BRAND_ACCOUNT_ACTIVATED",
                      str(u["user_id"]), {"email": u["email"]})
    return _issue(u)


# ── 크리에이터 매직링크 ──────────────────────────────────────────

class MagicIn(BaseModel):
    email: str
    brand: str = ""      # 초대 브랜드 slug(선택) — 로그인 후 합류 카드 유지용


@router.post("/magic")
def magic_request(body: MagicIn) -> dict:
    """매직링크 요청 — 계정이 없으면 크리에이터로 만든다(가입 겸용).

    링크는 크리에이터 앱 고정 origin(APP_SITE)으로만 발급한다. brand는
    slug 형식 검증 + 실존 브랜드일 때만 쿼리로 보존한다(임의 redirect 불가).
    """
    import re as _re
    from urllib.parse import quote as _q
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "이메일 형식이 올바르지 않습니다")
    brand = body.brand.strip().lower()
    if brand and not _re.fullmatch(r"[a-z0-9][a-z0-9-]{2,39}", brand):
        brand = ""
    with connect() as conn:
        u = conn.execute("SELECT * FROM users WHERE email=%s",
                         (email,)).fetchone()
        if u and u["kind"] != "creator":
            raise HTTPException(400, "이 이메일은 비밀번호 로그인 계정입니다")
        if not u:
            u = conn.execute(
                "INSERT INTO users (kind, email) VALUES ('creator', %s)"
                " RETURNING *", (email,)).fetchone()
        if brand and not conn.execute("SELECT 1 FROM brands WHERE brand_id=%s",
                                      (brand,)).fetchone():
            brand = ""                      # 실존 브랜드만 보존
        raw = auth.one_time_token(conn, u["user_id"], "magic", MAGIC_TTL_MIN)
    link = f"{APP_SITE}/?{('brand=' + _q(brand) + '&') if brand else ''}magic={raw}"
    out = {"ok": True, "sent": True}
    if _mail_demo_mode():
        out["demoLink"] = link
    else:
        out["sent"] = _send_system_mail(
            email, "theprlist — 로그인 링크",
            f"안녕하세요! 아래 링크를 누르면 바로 로그인됩니다 (15분 유효).\n\n"
            f"{link}\n\n본인이 요청하지 않았다면 이 메일은 무시하세요.\n— theprlist")
        if not out["sent"]:
            out["hint"] = "메일 발송 실패 — 잠시 후 다시 시도해 주세요"
    return out


class MagicVerifyIn(BaseModel):
    token: str


@router.post("/magic/verify")
def magic_verify(body: MagicVerifyIn) -> dict:
    with connect() as conn:
        u = auth.consume_token(conn, body.token, "magic")
        _touch_login(conn, u["user_id"])
        ledger_append(conn, f"creator:{u['email']}", "CREATOR_LOGIN",
                      str(u["user_id"]), {})
    return _issue(u)


@router.get("/me")
def me(authorization: str = Header(default="")) -> dict:
    claims = auth.current_user(authorization)
    if not claims:
        raise HTTPException(401, "로그인이 필요합니다")
    with connect() as conn:
        u = conn.execute("SELECT * FROM users WHERE user_id=%s",
                         (claims["sub"],)).fetchone()
    if not u:
        raise HTTPException(401, "계정을 찾을 수 없습니다")
    return _user_out(u)


# ── 비밀번호 재설정 (브랜드·관리자) ──────────────────────────────
# 원문 토큰은 메일 링크에만 담기고 DB에는 해시(auth_tokens, kind='reset'),
# 로그·공개 응답 어디에도 남지 않는다. 익명 요청 응답은 계정 존재 여부와
# 무관하게 항상 동일하다.

RESET_TTL_MIN = 30                     # 재설정 링크 유효 30분 · 1회용
RESET_EMAIL_LIMIT = 3                  # 같은 이메일: 15분 3회
RESET_IP_LIMIT = 10                    # 같은 IP: 15분 10회 (429)
RESET_WINDOW_MIN = 15


def _client_ip(request) -> str:
    # Use the peer resolved by the server's trusted-proxy configuration, not an
    # arbitrary client-supplied forwarding header.
    return (request.client.host if request.client else "unknown")[:64]


class ResetRequestIn(BaseModel):
    email: str


@router.post("/reset/request")
def reset_request(body: ResetRequestIn, request: Request) -> dict:
    """재설정 메일 요청 — 브랜드·관리자 계정 전용.

    응답은 항상 동일(존재 비노출). 발송 실패를 성공으로 꾸미지 않는다:
    실패는 원장·서버 로그(토큰 없이)에만 남고, 링크를 응답으로 돌려주는
    데모 경로는 없다."""
    email = body.email.strip().lower()
    if "@" not in email or len(email) > 200:
        raise HTTPException(400, "이메일 형식이 올바르지 않습니다")
    generic = {"ok": True,
               "message": ("재설정 요청을 접수했습니다. 등록된 브랜드·관리자 계정이고"
                           " 메일 발송이 가능한 경우 안내가 도착합니다."
                           " 스팸함도 확인하고, 도착하지 않으면 잠시 후 다시 요청하거나"
                           " 운영팀에 문의하세요. 링크는 30분 동안 1회만 유효합니다.")}
    ip = _client_ip(request)
    with connect() as conn:
        # The limit check and reservation must be atomic for both dimensions.
        for key in sorted(("reset-email:" + email, "reset-ip:" + ip)):
            conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (key,))
        n_ip = conn.execute(
            "SELECT count(*) n FROM password_reset_requests"
            " WHERE ip=%s AND requested_at > now() - make_interval(mins=>%s)",
            (ip, RESET_WINDOW_MIN)).fetchone()["n"]
        if n_ip >= RESET_IP_LIMIT:
            raise HTTPException(429, "요청이 너무 잦습니다 — 잠시 후 다시 시도하세요")
        conn.execute("INSERT INTO password_reset_requests (email, ip)"
                     " VALUES (%s,%s)", (email, ip))
        n_email = conn.execute(
            "SELECT count(*) n FROM password_reset_requests"
            " WHERE email=%s AND requested_at > now() - make_interval(mins=>%s)",
            (email, RESET_WINDOW_MIN)).fetchone()["n"]
        u = conn.execute("SELECT * FROM users WHERE email=%s AND state='active'",
                         (email,)).fetchone()
        # 크리에이터는 매직링크 로그인 대상(비밀번호 없음) — 발송하지 않되
        # 응답은 동일하게 유지해 계정 유형도 노출하지 않는다.
        eligible = bool(u) and u["kind"] in ("brand", "admin")
        if not eligible or n_email > RESET_EMAIL_LIMIT:
            return generic
        raw = auth.one_time_token(conn, u["user_id"], "reset", RESET_TTL_MIN)
        ledger_append(conn, "system", "PASSWORD_RESET_REQUESTED",
                      str(u["user_id"]), {"email": email})
    link = f"{SITE}/account.html?reset={raw}"
    sent = _send_system_mail(
        email, "theprlist — 비밀번호 재설정",
        "안녕하세요, theprlist입니다.\n\n아래 링크에서 새 비밀번호를 설정하세요"
        f" (30분 유효 · 1회용).\n\n{link}\n\n본인이 요청하지 않았다면 이 메일은"
        " 무시하세요 — 비밀번호는 바뀌지 않습니다.\n— theprlist 드림")
    if not sent:
        with connect() as conn:
            ledger_append(conn, "system", "PASSWORD_RESET_MAIL_FAILED",
                          str(u["user_id"]),
                          {"email": email,
                           "reason": "시스템 발신 미구성 또는 발송 실패"})
        log.error("재설정 메일 발송 실패: %s (토큰은 기록하지 않음)", email)
    return generic


class ResetConfirmIn(BaseModel):
    token: str
    password: str


@router.post("/reset/confirm")
def reset_confirm(body: ResetConfirmIn) -> dict:
    """재설정 링크로 새 비밀번호 설정 — 세션을 발급하지 않는다.

    완료 시 session_epoch를 올려 기존 세션을 전부 폐기하고, 사용자는 정상
    로그인(관리자 2FA 포함)을 다시 거친다. kind/brand_id/OTP 설정은 불변."""
    if len(body.password) < 10:
        raise HTTPException(400, "비밀번호는 10자 이상")
    with connect() as conn:
        u = auth.consume_token(conn, body.token, "reset")
        if u["kind"] not in ("brand", "admin"):
            raise HTTPException(400, "이 계정 유형은 비밀번호 로그인을 사용하지 않습니다")
        conn.execute("UPDATE users SET password_hash=%s WHERE user_id=%s",
                     (auth.hash_password(body.password), u["user_id"]))
        auth.bump_session_epoch(conn, u["user_id"])
        ledger_append(conn, "system", "PASSWORD_RESET_COMPLETED",
                      str(u["user_id"]), {"email": u["email"]})
    return {"ok": True, "kind": u["kind"],
            "message": "비밀번호가 변경되었습니다 — 새 비밀번호로 다시 로그인하세요."}
