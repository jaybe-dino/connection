"""틱톡샵 대량 발송 P0 — 반자동 모드 (TIKTOKSHOP_DISPATCH_PLAN.md §8).

배치 작성 → OUTBOUND 게이트 접수 → 사람 승인 → 셀러센터 CSV 내보내기
→ (운영자가 셀러센터 업로드) → 결과 CSV 가져오기 → 상태·성과 추적.

가드레일: 배치 상한 100명 · 90일 재발송 금지 · 노쇼(NO_CONTENT) 자동 표시.
파트너 API 승인 후(P1) CSV 자리를 API 호출로 교체한다 — 화면·데이터 동일.
"""

import csv
import io
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from .db import connect, ledger_append

router = APIRouter()

BATCH_CAP = 100                 # 회당 발송 상한 (틱톡 스팸 정책 보호)
RESEND_BAN_DAYS = 90

DISPATCH_STATES = ("DRAFT", "INVITED", "ACCEPTED", "DECLINED", "EXPIRED",
                   "SHIPPED", "DELIVERED", "CONTENT_POSTED", "SETTLED",
                   "NO_CONTENT", "RETURNED", "LOST")


def _batch_out(conn, b: dict) -> dict:
    counts = {r["state"]: r["n"] for r in conn.execute(
        "SELECT state, count(*) AS n FROM dispatches WHERE batch_id=%s"
        " GROUP BY state", (b["batch_id"],))}
    total = sum(counts.values())
    gmv = conn.execute(
        "SELECT coalesce(sum(gmv),0) AS g, coalesce(sum(commission),0) AS c"
        " FROM dispatches WHERE batch_id=%s", (b["batch_id"],)).fetchone()
    reached = lambda *states: sum(counts.get(s, 0) for s in states)
    return {
        "batchId": b["batch_id"], "brandId": b["brand_id"],
        "product": b["product_ref"], "commissionPct": b["commission_pct"],
        "unitCost": b["unit_cost"], "capacity": b["capacity"],
        "deadlineDays": b["deadline_days"], "state": b["state"],
        "gateId": str(b["gate_id"]) if b["gate_id"] else None,
        "funnel": {
            "invited": total,
            "accepted": reached("ACCEPTED", "SHIPPED", "DELIVERED",
                                "CONTENT_POSTED", "SETTLED", "NO_CONTENT"),
            "shipped": reached("SHIPPED", "DELIVERED", "CONTENT_POSTED",
                               "SETTLED", "NO_CONTENT"),
            "delivered": reached("DELIVERED", "CONTENT_POSTED", "SETTLED",
                                 "NO_CONTENT"),
            "posted": reached("CONTENT_POSTED", "SETTLED"),
            "noShow": counts.get("NO_CONTENT", 0),
        },
        "gmv": float(gmv["g"]), "commission": float(gmv["c"]),
        "createdAt": b["created_at"].isoformat(),
    }


# ── 배치 작성 → 게이트 접수 ─────────────────────────────────────

class BatchIn(BaseModel):
    product_ref: str
    commission_pct: int = 10
    unit_cost: int = 0
    capacity: int = 30
    deadline_days: int = 14
    campaign_id: str | None = None
    grades: list[str] = []          # 대상 필터: 등급 (비면 전체)


