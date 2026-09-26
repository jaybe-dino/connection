"""브랜드별 OAuth 발송 및 수신 동기화. 실제 승인된 권한만 사용하며 기존 연결은 수신 권한 재동의가 필요합니다."""

import base64
import json
from html import escape
import logging
import hmac
import os
from datetime import UTC, datetime, timedelta
from email.mime.text import MIMEText

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .db import connect, ledger_append

log = logging.getLogger(__name__)
router = APIRouter()

READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
SCOPES = "https://www.googleapis.com/auth/gmail.send " + READ_SCOPE + " openid email"
# 실제 발송한 날에만 증가. 전달/반송 피드백 연결 전에는 최대 20통으로 제한.
WARMUP_PLAN = (2, 4, 6, 8, 12, 16, 20)
REPLY_DOMAIN = os.environ.get("REPLY_DOMAIN", "reply.theprlist.net")


def _guard(brand_id: str, authorization: str, x_admin_key: str) -> None:
    """민감 동작 가드 — 브랜드/어드민 JWT 또는(전환기) 간이 키."""
    from . import auth as _auth
    _auth.require_brand(brand_id, authorization, x_admin_key)


def _state_secret() -> str:
    return os.environ.get("ADMIN_KEY") or os.environ.get("TOKEN_ENC_KEY") or ""


def _sign_state(brand_id: str) -> str:
    """OAuth state 위조 방지 — brand.만료시각.서명(HMAC). 콜백에서 검증한다."""
    import hashlib
    import hmac as _hmac
    import time
    exp = str(int(time.time()) + 1800)          # 30분 유효
    msg = f"{brand_id}.{exp}"
    sig = _hmac.new(_state_secret().encode(), msg.encode(),
                    hashlib.sha256).hexdigest()[:16]
    return f"{msg}.{sig}"


def _verify_state(state: str) -> str:
    """서명된 state에서 brand_id 복원. 서명·만료 불일치는 400."""
    import hashlib
    import hmac as _hmac
    import time
    parts = state.split(".")
    if len(parts) != 3:
        if not _state_secret():                 # 개발 모드(비밀키 없음)만 평문 허용
            return state
        raise HTTPException(400, "state 형식 오류")
    brand, exp, sig = parts
    good = _hmac.new(_state_secret().encode(), f"{brand}.{exp}".encode(),
                     hashlib.sha256).hexdigest()[:16]
    if not _hmac.compare_digest(sig, good) or int(exp) < time.time():
        raise HTTPException(400, "state 서명 불일치 또는 만료 — 연결을 처음부터 다시 시도하세요")
    return brand


def _inbound_ready() -> bool:
    """INBOUND_REPLY=1 이면 전용 답장 주소(reply+brand@…)로 수신 — SendGrid
    Inbound Parse 설정 후 켠다. 꺼져 있으면 답장은 브랜드 지메일로 직행."""
    return os.environ.get("INBOUND_REPLY") == "1"


def _demo_mode() -> bool:
    return not os.environ.get("GOOGLE_CLIENT_ID")


# ── 토큰 보관 — TOKEN_ENC_KEY 있으면 암호화(Fernet), 없으면 평문+경고 ──

def _fernet():
    key = os.environ.get("TOKEN_ENC_KEY")
    if not key:
        return None
    from cryptography.fernet import Fernet
    return Fernet(key.encode())


def _enc(v: str) -> str:
    f = _fernet()
    return f.encrypt(v.encode()).decode() if f else v


def _dec(v: str) -> str:
    f = _fernet()
    return f.decrypt(v.encode()).decode() if f else v


# ── 계정 연결 ────────────────────────────────────────────────────

