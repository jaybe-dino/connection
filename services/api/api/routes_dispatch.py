"""틱톡샵 대량 발송 P0 — 반자동 모드 (TIKTOKSHOP_DISPATCH_PLAN.md §8).

배치 작성 → OUTBOUND 게이트 접수 → 사람 승인 → 셀러센터 CSV 내보내기
→ (운영자가 셀러센터 업로드) → 결과 CSV 가져오기 → 상태·성과 추적.

가드레일: 배치 상한 100명 · 90일 재발송 금지 · 노쇼(NO_CONTENT) 자동 표시.
파트너 API 승인 후(P1) CSV 자리를 API 호출로 교체한다 — 화면·데이터 동일.
"""

import csv
import io
import json
import hashlib
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import Header, APIRouter, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from .db import connect, ledger_append
from .dispatch_evidence import parse_results, validate_transition, TIMES

router = APIRouter()

BATCH_CAP = 100                 # 회당 발송 상한 (틱톡 스팸 정책 보호)
RESEND_BAN_DAYS = 90

DISPATCH_STATES = ("DRAFT", "READY", "INVITED", "ACCEPTED", "DECLINED", "EXPIRED",
                   "SHIPPED", "DELIVERED", "CONTENT_POSTED", "SETTLED",
                   "NO_CONTENT", "RETURNED", "LOST")


def _batch_out(conn, b: dict) -> dict:
    counts = {r["state"]: r["n"] for r in conn.execute(
        "SELECT state, count(*) AS n FROM dispatches WHERE batch_id=%s"
        " GROUP BY state", (b["batch_id"],))}
    total = sum(counts.values())
    evidence = {r['state']: r['n'] for r in conn.execute(
        'SELECT state, count(DISTINCT dispatch_id) n FROM dispatch_import_events '
        'WHERE batch_id=%s GROUP BY state', (b['batch_id'],))}
    gmv = conn.execute(
        "SELECT coalesce(sum(gmv),0) AS g, coalesce(sum(commission),0) AS c"
        " FROM dispatches WHERE batch_id=%s", (b["batch_id"],)).fetchone()
    return {
        "batchId": b["batch_id"], "brandId": b["brand_id"],
        "product": b["product_ref"], "commissionPct": b["commission_pct"],
        "unitCost": b["unit_cost"], "capacity": b["capacity"],
        "deadlineDays": b["deadline_days"], "state": b["state"],
        "gateId": str(b["gate_id"]) if b["gate_id"] else None,
        "funnel": {
            "targeted": total,
            "ready": counts.get("READY", 0),
            "invited": evidence.get("INVITED", 0),
            "accepted": evidence.get("ACCEPTED", 0),
            "shipped": evidence.get("SHIPPED", 0),
            "delivered": evidence.get("DELIVERED", 0),
            "posted": evidence.get("CONTENT_POSTED", 0),
            "noShow": counts.get("NO_CONTENT", 0),
        },
        "gmv": float(gmv["g"]), "commission": float(gmv["c"]),
        "metricBasis": "operator_csv_evidence_not_platform_verified",
        "currentStates": counts,
        "createdAt": b["created_at"].isoformat(),
    }


# ── 배치 작성 → 게이트 접수 ─────────────────────────────────────

class BatchIn(BaseModel):
    product_ref: str = Field(min_length=1, max_length=300)
    commission_pct: int = Field(default=10, ge=0, le=80)
    unit_cost: int = Field(default=0, ge=0)
    capacity: int = Field(default=30, ge=1)
    deadline_days: int = Field(default=14, ge=1, le=365)
    campaign_id: str | None = None
    grades: list[str] = []          # 대상 필터: 등급 (비면 전체)


