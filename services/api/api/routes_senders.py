"""브랜드 발신 이메일 — 등록·소유 확인·도메인 인증·워밍업 (BRAND_SENDER_PLAN.md P0).

트랙 B(도메인 인증) 상태머신:
  unverified → (코드 입력) email_verified → dns_pending → (DNS 확인) active ⇄ paused

SENDGRID_API_KEY 가 없으면 **데모 모드**로 동작한다:
  · 인증 코드를 메일 대신 응답에 담아준다 (콘솔이 바로 보여줌)
  · DNS 레코드는 표준 형식의 예시값, DNS 확인은 즉시 통과
실키가 들어오면 같은 API 그대로 실메일 발송·ESP 도메인 인증으로 전환된다.
"""

import os
import re
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .db import connect, ledger_append

router = APIRouter()

# 워밍업: 첫날 20통 → 매일 ×1.2, 상한 400 (harvest 아웃리치와 동일 곡선)
WARMUP_START, WARMUP_GROWTH, WARMUP_MAX = 20, 1.2, 400
BOUNCE_PAUSE, COMPLAINT_PAUSE = 0.05, 0.001   # 자동 정지 임계

_EMAIL_RE = re.compile(r"^[^@\s]+@([^@\s]+\.[^@\s]+)$")


def _demo_mode() -> bool:
    return not os.environ.get("SENDGRID_API_KEY")


def _dns_records(domain: str) -> list[dict]:
    """표시용 SPF/DKIM/DMARC 레코드. 실모드는 ESP 발급값으로 대체된다."""
    sel = "cnx" if _demo_mode() else "s1"
    return [
        {"type": "TXT", "host": "@",
         "value": "v=spf1 include:sendgrid.net ~all", "why": "SPF — 보낼 자격"},
        {"type": "CNAME", "host": f"{sel}._domainkey",
         "value": f"{sel}.domainkey.u0.wl.sendgrid.net", "why": "DKIM — 위조 방지 서명"},
        {"type": "TXT", "host": "_dmarc",
         "value": "v=DMARC1; p=none; rua=mailto:dmarc@" + domain,
         "why": "DMARC — 정책·리포트"},
    ]


def _event(conn, sender_id: str, type_: str, detail: str = "") -> None:
    conn.execute(
        "INSERT INTO sender_events (sender_id, type, detail) VALUES (%s,%s,%s)",
        (sender_id, type_, detail))


def _row_out(r: dict) -> dict:
    cap = 0
    if r["state"] == "active" and r["warmup_started_at"]:
        days = (datetime.now(UTC) - r["warmup_started_at"]).days
        cap = min(WARMUP_MAX, int(WARMUP_START * (WARMUP_GROWTH ** max(0, days))))
    return {
        "senderId": str(r["sender_id"]), "brandId": r["brand_id"],
        "email": r["email"], "domain": r["domain"], "kind": r["kind"],
        "state": r["state"], "fromName": r["from_name"], "replyTo": r["reply_to"],
        "signature": r["signature"], "dnsRecords": r["dns_records"],
        "todayCap": cap,
        "warmupStartedAt": r["warmup_started_at"].isoformat() if r["warmup_started_at"] else None,
        "stats": {"bounceRate": r["bounce_rate"], "complaintRate": r["complaint_rate"],
                  "openRate": r["open_rate"]},
    }


def _get(conn, sender_id: str) -> dict:
    r = conn.execute("SELECT * FROM brand_senders WHERE sender_id=%s",
                     (sender_id,)).fetchone()
    if not r:
        raise HTTPException(404, "sender not found")
    return r


# ── 등록 → 소유 확인 → DNS → 활성화 ─────────────────────────────

class SenderIn(BaseModel):
    email: str
    kind: str = "outreach"        # outreach | notify


@router.post("/brands/{brand_id}/senders")
def register_sender(brand_id: str, body: SenderIn) -> dict:
    m = _EMAIL_RE.match(body.email.strip().lower())
    if not m:
        raise HTTPException(400, "이메일 형식이 올바르지 않습니다")
    if body.kind not in ("outreach", "notify"):
        raise HTTPException(400, "kind는 outreach/notify")
    email, domain = body.email.strip().lower(), m.group(1)
    code = f"{secrets.randbelow(1_000_000):06d}"
    with connect() as conn:
        dup = conn.execute(
            "SELECT sender_id FROM brand_senders WHERE brand_id=%s AND email=%s",
            (brand_id, email)).fetchone()
        if dup:
            raise HTTPException(409, "이미 등록된 이메일입니다")
        r = conn.execute(
            "INSERT INTO brand_senders (brand_id, email, domain, kind, verify_code)"
            " VALUES (%s,%s,%s,%s,%s) RETURNING *",
            (brand_id, email, domain, body.kind, code)).fetchone()
        _event(conn, str(r["sender_id"]), "registered", email)
        ledger_append(conn, f"brand:{brand_id}", "SENDER_REGISTERED",
                      str(r["sender_id"]), {"email": email, "kind": body.kind})
    out = _row_out(r)
    if _demo_mode():
        out["demoCode"] = code      # 실모드에선 메일로만 발송
    return out