def _acct_out(r: dict) -> dict:
    today = datetime.now(UTC).date()
    completed_days = max(0, r.get('warmup_days', 0) - int(r.get('warmup_last_date') == today))
    cap = WARMUP_PLAN[min(completed_days, len(WARMUP_PLAN)-1)]
    sent = r["sent_today"] if r["sent_date"] == datetime.now(UTC).date() else 0
    return {"accountId": str(r["account_id"]), "brandId": r["brand_id"],
            "email": r["email"], "state": r["state"],
            "connectedAt": r["connected_at"].isoformat(),
            "todayCap": cap, "sentToday": sent,
            "canRead": READ_SCOPE in r.get("scopes", "").split(),
            "syncedAt": r["synced_at"].isoformat() if r.get("synced_at") else None,
            "syncError": r.get("sync_error", ""),
            "remainingToday": max(0, cap-sent) if not r.get('sending_paused') else 0,
            "sendingPaused": r.get('sending_paused',False), "pauseReason": r.get('pause_reason',''),
            "warmupDay": completed_days+1, "warmupPlan": list(WARMUP_PLAN),
            "deliveryVerified": False, "healthStatus": "unverified",
            "replyTo": (f"reply+{r['brand_id']}@{REPLY_DOMAIN}"
                        if _inbound_ready() else r["email"])}


@router.get("/brands/{brand_id}/gmail")
def list_gmail(brand_id: str,
               authorization: str = Header(default=""),
               x_admin_key: str = Header(default="")) -> dict:
    _guard(brand_id, authorization, x_admin_key)
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM gmail_accounts WHERE brand_id=%s AND state='connected'"
            " ORDER BY connected_at,account_id", (brand_id,)).fetchall()
    return {"demo": _demo_mode(), "inboundReady": _inbound_ready(), "accounts": [_acct_out(r) for r in rows]}


class SendingControl(BaseModel):
    paused: bool


@router.post('/gmail/accounts/{account_id}/sending')
def sending_control(account_id: str, body: SendingControl, authorization: str = Header(default='')):
    from .auth import current_user
    user=current_user(authorization)
    if not user or user.get('otp')=='pending':raise HTTPException(401,'로그인이 필요합니다')
    with connect() as conn:
        r=conn.execute('SELECT * FROM gmail_accounts WHERE account_id=%s FOR UPDATE',(account_id,)).fetchone()
        if not r:raise HTTPException(404,'계정을 찾을 수 없습니다')
        _guard(r['brand_id'],authorization,'')
        r=conn.execute('UPDATE gmail_accounts SET sending_paused=%s,pause_reason=%s WHERE account_id=%s RETURNING *',
                       (body.paused,'사용자가 발송을 일시 중지했습니다.' if body.paused else '',account_id)).fetchone()
        ledger_append(conn,str(user.get('sub') or user.get('kind')),'GMAIL_SENDING_PAUSED' if body.paused else 'GMAIL_SENDING_RESUMED',account_id,{})
    return _acct_out(r)


def pause_after_uncertain_send(brand: str):
    with connect() as conn:
        conn.execute("UPDATE gmail_accounts SET sending_paused=true,pause_reason='발송 결과 확인 필요: Gmail 보낸편지함을 확인한 뒤 재개하세요.' WHERE brand_id=%s AND state='connected'",(brand,))


class ConnectIn(BaseModel):
    email: str = ""      # 데모 모드에서만 사용 — 실모드는 구글이 알려준다


@router.post("/brands/{brand_id}/gmail/connect")
def connect_gmail(brand_id: str, body: ConnectIn,
                  authorization: str = Header(default=""),
                  x_admin_key: str = Header(default="")) -> dict:
    """실모드: 구글 동의 화면 URL 반환. 데모 모드: 즉시 연결."""
    _guard(brand_id, authorization, x_admin_key)
    if not _demo_mode():
        redirect = os.environ.get(
            "GOOGLE_REDIRECT_URI",
            "https://api.theprlist.net/gmail/callback")
        from urllib.parse import urlencode
        q = urlencode({
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "redirect_uri": redirect, "response_type": "code",
            "scope": SCOPES, "state": _new_oauth_state(brand_id),
            "access_type": "offline", "prompt": "consent select_account", "include_granted_scopes": "true"})
        return {"authUrl": f"https://accounts.google.com/o/oauth2/v2/auth?{q}"}
    email = body.email.strip().lower() or f"{brand_id}@gmail.com"
    with connect() as conn:
        r = conn.execute(
            "INSERT INTO gmail_accounts (brand_id, email, scopes)"
            " VALUES (%s,%s,%s)"
            " ON CONFLICT (brand_id, email) DO UPDATE SET state='connected'"
            " RETURNING *", (brand_id, email, SCOPES)).fetchone()
        ledger_append(conn, f"brand:{brand_id}", "GMAIL_CONNECTED",
                      str(r["account_id"]), {"email": email, "demo": True})
    return {"demo": True, "account": _acct_out(r)}