@router.post("/brands/{brand_id}/dispatch-batches")
def create_batch(brand_id: str, body: BatchIn,
                 authorization: str = Header(default=""),
                 x_admin_key: str = Header(default="")) -> dict:
    from . import auth as _auth
    _auth.require_brand(brand_id, authorization, x_admin_key)
    if body.capacity > BATCH_CAP:
        raise HTTPException(400, f"회당 상한 {BATCH_CAP}명 — 스팸 정책 보호")
    batch_id = "dsp-" + uuid4().hex[:6]
    with connect() as conn:
        if body.campaign_id and not conn.execute(
            'SELECT 1 FROM campaigns WHERE campaign_id=%s AND brand_id=%s',
            (body.campaign_id, brand_id)).fetchone():
            raise HTTPException(404, '이 브랜드의 캠페인이 아닙니다')
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', ('dispatch:'+brand_id,))
        # 대상 선정: 셀 멤버 중 필터 + 90일 재발송 금지
        q = ("SELECT c.creator_id, c.handle FROM creators c"
             " JOIN memberships m ON m.creator_id=c.creator_id AND m.brand_id=%s"
             " WHERE NOT EXISTS (SELECT 1 FROM dispatches d"
             "   JOIN dispatch_batches db ON db.batch_id=d.batch_id"
             "   WHERE d.creator_id=c.creator_id AND db.brand_id=%s"
             "   AND (d.invited_at > now() - interval '%s days'"
             "        OR (d.state IN ('DRAFT','READY') AND db.state IN ('PENDING_GATE','READY','SENDING'))"
             "        OR (d.state NOT IN ('DRAFT','READY') AND d.updated_at > now() - interval '90 days')))" % ("%s", "%s", RESEND_BAN_DAYS))
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
def list_batches(brand_id: str,
                 authorization: str = Header(default=""),
                 x_admin_key: str = Header(default="")) -> list[dict]:
    from . import auth as _auth
    _auth.require_brand(brand_id, authorization, x_admin_key)
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM dispatch_batches WHERE brand_id=%s ORDER BY created_at DESC",
            (brand_id,)).fetchall()
        return [_batch_out(conn, b) for b in rows]


