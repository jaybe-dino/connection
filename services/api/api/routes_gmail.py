"""지메일 연동 — 브랜드별 구글 OAuth 발송 + 답장 인박스 (GMAIL_SETUP.md).

심사 최소화 설계:
  · 구글 권한은 gmail.send(민감 등급) + 이메일 주소 확인용 openid/email 만 쓴다.
    받은편지함 읽기(제한 등급, CASA 보안점검 대상)는 쓰지 않는다.
  · 답장은 발신 메일의 Reply-To를 전용 주소(reply+<brand>@…)로 지정해
    우리 인바운드(POST /inbound/reply)로 직접 수신 → 콘솔 인박스 구성.

GOOGLE_CLIENT_ID 가 없으면 **데모 모드**: 연결·발송이 즉시 성공(기록만).
실키가 들어오면 같은 API 그대로 구글 OAuth·Gmail API 발송으로 전환된다.
"""

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

SCOPES = "https://www.googleapis.com/auth/gmail.send openid email"
# 지메일 계정 한도(무료 ~500/일)보다 보수적으로 + 워밍업 곡선(senders와 동일)
GMAIL_HARD_CAP, WARMUP_START, WARMUP_GROWTH = 450, 20, 1.2
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
    days = max(0, (datetime.now(UTC) - r["connected_at"]).days)
    cap = min(GMAIL_HARD_CAP, int(WARMUP_START * (WARMUP_GROWTH ** days)))
    sent = r["sent_today"] if r["sent_date"] == datetime.now(UTC).date() else 0
    return {"accountId": str(r["account_id"]), "brandId": r["brand_id"],
            "email": r["email"], "state": r["state"],
            "connectedAt": r["connected_at"].isoformat(),
            "todayCap": cap, "sentToday": sent,
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
            " ORDER BY connected_at", (brand_id,)).fetchall()
    return {"demo": _demo_mode(), "inboundReady": _inbound_ready(), "accounts": [_acct_out(r) for r in rows]}


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
            "https://connectioncreator-app-production.up.railway.app/gmail/callback")
        from urllib.parse import urlencode
        q = urlencode({
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "redirect_uri": redirect, "response_type": "code",
            "scope": SCOPES, "state": _sign_state(brand_id),
            "access_type": "offline", "prompt": "consent"})
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
    """구글 동의 후 리다이렉트 — 코드를 토큰으로 교환하고 계정 저장 (실모드)."""
    if error or not code:
        return HTMLResponse(f"<h3>연결 취소됨</h3><p>{escape(error or 'code 없음')}</p>", 400)
    if _demo_mode():
        raise HTTPException(400, "데모 모드에서는 콜백을 쓰지 않습니다")
    brand_id = _verify_state(state)
    import httpx
    redirect = os.environ.get(
        "GOOGLE_REDIRECT_URI",
        "https://connectioncreator-app-production.up.railway.app/gmail/callback")
    tok = httpx.post("https://oauth2.googleapis.com/token", data={
        "code": code, "grant_type": "authorization_code",
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        "redirect_uri": redirect}, timeout=15).json()
    if "access_token" not in tok:
        return HTMLResponse(f"<h3>토큰 교환 실패</h3><pre>{escape(str(tok.get('error','')))}</pre>", 400)
    # id_token(구글이 TLS로 직접 준 값)에서 이메일만 꺼낸다
    payload = tok.get("id_token", "").split(".")[1]
    payload += "=" * (-len(payload) % 4)
    email = json.loads(base64.urlsafe_b64decode(payload)).get("email", "").lower()
    expiry = datetime.now(UTC) + timedelta(seconds=int(tok.get("expires_in", 3600)))
    with connect() as conn:
        r = conn.execute(
            "INSERT INTO gmail_accounts (brand_id, email, access_token,"
            " refresh_token, token_expiry, scopes) VALUES (%s,%s,%s,%s,%s,%s)"
            " ON CONFLICT (brand_id, email) DO UPDATE SET state='connected',"
            " access_token=EXCLUDED.access_token,"
            " refresh_token=COALESCE(NULLIF(EXCLUDED.refresh_token,''),"
            "                        gmail_accounts.refresh_token),"
            " token_expiry=EXCLUDED.token_expiry RETURNING *",
            (brand_id, email, _enc(tok["access_token"]),
             _enc(tok.get("refresh_token", "")), expiry, SCOPES)).fetchone()
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
                         body: str) -> dict | None:
    """연결된 지메일이 있으면 그 주소로 발송. 없으면 None(호출측이 폴백).

    일일 한도(워밍업 곡선) 초과 시에도 None — 도메인 트랙으로 폴백.
    """
    r = conn.execute(
        "SELECT * FROM gmail_accounts WHERE brand_id=%s AND state='connected'"
        " ORDER BY connected_at LIMIT 1 FOR UPDATE", (brand_id,)).fetchone()
    if not r:
        return None
    out = _acct_out(r)
    if out["sentToday"] >= out["todayCap"]:
        return None
    message_id = None
    if not _demo_mode():
        token = _refresh_if_needed(conn, r)
        msg = MIMEText(body, "plain", "utf-8")
        msg["To"], msg["Subject"] = to, subject
        msg["From"] = r["email"]
        msg["Reply-To"] = out["replyTo"]
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        import httpx
        resp = httpx.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"raw": raw}, timeout=20)
        if resp.status_code >= 300:
            raise HTTPException(502, "지메일 발송 실패 — Gmail에서 발송 여부를 확인하세요")
        message_id = resp.json().get("id")
        if not message_id:
            raise HTTPException(502, "발송 결과 확인 필요")
    conn.execute(
        "UPDATE gmail_accounts SET sent_today=CASE WHEN sent_date=CURRENT_DATE"
        " THEN sent_today+1 ELSE 1 END, sent_date=CURRENT_DATE"
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
            sent = send_via_brand_gmail(conn,t['brand_id'],t['creator_email'],'Re: '+t['subject'],m['body'])
            if not sent:
                conn.execute("UPDATE mail_messages SET state='pending_gate' WHERE msg_id=%s",(msg_id,))
                return {'state':'pending_gate'}
            conn.execute("UPDATE mail_messages SET state='sent',sent_via=%s,from_email=%s WHERE msg_id=%s",(sent['via'],sent['fromEmail'],msg_id))
            conn.execute("UPDATE mail_threads SET last_direction='out',last_message_at=now() WHERE thread_id=%s",(thread_id,))
            conn.execute("UPDATE gate_requests SET state='APPROVED',decided_by=%s,decided_at=now(),executed=true WHERE gate_id=%s",(str(u.get('sub') or u.get('kind')),m['gate_id']))
        return {'state':'sent'}
    except Exception:
        with connect() as conn:
            conn.execute("UPDATE mail_messages SET state='review' WHERE msg_id=%s",(msg_id,))
        raise HTTPException(502,'Gmail 보낸편지함에서 발송 여부를 확인하세요. 자동 재발송하지 않습니다.')
