"""커넥션 API — FastAPI 앱.

실행: uvicorn api.main:app --port 8000
기동 시 마이그레이션 적용 + GLOWLAB 시드(멱등).
"""

import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import ai
from .db import connect, ledger_append, ledger_verify, run_migrations
from .seed import seed

log = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    applied = run_migrations()
    if applied:
        log.info("migrations applied: %s", applied)
    if seed():
        log.info("GLOWLAB seed inserted")
    yield


app = FastAPI(title="Connection API", version="0.1.0", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

ALL_LOCALES = ["ko", "th", "en", "vi"]


@app.get("/health")
def health() -> dict:
    with connect() as conn:
        conn.execute("SELECT 1")
    return {"ok": True, "ai": ai.ai_available()}


# ── 게이트 (승인함) ──────────────────────────────────────────────

class GateDecision(BaseModel):
    member_id: str
    note: str | None = None
    reason: str | None = None


def _gate_row(r: dict) -> dict:
    payload = r["payload"] if isinstance(r["payload"], dict) else json.loads(r["payload"])
    return {
        "id": str(r["gate_id"]), "kind": r["kind"], "summary": r["summary"],
        "detail": payload.get("detail", ""), "requestedBy": r["requested_by"],
        "state": r["state"], "at": r["created_at"].isoformat(),
    }


@app.get("/gates")
def list_gates(brand: str = "glowlab") -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM gate_requests WHERE brand_id=%s ORDER BY created_at",
            (brand,)).fetchall()
    return [_gate_row(r) for r in rows]


def _require_member(conn: Any, brand: str, member_id: str) -> dict:
    m = conn.execute(
        "SELECT * FROM team_members WHERE brand_id=%s AND member_id=%s",
        (brand, member_id)).fetchone()
    if not m:
        raise HTTPException(403, f"{member_id}: {brand} 팀 멤버 아님")
    return m


def _decidable(conn: Any, gate_id: str) -> dict:
    g = conn.execute(
        "SELECT * FROM gate_requests WHERE gate_id=%s FOR UPDATE", (gate_id,)).fetchone()
    if not g:
        raise HTTPException(404, "gate not found")
    if g["state"] not in ("PENDING", "HELD"):
        raise HTTPException(409, f"{g['state']}에서는 결정 불가")
    return g


def _execute_gate(conn: Any, g: dict) -> None:
    """승인 시에만 호출되는 실행기 — 게이트 종류별 실제 부수효과."""
    kind = g["kind"]
    if kind == "PUBLISH":
        # 아리 초안 공지를 셀에 게시
        original = "이번 주 주간 피드가 올라왔어요 — 멤버 콘텐츠 4편을 골랐어요 🌿"
        tr = ai.translate(original, "ko", ALL_LOCALES)
        conn.execute(
            "INSERT INTO cell_messages (cell_id, channel, author, author_kind,"
            " original, original_locale, translations)"
            " VALUES ('cell-glowlab-th','notice','ari','ari',%s,'ko',%s)",
            (original, json.dumps(tr, ensure_ascii=False)))
    elif kind == "PAYOUT":
        conn.execute(
            "INSERT INTO notifications (user_id, type, title, body)"
            " VALUES ('c-mai','payout','정산이 실행되었습니다','฿1,500 — PingPong으로 지급')")
    elif kind == "PII":
        conn.execute(
            "UPDATE gate_requests SET payload = payload || '{\"csv_ready\": true}'"
            " WHERE gate_id=%s", (g["gate_id"],))
    elif kind == "OUTBOUND":
        log.info("OUTBOUND 실행 승인 — ESP 연동 전이라 발송 큐 기록만")


@app.post("/gates/{gate_id}/approve")
def approve_gate(gate_id: str, body: GateDecision) -> dict:
    with connect() as conn:
        g = _decidable(conn, gate_id)
        m = _require_member(conn, g["brand_id"], body.member_id)
        if m["role"] != "approver" or g["kind"] not in (m["gate_kinds"] or []):
            raise HTTPException(403, f"{body.member_id}: {g['kind']} 승인 권한 없음")
        conn.execute(
            "UPDATE gate_requests SET state='APPROVED', decided_by=%s, decided_at=now(),"
            " executed=true WHERE gate_id=%s", (body.member_id, gate_id))
        ledger_append(conn, f"user:{body.member_id}", "GATE_APPROVED", gate_id,
                      {"kind": g["kind"]})
        _execute_gate(conn, g)   # 누르기 전엔 아무 일도 일어나지 않는다
        ledger_append(conn, "system", "GATE_EXECUTED", gate_id, {"kind": g["kind"]})
        return {"ok": True, "state": "APPROVED"}


@app.post("/gates/{gate_id}/hold")
def hold_gate(gate_id: str, body: GateDecision) -> dict:
    with connect() as conn:
        g = _decidable(conn, gate_id)
        _require_member(conn, g["brand_id"], body.member_id)
        conn.execute(
            "UPDATE gate_requests SET state='HELD', hold_note=%s WHERE gate_id=%s",
            (body.note, gate_id))
        ledger_append(conn, f"user:{body.member_id}", "GATE_HELD", gate_id, {})
        return {"ok": True, "state": "HELD"}   # 크리에이터에게는 아무 안내도 없음