@router.post("/brands/{brand_id}/dispatch-batches")
def create_batch(brand_id: str, body: BatchIn) -> dict:
    if body.capacity > BATCH_CAP:
        raise HTTPException(400, f"회당 상한 {BATCH_CAP}명 — 스팸 정책 보호")
    batch_id = "dsp-" + uuid4().hex[:6]
    with connect() as conn:
        # 대상 선정: 셀 멤버 중 필터 + 90일 재발송 금지
        q = ("SELECT c.creator_id, c.handle FROM creators c"
             " JOIN memberships m ON m.creator_id=c.creator_id AND m.brand_id=%s"
             " WHERE NOT EXISTS (SELECT 1 FROM dispatches d"
             "   JOIN dispatch_batches db ON db.batch_id=d.batch_id"
             "   WHERE d.creator_id=c.creator_id AND db.brand_id=%s"
             "   AND d.invited_at > now() - interval '%s days')" % ("%s", "%s", RESEND_BAN_DAYS))
        params: list = [brand_id, brand_id]
        if body.grades:
            q += " AND c.grade = ANY(%s)"
            params.append(body.grades)
        q += " ORDER BY c.completion_rate DESC LIMIT %s"
        params.append(body.capacity)
        targets = conn.execute(q, params).fetchall()
        if not targets:
            raise HTTPException(400, "대상이 없습니다 (필터·90일 재발송 금지 확인)")

        conn.execute(
            "INSERT INTO dispatch_batches (batch_id, brand_id, campaign_id,"
            " product_ref, commission_pct, unit_cost, capacity, deadline_days,"
            " target_filter, state)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'PENDING_GATE')",
            (batch_id, brand_id, body.campaign_id, body.product_ref,
             body.commission_pct, body.unit_cost, body.capacity,
             body.deadline_days, json.dumps({"grades": body.grades})))
        for t in targets:
            conn.execute(
                "INSERT INTO dispatches (batch_id, creator_id, handle, state)"
                " VALUES (%s,%s,%s,'DRAFT')", (batch_id, t["creator_id"], t["handle"]))

        # OUTBOUND 게이트: 명단·원가 합계가 승인 요약에
        total_cost = body.unit_cost * len(targets)
        names = " ".join("@" + t["handle"] for t in targets[:20])
        gate = conn.execute(
            "INSERT INTO gate_requests (brand_id, kind, summary, payload, requested_by)"
            " VALUES (%s,'OUTBOUND',%s,%s,'ari:dispatch') RETURNING gate_id",
            (brand_id,
             f"틱톡샵 샘플 발송 {len(targets)}명 · {body.product_ref}"
             f" · 원가 ₩{total_cost:,} · 커미션 {body.commission_pct}%",
             json.dumps({"batch_id": batch_id, "targets": names},
                        ensure_ascii=False))).fetchone()
        conn.execute("UPDATE dispatch_batches SET gate_id=%s WHERE batch_id=%s",
                     (gate["gate_id"], batch_id))
        ledger_append(conn, f"ari:{brand_id}", "DISPATCH_BATCH_CREATED", batch_id,
                      {"targets": len(targets), "cost": total_cost,
                       "product": body.product_ref})
        b = conn.execute("SELECT * FROM dispatch_batches WHERE batch_id=%s",
                         (batch_id,)).fetchone()
        return _batch_out(conn, b)


@router.get("/brands/{brand_id}/dispatch-batches")
def list_batches(brand_id: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM dispatch_batches WHERE brand_id=%s ORDER BY created_at DESC",
            (brand_id,)).fetchall()
        return [_batch_out(conn, b) for b in rows]


def _sync_gate(conn, b: dict) -> dict:
    """게이트 결정 반영: 승인 → SENDING(초대 시작), 보류 → HELD."""
    if b["state"] == "PENDING_GATE" and b["gate_id"]:
        g = conn.execute("SELECT state FROM gate_requests WHERE gate_id=%s",
                         (b["gate_id"],)).fetchone()
        if g and g["state"] == "APPROVED":
            conn.execute("UPDATE dispatch_batches SET state='SENDING'"
                         " WHERE batch_id=%s", (b["batch_id"],))
            conn.execute("UPDATE dispatches SET state='INVITED', invited_at=now()"
                         " WHERE batch_id=%s AND state='DRAFT'", (b["batch_id"],))
            ledger_append(conn, "system", "DISPATCH_BATCH_APPROVED",
                          b["batch_id"], {})
            b = conn.execute("SELECT * FROM dispatch_batches WHERE batch_id=%s",
                             (b["batch_id"],)).fetchone()
        elif g and g["state"] in ("HELD", "REJECTED"):
            conn.execute("UPDATE dispatch_batches SET state='HELD'"
                         " WHERE batch_id=%s", (b["batch_id"],))
            b = conn.execute("SELECT * FROM dispatch_batches WHERE batch_id=%s",
                             (b["batch_id"],)).fetchone()
    return b


@router.get("/dispatch-batches/{batch_id}")
def get_batch(batch_id: str) -> dict:
    with connect() as conn:
        b = conn.execute("SELECT * FROM dispatch_batches WHERE batch_id=%s",
                         (batch_id,)).fetchone()
        if not b:
            raise HTTPException(404, "batch not found")
        b = _sync_gate(conn, b)
        return _batch_out(conn, b)