@router.get("/gmail/callback")
def gmail_callback(code: str = "", state: str = "", error: str = "") -> HTMLResponse:
    """구글 동의 후 리다이렉트 — 코드를 토큰으로 교환하고 계정 저장 (실모드).

    이 응답은 브랜드 사용자의 브라우저 창에 그대로 뜨므로, 어떤 실패든
    JSON/스택이 아니라 읽을 수 있는 안내 HTML로 돌려준다."""
    try:
        return _gmail_callback(code, state, error)
    except HTTPException as e:
        return HTMLResponse(
            f"<h3>연결 실패</h3><p>{escape(str(e.detail))}</p>"
            "<p>이 창을 닫고 콘솔에서 다시 연결해 주세요.</p>", e.status_code)


def _gmail_callback(code: str, state: str, error: str) -> HTMLResponse:
    if error or not code:
        return HTMLResponse(f"<h3>연결 취소됨</h3><p>{escape(error or 'code 없음')}</p>", 400)
    if _demo_mode():
        raise HTTPException(400, "데모 모드에서는 콜백을 쓰지 않습니다")
    brand_id = _consume_oauth_state(state)
    import httpx
    redirect = os.environ.get(
        "GOOGLE_REDIRECT_URI",
        "https://api.theprlist.net/gmail/callback")
    try:
        tok = httpx.post("https://oauth2.googleapis.com/token", data={
            "code": code, "grant_type": "authorization_code",
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
            "redirect_uri": redirect}, timeout=15).json()
        if not isinstance(tok, dict):
            raise ValueError()
    except (httpx.HTTPError, ValueError) as exc:
        # 네트워크/비JSON 응답 — 브라우저에 500 스택 대신 재시도 안내
        raise HTTPException(
            502, "Google 토큰 교환에 실패했습니다 — 잠시 후 콘솔에서 다시"
                 " 연결해 주세요.") from exc
    if "access_token" not in tok:
        return HTMLResponse(f"<h3>토큰 교환 실패</h3><pre>{escape(str(tok.get('error','')))}</pre>", 400)
    # id_token(구글이 TLS로 직접 준 값)에서 이메일만 꺼낸다
    try:
        payload = tok.get("id_token", "").split(".")[1]
        claims=json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        email=claims.get("email", "").strip().lower()
        if not claims.get('email_verified') or '@' not in email:raise ValueError()
    except (ValueError,IndexError,TypeError,AttributeError):raise HTTPException(400,'Google 이메일 확인에 실패했습니다. 다시 연결하세요.')
    granted=tok.get('scope','')
    if 'https://www.googleapis.com/auth/gmail.send' not in granted.split():raise HTTPException(400,'메일 발송 권한을 허용해 주세요.')
    try:
        expires_in = int(tok.get("expires_in", 3600))
    except (TypeError, ValueError):
        expires_in = 3600            # 비정상 값이어도 연결 자체는 막지 않는다
    expiry = datetime.now(UTC) + timedelta(seconds=expires_in)
    with connect() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('gmail-email:'+email,))
        if conn.execute("SELECT 1 FROM gmail_accounts WHERE email=%s AND brand_id<>%s AND state<>'revoked'",(email,brand_id)).fetchone():
            raise HTTPException(409,'다른 브랜드에 연결된 이메일입니다. 브랜드별 전용 계정을 사용하세요.')
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',('gmail-brand:'+brand_id,))
        if conn.execute("SELECT 1 FROM gmail_accounts WHERE brand_id=%s AND email<>%s AND state='connected'",(brand_id,email)).fetchone():
            raise HTTPException(409,'기존 이메일 연결을 해제한 뒤 새 계정을 연결하세요. 브랜드당 하나의 발신 계정을 사용합니다.')
        r = conn.execute(
            "INSERT INTO gmail_accounts (brand_id, email, access_token,"
            " refresh_token, token_expiry, scopes) VALUES (%s,%s,%s,%s,%s,%s)"
            " ON CONFLICT (brand_id, email) DO UPDATE SET state='connected',"
            " access_token=EXCLUDED.access_token,"
            " refresh_token=COALESCE(NULLIF(EXCLUDED.refresh_token,''),"
            "                        gmail_accounts.refresh_token),"
            " token_expiry=EXCLUDED.token_expiry,scopes=EXCLUDED.scopes,sync_error='' RETURNING *",
            (brand_id, email, _enc(tok["access_token"]),
             (_enc(tok["refresh_token"]) if tok.get("refresh_token") else ""), expiry, granted)).fetchone()
        ledger_append(conn, f"brand:{brand_id}", "GMAIL_CONNECTED",
                      str(r["account_id"]), {"email": email})
    return HTMLResponse(
        "<h3>✅ 지메일 연결 완료</h3><p>이 창을 닫고 콘솔로 돌아가 새로고침하세요.</p>")


