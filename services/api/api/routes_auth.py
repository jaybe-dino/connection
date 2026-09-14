"""실인증 API — 브랜드 로그인 / 크리에이터 매직링크 / 어드민 2FA / 초대.

메일 발송이 필요한 흐름(매직링크·초대)은 데모 모드(GOOGLE·SENDGRID 키 없음)에서
링크를 응답에 직접 담아준다 — 실모드 전환 시 같은 API로 메일 발송된다.
"""

import logging
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from . import auth
from .db import connect, ledger_append

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth")

MAGIC_TTL_MIN, INVITE_TTL_MIN = 15, 60 * 72   # 매직링크 15분 · 초대 72시간
SITE = os.environ.get("SITE_URL", "https://theprlist.net")


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
              "brand_id": u["brand_id"], "creator_id": u["creator_id"], **extra}
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
    if not claims or claims.get("kind") != "admin":
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
    if not claims or claims.get("kind") != "admin":
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
    if not (u and u.get("kind") == "admin"):
        required = os.environ.get("ADMIN_KEY", "")
        legacy_ok = (not auth.auth_required()
                     and (not required or x_admin_key == required))
        if not legacy_ok:
            raise HTTPException(401, "어드민 권한이 필요합니다")
    email = body.email.strip().lower()
    with connect() as conn:
        exists = conn.execute("SELECT * FROM users WHERE email=%s",
                              (email,)).fetchone()
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
            email, "The PR List — 브랜드 콘솔 초대",
            f"안녕하세요, The PR List입니다.\n\n{body.brand_id} 브랜드 콘솔 계정이"
            f" 준비됐어요. 아래 링크에서 비밀번호를 설정하면 바로 시작됩니다"
            f" (72시간 유효).\n\n{link}\n\n— 아리 드림")
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


@router.post("/magic")
def magic_request(body: MagicIn) -> dict:
    """매직링크 요청 — 계정이 없으면 크리에이터로 만든다(가입 겸용)."""
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "이메일 형식이 올바르지 않습니다")
    with connect() as conn:
        u = conn.execute("SELECT * FROM users WHERE email=%s",
                         (email,)).fetchone()
        if u and u["kind"] != "creator":
            raise HTTPException(400, "이 이메일은 비밀번호 로그인 계정입니다")
        if not u:
            u = conn.execute(
                "INSERT INTO users (kind, email) VALUES ('creator', %s)"
                " RETURNING *", (email,)).fetchone()
        raw = auth.one_time_token(conn, u["user_id"], "magic", MAGIC_TTL_MIN)
    link = f"{SITE}/?magic={raw}"
    out = {"ok": True, "sent": True}
    if _mail_demo_mode():
        out["demoLink"] = link
    else:
        out["sent"] = _send_system_mail(
            email, "The PR List — 로그인 링크",
            f"안녕하세요! 아래 링크를 누르면 바로 로그인됩니다 (15분 유효).\n\n"
            f"{link}\n\n본인이 요청하지 않았다면 이 메일은 무시하세요.\n— 아리")
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