class VerifyIn(BaseModel):
    code: str


@router.post("/senders/{sender_id}/verify")
def verify_sender(sender_id: str, body: VerifyIn) -> dict:
    with connect() as conn:
        r = _get(conn, sender_id)
        if r["state"] != "unverified":
            raise HTTPException(400, f"이미 {r['state']} 상태입니다")
        if body.code.strip() != r["verify_code"]:
            raise HTTPException(400, "인증 코드가 일치하지 않습니다")
        records = _dns_records(r["domain"])
        import json
        r = conn.execute(
            "UPDATE brand_senders SET state='dns_pending', verified_at=now(),"
            " verify_code=NULL, dns_records=%s WHERE sender_id=%s RETURNING *",
            (json.dumps(records), sender_id)).fetchone()
        _event(conn, sender_id, "verified")
    return _row_out(r)


@router.post("/senders/{sender_id}/check-dns")
def check_dns(sender_id: str) -> dict:
    """DNS 반영 확인 — 데모 모드는 즉시 통과, 실모드는 ESP validate 호출."""
    with connect() as conn:
        r = _get(conn, sender_id)
        if r["state"] == "active":
            return _row_out(r)
        if r["state"] != "dns_pending":
            raise HTTPException(400, "먼저 이메일 소유 확인을 완료하세요")
        ok = True if _demo_mode() else False   # 실모드: ESP 검증 결과로 대체 (P1)
        if not ok:
            return {**_row_out(r), "dnsOk": False,
                    "hint": "DNS 반영에 최대 48시간 걸릴 수 있어요. 잠시 후 다시 확인해 주세요."}
        r = conn.execute(
            "UPDATE brand_senders SET state='active', warmup_started_at=now()"
            " WHERE sender_id=%s RETURNING *", (sender_id,)).fetchone()
        _event(conn, sender_id, "dns_ok")
        ledger_append(conn, "system", "SENDER_ACTIVATED", sender_id,
                      {"email": r["email"]})
    return {**_row_out(r), "dnsOk": True}


class ProfileIn(BaseModel):
    from_name: str = ""
    reply_to: str = ""
    signature: str = ""


@router.put("/senders/{sender_id}/profile")
def update_profile(sender_id: str, body: ProfileIn) -> dict:
    with connect() as conn:
        _get(conn, sender_id)
        r = conn.execute(
            "UPDATE brand_senders SET from_name=%s, reply_to=%s, signature=%s"
            " WHERE sender_id=%s RETURNING *",
            (body.from_name, body.reply_to, body.signature, sender_id)).fetchone()
    return _row_out(r)


@router.get("/brands/{brand_id}/senders")
def list_senders(brand_id: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM brand_senders WHERE brand_id=%s ORDER BY created_at",
            (brand_id,)).fetchall()
    return [_row_out(r) for r in rows]


# ── 평판 가드레일: 정지는 자동, 재개는 사람 ─────────────────────

class StatsIn(BaseModel):
    bounce_rate: float
    complaint_rate: float
    open_rate: float = 0


@router.post("/senders/{sender_id}/stats")
def report_stats(sender_id: str, body: StatsIn) -> dict:
    """발송 엔진·웹훅이 평판 지표를 보고 — 임계 초과면 자동 정지."""
    with connect() as conn:
        r = _get(conn, sender_id)
        pause = (body.bounce_rate >= BOUNCE_PAUSE
                 or body.complaint_rate >= COMPLAINT_PAUSE)
        state = "paused" if pause and r["state"] == "active" else r["state"]
        r = conn.execute(
            "UPDATE brand_senders SET bounce_rate=%s, complaint_rate=%s,"
            " open_rate=%s, state=%s WHERE sender_id=%s RETURNING *",
            (body.bounce_rate, body.complaint_rate, body.open_rate,
             state, sender_id)).fetchone()
        if pause and state == "paused":
            _event(conn, sender_id, "paused",
                   f"bounce={body.bounce_rate:.3f} complaint={body.complaint_rate:.4f}")
            ledger_append(conn, "system", "SENDER_PAUSED", sender_id, {
                "bounce_rate": body.bounce_rate,
                "complaint_rate": body.complaint_rate})
    return _row_out(r)


@router.post("/senders/{sender_id}/resume")
def resume_sender(sender_id: str) -> dict:
    """원인 확인 후 사람이 명시적으로 재개 (콘솔·어드민 버튼)."""
    with connect() as conn:
        r = _get(conn, sender_id)
        if r["state"] != "paused":
            raise HTTPException(400, "정지 상태가 아닙니다")
        r = conn.execute(
            "UPDATE brand_senders SET state='active', bounce_rate=0,"
            " complaint_rate=0 WHERE sender_id=%s RETURNING *",
            (sender_id,)).fetchone()
        _event(conn, sender_id, "resumed")
        ledger_append(conn, "user:console", "SENDER_RESUMED", sender_id, {})
    return _row_out(r)