@router.get("/dispatch-batches/{batch_id}/rows")
def batch_rows(batch_id: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM dispatches WHERE batch_id=%s ORDER BY dispatch_id",
            (batch_id,)).fetchall()
    return [{"dispatchId": r["dispatch_id"], "creatorId": r["creator_id"],
             "handle": r["handle"], "state": r["state"],
             "trackingNo": r["tracking_no"], "contentUrl": r["content_url"],
             "gmv": float(r["gmv"])} for r in rows]


# ── 셀러센터 CSV 내보내기 / 결과 가져오기 (반자동의 핵심) ────────

@router.get("/dispatch-batches/{batch_id}/export.csv")
def export_csv(batch_id: str) -> PlainTextResponse:
    """게이트 승인된 배치 → 틱톡 셀러센터 타겟 협업 대량 업로드 형식."""
    with connect() as conn:
        b = conn.execute("SELECT * FROM dispatch_batches WHERE batch_id=%s",
                         (batch_id,)).fetchone()
        if not b:
            raise HTTPException(404, "batch not found")
        b = _sync_gate(conn, b)
        if b["state"] not in ("SENDING", "DONE"):
            raise HTTPException(400, "게이트 승인 후에 내보낼 수 있습니다")
        rows = conn.execute(
            "SELECT handle FROM dispatches WHERE batch_id=%s AND state='INVITED'"
            " ORDER BY dispatch_id", (batch_id,)).fetchall()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["creator_username", "product_id", "commission_rate",
                "free_sample", "valid_days"])
    for r in rows:
        w.writerow([r["handle"], b["product_ref"],
                    f"{b['commission_pct']}%", "Y", b["deadline_days"]])
    return PlainTextResponse(out.getvalue(), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{batch_id}.csv"'})


_CSV_STATE = {"accepted": "ACCEPTED", "declined": "DECLINED",
              "expired": "EXPIRED", "shipped": "SHIPPED",
              "delivered": "DELIVERED", "posted": "CONTENT_POSTED",
              "settled": "SETTLED", "returned": "RETURNED", "lost": "LOST"}
_STATE_TS = {"ACCEPTED": "accepted_at", "SHIPPED": "shipped_at",
             "DELIVERED": "delivered_at", "CONTENT_POSTED": "content_at"}


@router.post("/dispatch-batches/{batch_id}/import")
async def import_results(batch_id: str, file: UploadFile) -> dict:
    """셀러센터 결과 CSV(handle,status[,tracking_no][,content_url][,gmv]) 반영."""
    text = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    updated, skipped = 0, []
    with connect() as conn:
        for row in reader:
            handle = (row.get("handle") or row.get("creator_username") or "").strip()
            status = (row.get("status") or "").strip().lower()
            state = _CSV_STATE.get(status)
            if not handle or not state:
                skipped.append(handle or "?")
                continue
            sets = ["state=%s", "updated_at=now()"]
            vals: list = [state]
            if ts := _STATE_TS.get(state):
                sets.append(f"{ts}=now()")
            if row.get("tracking_no"):
                sets.append("tracking_no=%s"); vals.append(row["tracking_no"].strip())
            if row.get("content_url"):
                sets.append("content_url=%s"); vals.append(row["content_url"].strip())
            if row.get("gmv"):
                try:
                    sets.append("gmv=%s"); vals.append(float(row["gmv"]))
                except ValueError:
                    pass
            vals += [batch_id, handle]
            n = conn.execute(
                f"UPDATE dispatches SET {', '.join(sets)}"
                " WHERE batch_id=%s AND handle=%s", vals).rowcount
            updated += n
            if not n:
                skipped.append(handle)
        # 게시 기한 초과 → 노쇼 표시 (등급·다음 배치 제외의 근거)
        b = conn.execute("SELECT * FROM dispatch_batches WHERE batch_id=%s",
                         (batch_id,)).fetchone()
        if b:
            conn.execute(
                "UPDATE dispatches SET state='NO_CONTENT', updated_at=now()"
                " WHERE batch_id=%s AND state='DELIVERED'"
                " AND delivered_at < now() - make_interval(days => %s)",
                (batch_id, b["deadline_days"]))
            ledger_append(conn, "system", "DISPATCH_RESULTS_IMPORTED", batch_id,
                          {"updated": updated, "skipped": len(skipped)})
    return {"updated": updated, "skipped": skipped}