def _sync_gate(conn, b: dict) -> dict:
    """게이트 결정 반영: 승인 → READY(CSV 준비, 실제 초대 아님), 보류 → HELD."""
    if b["state"] == "PENDING_GATE" and b["gate_id"]:
        g = conn.execute("SELECT state FROM gate_requests WHERE gate_id=%s",
                         (b["gate_id"],)).fetchone()
        if g and g["state"] == "APPROVED":
            conn.execute("UPDATE dispatch_batches SET state='READY'"
                         " WHERE batch_id=%s", (b["batch_id"],))
            conn.execute("UPDATE dispatches SET state='READY'"
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


def _authorized_batch(conn, batch_id, authorization, x_admin_key):
    from . import auth
    if auth.auth_required() and not auth.current_user(authorization):
        raise HTTPException(401, "로그인이 필요합니다")
    batch = conn.execute("SELECT * FROM dispatch_batches WHERE batch_id=%s", (batch_id,)).fetchone()
    if not batch:
        raise HTTPException(404, "batch not found")
    auth.require_brand(batch["brand_id"], authorization, x_admin_key)
    return batch


@router.get("/dispatch-batches/{batch_id}")
def get_batch(batch_id: str, authorization: str = Header(default=""), x_admin_key: str = Header(default="")) -> dict:
    with connect() as conn:
        b = _authorized_batch(conn, batch_id, authorization, x_admin_key)
        b = _sync_gate(conn, b)
        return _batch_out(conn, b)


@router.get("/dispatch-batches/{batch_id}/rows")
def batch_rows(batch_id: str, authorization: str = Header(default=""), x_admin_key: str = Header(default="")) -> list[dict]:
    with connect() as conn:
        _authorized_batch(conn, batch_id, authorization, x_admin_key)
        rows = conn.execute(
            "SELECT * FROM dispatches WHERE batch_id=%s ORDER BY dispatch_id",
            (batch_id,)).fetchall()
    return [{"dispatchId": r["dispatch_id"], "creatorId": r["creator_id"],
             "handle": r["handle"], "state": r["state"],
             "trackingNo": r["tracking_no"], "contentUrl": r["content_url"],
             "gmv": float(r["gmv"])} for r in rows]


# ── 셀러센터 CSV 내보내기 / 결과 가져오기 (반자동의 핵심) ────────

@router.get("/dispatch-batches/{batch_id}/export.csv")
def export_csv(batch_id: str, authorization: str = Header(default=""), x_admin_key: str = Header(default="")) -> PlainTextResponse:
    """게이트 승인된 배치 → 틱톡 셀러센터 타겟 협업 대량 업로드 형식."""
    with connect() as conn:
        b = _authorized_batch(conn, batch_id, authorization, x_admin_key)
        b = _sync_gate(conn, b)
        if b["state"] not in ("READY", "SENDING", "DONE"):
            raise HTTPException(400, "게이트 승인 후에 내보낼 수 있습니다")
        rows = conn.execute(
            "SELECT handle FROM dispatches WHERE batch_id=%s AND state='READY'"
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
async def import_results(batch_id: str, file: UploadFile,
                         authorization: str = Header(default=""),
                         x_admin_key: str = Header(default="")) -> dict:
    from . import auth as _auth
    with connect() as _c:
        _b = _c.execute("SELECT brand_id FROM dispatch_batches WHERE batch_id=%s",
                        (batch_id,)).fetchone()
    if not _b:
        raise HTTPException(404, "batch not found")
    _auth.require_brand(_b["brand_id"], authorization, x_admin_key)
    """셀러센터 결과 CSV(handle,status[,tracking_no][,content_url][,gmv]) 반영."""
    try:
        rows = parse_results(await file.read(262145))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    updated, unchanged = 0, 0
    with connect() as conn:
        b = _authorized_batch(conn, batch_id, authorization, x_admin_key)
        conn.execute('SELECT 1 FROM dispatch_batches WHERE batch_id=%s FOR UPDATE', (batch_id,))
        b = _sync_gate(conn, b)
        if b['state'] not in ('READY', 'SENDING', 'DONE'):
            raise HTTPException(409, '승인된 배치에만 결과를 반영할 수 있습니다')
        planned = []
        for row in rows:
            existing = conn.execute(
                "SELECT * FROM dispatches WHERE batch_id=%s AND lower(ltrim(handle,'@'))=%s FOR UPDATE",
                (batch_id, row['handle'])).fetchall()
            if len(existing) != 1:
                raise HTTPException(400, f"{row['line']}행: 배치 내 고유 대상과 매칭되지 않습니다")
            current = existing[0]
            if row['state'] == 'CONTENT_POSTED' and not (row.get('content_url') or current['content_url']):
                raise HTTPException(400, f"{row['line']}행: 게시 상태에는 콘텐츠 URL이 필요합니다")
            digest = hashlib.sha256(json.dumps({k:v for k,v in row.items() if k != 'line'},
                sort_keys=True, default=str).encode()).hexdigest()
            if conn.execute('SELECT 1 FROM dispatch_import_events WHERE batch_id=%s AND dispatch_id=%s AND evidence_hash=%s',
                            (batch_id, current['dispatch_id'], digest)).fetchone():
                unchanged += 1
                continue
            try:
                validate_transition(current['state'], row['state'])
            except ValueError as exc:
                raise HTTPException(409, f"{row['line']}행: {exc}") from None
            ts = TIMES.get(row['state'])
            if ts and row.get('occurred_at') and current[ts] and row['occurred_at'] != current[ts]:
                raise HTTPException(409, f"{row['line']}행: 기존 사건 날짜 변경은 정정 검토가 필요합니다")
            if ts and row.get('occurred_at'):
                order = list(TIMES.values())
                if any(current[k] and current[k] > row['occurred_at'] for k in order[:order.index(ts)]):
                    raise HTTPException(409, f"{row['line']}행: 앞 단계보다 이른 사건 날짜입니다")
            planned.append((row, current, digest))
        for row, current, digest in planned:
            sets, vals = ['state=%s', 'updated_at=now()'], [row['state']]
            ts = TIMES.get(row['state'])
            if ts and row.get('occurred_at'):
                sets.append(f'{ts}=%s'); vals.append(row['occurred_at'])
            for field in ('tracking_no', 'content_url', 'gmv'):
                if field in row:
                    sets.append(f'{field}=%s'); vals.append(row[field])
            vals.append(current['dispatch_id'])
            conn.execute(f"UPDATE dispatches SET {', '.join(sets)} WHERE dispatch_id=%s", vals)
            conn.execute('INSERT INTO dispatch_import_events(batch_id,dispatch_id,evidence_hash,state,occurred_at) VALUES(%s,%s,%s,%s,%s)',
                (batch_id, current['dispatch_id'], digest, row['state'], row.get('occurred_at')))
            updated += 1
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
                          {"updated": updated, "unchanged": unchanged})
    return {"updated": updated, "unchanged": unchanged, "skipped": []}