@app.post("/gates/{gate_id}/reject")
def reject_gate(gate_id: str, body: GateDecision) -> dict:
    with connect() as conn:
        g = _decidable(conn, gate_id)
        m = _require_member(conn, g["brand_id"], body.member_id)
        if m["role"] != "approver" or g["kind"] not in (m["gate_kinds"] or []):
            raise HTTPException(403, f"{body.member_id}: {g['kind']} 결정 권한 없음")
        conn.execute(
            "UPDATE gate_requests SET state='REJECTED', decided_by=%s, decided_at=now()"
            " WHERE gate_id=%s", (body.member_id, gate_id))
        ledger_append(conn, f"user:{body.member_id}", "GATE_REJECTED", gate_id,
                      {"reason": body.reason or ""})
        return {"ok": True, "state": "REJECTED"}


# ── 원장 ─────────────────────────────────────────────────────────

@app.get("/ledger")
def get_ledger(limit: int = 50) -> dict:
    with connect() as conn:
        rows = conn.execute(
            "SELECT seq, ts, actor, event_type, subject, payload, hash"
            " FROM ledger ORDER BY seq DESC LIMIT %s", (limit,)).fetchall()
        ok = ledger_verify(conn)
    return {
        "chain_ok": ok,
        "entries": [
            {"seq": r["seq"], "ts": r["ts"].isoformat(), "actor": r["actor"],
             "type": r["event_type"], "subject": r["subject"],
             "payload": r["payload"], "hash": r["hash"][:8]}
            for r in rows
        ],
    }


# ── 알림 ─────────────────────────────────────────────────────────

@app.get("/notifications")
def list_notifications(user: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM notifications WHERE user_id=%s ORDER BY created_at DESC",
            (user,)).fetchall()
    return [
        {"id": str(r["notif_id"]), "type": r["type"], "title": r["title"],
         "body": r["body"], "read": r["read"], "at": r["created_at"].isoformat()}
        for r in rows
    ]


@app.post("/notifications/{notif_id}/read")
def read_notification(notif_id: str) -> dict:
    with connect() as conn:
        conn.execute("UPDATE notifications SET read=true WHERE notif_id=%s", (notif_id,))
    return {"ok": True}


# ── 셀 메시지 ────────────────────────────────────────────────────

class NewMessage(BaseModel):
    author: str
    author_kind: str = "creator"
    original: str
    original_locale: str


@app.get("/cells/{cell_id}/messages")
def cell_messages(cell_id: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM cell_messages WHERE cell_id=%s ORDER BY at", (cell_id,)).fetchall()
    return [
        {"id": str(r["msg_id"]), "channel": r["channel"], "author": r["author"],
         "authorKind": r["author_kind"], "original": r["original"],
         "originalLocale": r["original_locale"],
         "translations": r["translations"],
         "campaignCardId": r["campaign_id"], "at": r["at"].strftime("%H:%M")}
        for r in rows
    ]


@app.post("/cells/{cell_id}/messages")
def post_cell_message(cell_id: str, body: NewMessage) -> dict:
    tr = ai.translate(body.original, body.original_locale, ALL_LOCALES)
    with connect() as conn:
        r = conn.execute(
            "INSERT INTO cell_messages (cell_id, channel, author, author_kind,"
            " original, original_locale, translations)"
            " VALUES (%s,'chat',%s,%s,%s,%s,%s) RETURNING msg_id",
            (cell_id, body.author, body.author_kind, body.original,
             body.original_locale, json.dumps(tr, ensure_ascii=False))).fetchone()
    return {"id": str(r["msg_id"]), "translations": tr}


# ── 캠페인 ───────────────────────────────────────────────────────

@app.get("/campaigns")
def list_campaigns(brand: str = "glowlab", creator: str | None = None) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM campaigns WHERE brand_id=%s ORDER BY campaign_id", (brand,)
        ).fetchall()
        apps = {}
        ships = {}
        if creator:
            apps = {a["campaign_id"]: a["status"] for a in conn.execute(
                "SELECT campaign_id, status FROM campaign_applications WHERE creator_id=%s",
                (creator,))}
            ships = {s["campaign_id"]: s for s in conn.execute(
                "SELECT * FROM shipments WHERE creator_id=%s", (creator,))}
    out = []
    for r in rows:
        ship = ships.get(r["campaign_id"])
        out.append({
            "id": r["campaign_id"], "brandId": r["brand_id"], "name": r["name"],
            "product": r["product"], "imageEmoji": r["image_emoji"], "usp": r["usp"],
            "rewardType": r["reward_type"], "rewardAmount": r["reward_amount"],
            "affiliatePct": r["affiliate_pct"], "conditions": r["conditions"],
            "capacity": r["capacity"],
            "deadline": r["deadline"].isoformat() if r["deadline"] else None,
            "status": r["status"], "myStatus": apps.get(r["campaign_id"], "none"),
            "tracking": {
                "carrier": ship["carrier"], "trackingNo": ship["tracking_no"],
                "steps": ship["steps"],
            } if ship else None,
        })
    return out