@router.delete("/gmail/accounts/{account_id}")
def disconnect_gmail(account_id: str,
                     authorization: str = Header(default=""),
                     x_admin_key: str = Header(default="")) -> dict:
    with connect() as conn:
        pre = conn.execute("SELECT brand_id FROM gmail_accounts"
                           " WHERE account_id=%s", (account_id,)).fetchone()
        if not pre:
            raise HTTPException(404, "account not found")
        _guard(pre["brand_id"], authorization, x_admin_key)
        r = conn.execute(
            "UPDATE gmail_accounts SET state='revoked', access_token='',"
            " refresh_token='' WHERE account_id=%s RETURNING *",
            (account_id,)).fetchone()
        ledger_append(conn, f"brand:{r['brand_id']}", "GMAIL_DISCONNECTED",
                      account_id, {"email": r["email"]})
    return {"ok": True}


# ── 발송 — 브랜드의 연결된 지메일로 (러너·인박스 답장 공용 경로) ──

def _refresh_if_needed(conn, r: dict) -> str:
    """액세스 토큰 반환 — 만료면 리프레시 토큰으로 갱신."""
    if r["token_expiry"] and r["token_expiry"] > datetime.now(UTC) + timedelta(minutes=2):
        return _dec(r["access_token"])
    import httpx
    tok = httpx.post("https://oauth2.googleapis.com/token", data={
        "grant_type": "refresh_token",
        "refresh_token": _dec(r["refresh_token"]),
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", "")},
        timeout=15).json()
    if "access_token" not in tok:
        conn.execute("UPDATE gmail_accounts SET state='error' WHERE account_id=%s",
                     (r["account_id"],))
        raise HTTPException(502, "구글 토큰 갱신 실패 — 재연결이 필요합니다")
    expiry = datetime.now(UTC) + timedelta(seconds=int(tok.get("expires_in", 3600)))
    conn.execute(
        "UPDATE gmail_accounts SET access_token=%s, token_expiry=%s"
        " WHERE account_id=%s",
        (_enc(tok["access_token"]), expiry, r["account_id"]))
    return tok["access_token"]


def send_via_brand_gmail(conn, brand_id: str, to: str, subject: str,
                         body: str, *, account_id=None, reply_headers=None) -> dict | None:
    """연결된 지메일이 있으면 그 주소로 발송. 없으면 None(호출측이 폴백).

    중지 또는 일일 한도 초과 시 None. 아웃리치는 다른 계정으로 우회하지 않고 대기한다.
    """
    r = conn.execute(
        "SELECT * FROM gmail_accounts WHERE brand_id=%s AND state='connected'"
        " AND (%s::uuid IS NULL OR account_id=%s::uuid) ORDER BY connected_at,account_id LIMIT 1 FOR UPDATE", (brand_id,account_id,account_id)).fetchone()
    if not r:
        return None
    out = _acct_out(r)
    if out['sendingPaused'] or out["sentToday"] >= out["todayCap"]:
        return None
    message_id = None
    if not _demo_mode():
        token = _refresh_if_needed(conn, r)
        msg = MIMEText(body, "plain", "utf-8")
        msg["To"], msg["Subject"] = to, subject
        msg["From"] = r["email"]
        msg["Reply-To"] = out["replyTo"]
        if reply_headers and reply_headers.get('rfc_message_id'):
            mid=reply_headers['rfc_message_id']
            if '\r' not in mid and '\n' not in mid:
                msg['In-Reply-To']=mid;msg['References']=mid
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        payload={'raw':raw}
        if reply_headers and reply_headers.get('gmail_thread_id'):payload['threadId']=reply_headers['gmail_thread_id']
        import httpx
        resp = httpx.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}"},
            json=payload, timeout=20)
        if resp.status_code >= 300:
            raise HTTPException(502, "지메일 발송 실패 — Gmail에서 발송 여부를 확인하세요")
        message_id = resp.json().get("id")
        if not message_id:
            raise HTTPException(502, "발송 결과 확인 필요")
    conn.execute(
        "UPDATE gmail_accounts SET sent_today=CASE WHEN sent_date=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date"
        " THEN sent_today+1 ELSE 1 END, sent_date=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,"
        " warmup_days=warmup_days+CASE WHEN warmup_last_date=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date THEN 0 ELSE 1 END,"
        " warmup_last_date=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date"
        " WHERE account_id=%s", (r["account_id"],))
    return {"via": "gmail" if not _demo_mode() else "demo",
            "fromEmail": r["email"], "messageId": message_id}


# ── 답장 인박스 — Reply-To 인바운드 수신 → 스레드 → 게이트 답장 ──

_DECLINE_KW = ("not interested", "no thanks", "stop", "unsubscribe",
               "ไม่สนใจ", "không quan tâm", "안 할게요", "관심 없")
_INTEREST_KW = ("interested", "yes", "sounds good", "love to", "let's do",
                "สนใจ", "ได้ค่ะ", "quan tâm", "đồng ý", "관심 있", "할게요", "좋아요")


def _ari_label(text: str) -> str:
    """theprlist 1차 분류 — 키워드 휴리스틱 (ANTHROPIC 키 있으면 P1에서 승격)."""
    t = text.lower()
    if any(k in t for k in _DECLINE_KW):
        return "declined"
    if any(k in t for k in _INTEREST_KW):
        return "interested"
    if "?" in t or "？" in t:
        return "question"
    return "other"


class InboundIn(BaseModel):
    to: str = ""            # reply+<brand>@… (인바운드 파서가 주는 수신 주소)
    brand_id: str = ""      # to 파싱이 안 될 때 직접 지정
    from_email: str
    handle: str = ""
    subject: str = ""
    text: str


@router.post("/inbound/reply")
def inbound_reply(body: InboundIn, x_inbound_key: str = Header(default="")) -> dict:
    secret = os.environ.get("INBOUND_REPLY_KEY", "")
    if not secret or not hmac.compare_digest(x_inbound_key, secret):
        raise HTTPException(401, "인바운드 인증 필요")
    brand = body.brand_id
    if not brand and "+" in body.to:
        brand = body.to.split("+", 1)[1].split("@", 1)[0]
    if not brand:
        raise HTTPException(400, "brand_id를 알 수 없습니다 (to 또는 brand_id)")
    sender = body.from_email.strip().lower()
    label = _ari_label(body.text)
    with connect() as conn:
        t = conn.execute(
            "INSERT INTO mail_threads (brand_id, creator_email, creator_handle,"
            " subject, ari_label, last_direction, last_message_at)"
            " VALUES (%s,%s,%s,%s,%s,'in',now())"
            " ON CONFLICT (brand_id, creator_email) DO UPDATE SET"
            " ari_label=EXCLUDED.ari_label, last_direction='in',"
            " last_message_at=now(), state='open',"
            " creator_handle=CASE WHEN EXCLUDED.creator_handle<>''"
            "   THEN EXCLUDED.creator_handle ELSE mail_threads.creator_handle END"
            " RETURNING *",
            (brand, sender, body.handle, body.subject, label)).fetchone()
        conn.execute(
            "INSERT INTO mail_messages (thread_id, direction, from_email,"
            " to_email, body) VALUES (%s,'in',%s,%s,%s)",
            (t["thread_id"], sender, body.to or f"reply+{brand}@{REPLY_DOMAIN}",
             body.text))
        ledger_append(conn, "ari:inbox", "MAIL_RECEIVED", str(t["thread_id"]),
                      {"from": sender, "label": label})
    return {"threadId": str(t["thread_id"]), "ariLabel": label}