class Apply(BaseModel):
    creator_id: str


@app.post("/campaigns/{campaign_id}/apply")
def apply_campaign(campaign_id: str, body: Apply) -> dict:
    with connect() as conn:
        conn.execute(
            "INSERT INTO campaign_applications (campaign_id, creator_id)"
            " VALUES (%s,%s) ON CONFLICT DO NOTHING", (campaign_id, body.creator_id))
    return {"ok": True, "myStatus": "applied"}


# ── 내 패스 (본인 수정 → 실시간 반영 + 원장) ─────────────────────

class FieldUpdate(BaseModel):
    field: str
    value: str


@app.get("/me/{creator_id}")
def get_me(creator_id: str) -> dict:
    with connect() as conn:
        c = conn.execute(
            "SELECT * FROM creators WHERE creator_id=%s", (creator_id,)).fetchone()
        if not c:
            raise HTTPException(404, "creator not found")
        fields = conn.execute(
            "SELECT field, value, basis, updated_at FROM creator_fields"
            " WHERE creator_id=%s", (creator_id,)).fetchall()
        brands = [m["brand_id"] for m in conn.execute(
            "SELECT brand_id FROM memberships WHERE creator_id=%s", (creator_id,))]
    return {
        "id": c["creator_id"], "handle": c["handle"], "platform": c["platform"],
        "displayName": c["display_name"], "verified": c["verified"],
        "locale": c["locale"], "grade": c["grade"],
        "completionRate": c["completion_rate"], "memberships": brands,
        "fields": {f["field"]: {"value": f["value"], "basis": f["basis"]} for f in fields},
    }


@app.put("/me/{creator_id}/fields")
def update_field(creator_id: str, body: FieldUpdate) -> dict:
    with connect() as conn:
        conn.execute(
            "INSERT INTO creator_fields (creator_id, field, value, updated_at)"
            " VALUES (%s,%s,%s,now())"
            " ON CONFLICT (creator_id, field) DO UPDATE SET value=EXCLUDED.value,"
            " updated_at=now()", (creator_id, body.field, body.value))
        ledger_append(conn, f"user:{creator_id}", "PROFILE_UPDATED", creator_id,
                      {"field": body.field})
    return {"ok": True}


class LocaleUpdate(BaseModel):
    locale: str


@app.put("/me/{creator_id}/locale")
def update_locale(creator_id: str, body: LocaleUpdate) -> dict:
    if body.locale not in ALL_LOCALES:
        raise HTTPException(400, f"unsupported locale: {body.locale}")
    with connect() as conn:
        conn.execute("UPDATE creators SET locale=%s WHERE creator_id=%s",
                     (body.locale, creator_id))
    return {"ok": True}


# ── 콘솔 DB 뷰 ───────────────────────────────────────────────────

@app.get("/db/creators")
def db_creators(brand: str = "glowlab") -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT c.*, array_agg(cf.field || '|' || cf.basis)"
            "  FILTER (WHERE cf.field IS NOT NULL) AS fb"
            " FROM creators c"
            " JOIN memberships m ON m.creator_id=c.creator_id AND m.brand_id=%s"
            " LEFT JOIN creator_fields cf ON cf.creator_id=c.creator_id"
            " GROUP BY c.creator_id", (brand,)).fetchall()
    return [
        {"id": r["creator_id"], "handle": r["handle"], "platform": r["platform"],
         "grade": r["grade"], "verified": r["verified"],
         "fieldsWithBasis": [
             {"field": x.split("|")[0], "basis": x.split("|")[1]}
             for x in (r["fb"] or [])
         ]}
        for r in rows
    ]


# ── 아리 채팅 ────────────────────────────────────────────────────

class AriChat(BaseModel):
    brand: str = "glowlab"
    message: str
    history: list[dict] = []


@app.post("/ari/chat")
def ari_chat(body: AriChat) -> dict:
    with connect() as conn:
        pending = conn.execute(
            "SELECT count(*) AS n FROM gate_requests WHERE brand_id=%s"
            " AND state IN ('PENDING','HELD')", (body.brand,)).fetchone()["n"]
        campaigns = conn.execute(
            "SELECT count(*) AS n FROM campaigns WHERE brand_id=%s AND status='open'",
            (body.brand,)).fetchone()["n"]
        brand = conn.execute(
            "SELECT name FROM brands WHERE brand_id=%s", (body.brand,)).fetchone()
    context = f"승인 대기 게이트 {pending}건 · 진행 캠페인 {campaigns}개 · 태국 셀 발화 34건(어제)"
    reply = ai.ari_reply(brand["name"] if brand else body.brand, context,
                         body.history[-8:], body.message)
    return {"reply": reply, "ai": ai.ai_available()}