def _thread_out(r: dict) -> dict:
    return {"threadId": str(r["thread_id"]), "brandId": r["brand_id"],
            "creatorEmail": r["creator_email"], "handle": r["creator_handle"],
            "subject": r["subject"], "ariLabel": r["ari_label"],
            "state": r["state"], "lastDirection": r["last_direction"],
            "lastMessageAt": r["last_message_at"].isoformat()}


@router.get("/brands/{brand_id}/inbox")
def list_inbox(brand_id: str,
               authorization: str = Header(default=""),
               x_admin_key: str = Header(default="")) -> list[dict]:
    _guard(brand_id, authorization, x_admin_key)
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM mail_threads WHERE brand_id=%s"
            " ORDER BY last_message_at DESC LIMIT 100", (brand_id,)).fetchall()
    return [_thread_out(r) for r in rows]


@router.get("/inbox/threads/{thread_id}")
def get_thread(thread_id: str,
               authorization: str = Header(default=""),
               x_admin_key: str = Header(default="")) -> dict:
    with connect() as _c:
        _t = _c.execute("SELECT brand_id FROM mail_threads WHERE thread_id=%s",
                        (thread_id,)).fetchone()
    if not _t:
        raise HTTPException(404, "thread not found")
    _guard(_t["brand_id"], authorization, x_admin_key)
    with connect() as conn:
        t = conn.execute("SELECT * FROM mail_threads WHERE thread_id=%s",
                         (thread_id,)).fetchone()
        if not t:
            raise HTTPException(404, "thread not found")
        msgs = conn.execute(
            "SELECT * FROM mail_messages WHERE thread_id=%s ORDER BY created_at",
            (thread_id,)).fetchall()
        t = conn.execute("SELECT * FROM mail_threads WHERE thread_id=%s",
                         (thread_id,)).fetchone()
    return {**_thread_out(t), "messages": [
        {"msgId": m["msg_id"], "direction": m["direction"], "body": m["body"],
         "state": m["state"], "sentVia": m["sent_via"],
         "at": m["created_at"].isoformat()} for m in msgs]}


class ReplyIn(BaseModel):
    body: str


@router.post("/inbox/threads/{thread_id}/reply")
def reply_thread(thread_id: str, body: ReplyIn,
                 authorization: str = Header(default=""),
                 x_admin_key: str = Header(default="")) -> dict:
    with connect() as _c:
        _t = _c.execute("SELECT brand_id FROM mail_threads WHERE thread_id=%s",
                        (thread_id,)).fetchone()
    if not _t:
        raise HTTPException(404, "thread not found")
    _guard(_t["brand_id"], authorization, x_admin_key)
    """답장 작성 → OUTBOUND 게이트 접수. 승인되면 다음 조회 때 발송된다."""
    if not body.body.strip():
        raise HTTPException(400, "본문이 비어 있습니다")
    with connect() as conn:
        t = conn.execute("SELECT * FROM mail_threads WHERE thread_id=%s",
                         (thread_id,)).fetchone()
        if not t:
            raise HTTPException(404, "thread not found")
        g = conn.execute(
            "INSERT INTO gate_requests (brand_id, kind, summary, payload,"
            " requested_by) VALUES (%s,'OUTBOUND',%s,%s,'user:console')"
            " RETURNING gate_id",
            (t["brand_id"],
             f"답장 발송 · {t['creator_handle'] or t['creator_email']}",
             json.dumps({"thread_id": str(thread_id),
                         "preview": body.body[:120]}, ensure_ascii=False))).fetchone()
        m = conn.execute(
            "INSERT INTO mail_messages (thread_id, direction, to_email, body,"
            " state, gate_id) VALUES (%s,'out',%s,%s,'pending_gate',%s)"
            " RETURNING msg_id",
            (thread_id, t["creator_email"], body.body.strip(),
             g["gate_id"])).fetchone()
        ledger_append(conn, "user:console", "GATE_REQUESTED", str(g["gate_id"]),
                      {"kind": "OUTBOUND", "thread": str(thread_id)})
    return {"msgId": m["msg_id"], "gateId": str(g["gate_id"]),
            "state": "pending_gate"}

@router.post('/inbox/threads/{thread_id}/messages/{msg_id}/send')
def send_reply(thread_id: str, msg_id: int, authorization: str = Header(default='')):
    from .auth import current_user
    u = current_user(authorization)
    if not u or u.get('otp') == 'pending':
        raise HTTPException(401, '로그인이 필요합니다')
    if _demo_mode(): raise HTTPException(503, '실제 Gmail 연결이 필요합니다')
    with connect() as conn:
        t = conn.execute('SELECT * FROM mail_threads WHERE thread_id=%s', (thread_id,)).fetchone()
        if not t: raise HTTPException(404, '대화 없음')
        _guard(t['brand_id'], authorization, '')
        m = conn.execute("UPDATE mail_messages SET state='sending' WHERE msg_id=%s AND thread_id=%s AND direction='out' AND state='pending_gate' RETURNING *", (msg_id,thread_id)).fetchone()
        if not m: raise HTTPException(409, '이미 발송했거나 확인이 필요한 메일입니다')
    try:
        with connect() as conn:
            inbound=conn.execute("SELECT * FROM mail_messages WHERE thread_id=%s AND direction='in' AND gmail_account_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",(thread_id,)).fetchone()
            extra={'account_id':inbound['gmail_account_id'],'reply_headers':inbound} if inbound else {}
            sent = send_via_brand_gmail(conn,t['brand_id'],t['creator_email'],'Re: '+(inbound['subject'] if inbound else t['subject']),m['body'],**extra)
            if not sent:
                conn.execute("UPDATE mail_messages SET state='pending_gate' WHERE msg_id=%s",(msg_id,))
                return {'state':'pending_gate'}
            conn.execute("UPDATE mail_messages SET state='sent',sent_via=%s,from_email=%s WHERE msg_id=%s",(sent['via'],sent['fromEmail'],msg_id))
            conn.execute("UPDATE mail_threads SET last_direction='out',last_message_at=now() WHERE thread_id=%s",(thread_id,))
            conn.execute("UPDATE gate_requests SET state='APPROVED',decided_by=%s,decided_at=now(),executed=true WHERE gate_id=%s",(str(u.get('sub') or u.get('kind')),m['gate_id']))
        return {'state':'sent'}
    except Exception:
        pause_after_uncertain_send(t['brand_id'])
        with connect() as conn:
            conn.execute("UPDATE mail_messages SET state='review' WHERE msg_id=%s",(msg_id,))
        raise HTTPException(502,'Gmail 보낸편지함에서 발송 여부를 확인하세요. 자동 재발송하지 않습니다.')


def _new_oauth_state(brand):
    import secrets,hashlib
    state=secrets.token_urlsafe(32)
    with connect() as conn:
        conn.execute("INSERT INTO gmail_oauth_states(state_hash,brand_id,expires_at) VALUES(%s,%s,now()+interval '15 minutes')",(hashlib.sha256(state.encode()).hexdigest(),brand))
    return state


def _consume_oauth_state(state):
    import hashlib
    with connect() as conn:
        row=conn.execute("UPDATE gmail_oauth_states SET used_at=now() WHERE state_hash=%s AND used_at IS NULL AND expires_at>now() RETURNING brand_id",(hashlib.sha256(state.encode()).hexdigest(),)).fetchone()
    if not row:raise HTTPException(400,'연결 요청이 만료되었거나 이미 사용됐습니다. 다시 연결하세요.')
    return row['brand_id']


@router.post('/brands/{brand_id}/gmail/sync')
def sync_gmail(brand_id: str, authorization: str = Header(default='')):
    from .auth import current_user
    from . import gmail_sync
    u=current_user(authorization)
    if not u or u.get('otp')=='pending':raise HTTPException(401,'로그인이 필요합니다')
    _guard(brand_id,authorization,'')
    if _demo_mode():raise HTTPException(503,'실제 Google 계정 연결이 필요합니다')
    # 계정별 오류는 gmail_sync.sync가 해당 계정 행에만 기록한다 —
    # 여기서 브랜드 전 계정에 덮어쓰지 않는다(검수 반영: 계정별 격리).
    try:return gmail_sync.sync(brand_id)
    except HTTPException:raise
    except Exception:
        raise HTTPException(502,'Gmail 동기화에 실패했습니다. 권한과 연결 상태를 확인해 주세요.')


@router.get('/admin/gmail/status')
def admin_gmail_status(authorization: str = Header(default=''),
                       x_admin_id: str = Header(default=''),
                       x_admin_key: str = Header(default='')):
    """관리자 Gmail 운영 읽기 화면 — 브랜드별 계정 상태·동기화 커서/오류·
    발송 웜업/중지 상태 + 러너 잡 상태를 한 번에. 읽기 전용(변경 없음)."""
    from .routes_ops import require_admin
    require_admin(x_admin_id, x_admin_key, authorization)
    from . import runner_daemon
    with connect() as conn:
        rows = conn.execute(
            "SELECT g.*, b.name AS brand_name, b.is_demo FROM gmail_accounts g"
            " JOIN brands b USING (brand_id)"
            " ORDER BY g.brand_id, g.connected_at").fetchall()
        pending_batches = conn.execute(
            "SELECT b.brand_id, count(*) AS pending FROM outreach_batches b"
            " JOIN outreach_recipients r USING (batch_id)"
            " WHERE b.state='approved' AND r.state='pending'"
            " GROUP BY b.brand_id").fetchall()
    queue = {r['brand_id']: r['pending'] for r in pending_batches}
    brands: dict = {}
    for r in rows:
        acct = _acct_out(r)
        acct['syncCursorSet'] = bool(r.get('sync_page_token'))
        b = brands.setdefault(r['brand_id'], {
            'brandId': r['brand_id'], 'brandName': r['brand_name'],
            'isDemo': r['is_demo'], 'accounts': [],
            'pendingApprovedSends': queue.get(r['brand_id'], 0)})
        b['accounts'].append(acct)
    return {'demoMode': _demo_mode(),
            'brands': sorted(brands.values(), key=lambda x: x['brandId']),
            'runner': runner_daemon.status(),
            'note': ('읽기 전용 상태 화면입니다. 발송은 승인된 배치만 러너가 '
                     '재개하며, 여기서 발송·동의 변경을 실행하지 않습니다.')}
