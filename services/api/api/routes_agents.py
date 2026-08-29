"""에이전트 라우트 — 게이트 접수 · 캠페인 등록 · 인바운드 판정.

에이전트(러너)가 밖으로 나가는 행동을 여기로 접수하고, 사람 승인 후 실행한다.
"""

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import ai
from .db import connect, ledger_append

router = APIRouter()

ALL_LOCALES = ["ko", "th", "en", "vi"]


def _j(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False)


# ── 게이트 접수 (에이전트가 승인 요청을 올리는 통로) ──────────────

class GateIn(BaseModel):
    brand_id: str = "glowlab"
    kind: str                      # PII | PAYOUT | OUTBOUND | PUBLISH
    summary: str
    detail: str = ""
    payload: dict[str, Any] = {}
    requested_by: str = "ari:glowlab"


@router.post("/gates")
def file_gate(body: GateIn) -> dict:
    if body.kind not in ("PII", "PAYOUT", "OUTBOUND", "PUBLISH"):
        raise HTTPException(400, "kind는 PII/PAYOUT/OUTBOUND/PUBLISH")
    with connect() as conn:
        row = conn.execute(
            "INSERT INTO gate_requests (brand_id, kind, summary, payload, requested_by)"
            " VALUES (%s,%s,%s,%s,%s) RETURNING gate_id",
            (body.brand_id, body.kind, body.summary,
             _j({"detail": body.detail, **body.payload}), body.requested_by)).fetchone()
        ledger_append(conn, body.requested_by, "GATE_REQUESTED", str(row["gate_id"]),
                      {"brand": body.brand_id, "kind": body.kind,
                       "summary": body.summary})
    return {"gateId": str(row["gate_id"]), "state": "PENDING"}


@router.get("/gates/{gate_id}")
def get_gate(gate_id: str) -> dict:
    with connect() as conn:
        r = conn.execute(
            "SELECT gate_id, kind, state, summary FROM gate_requests WHERE gate_id=%s",
            (gate_id,)).fetchone()
    if not r:
        raise HTTPException(404, "gate not found")
    return {"gateId": str(r["gate_id"]), "kind": r["kind"], "state": r["state"],
            "summary": r["summary"]}


# ── 캠페인 등록 (콘솔 등록 탭 → 목록+셀 공지 동시 게시) ──────────

class CampaignIn(BaseModel):
    brand_id: str = "glowlab"
    name: str
    product: str
    reward_type: str = "paid"          # paid | gifted | affiliate
    reward_amount: int | None = None
    affiliate_pct: int | None = None
    usp: str = ""
    conditions: list[str] = []
    capacity: int = 30
    deadline: str | None = None
    image_emoji: str = "🧴"


@router.post("/campaigns")
def create_campaign(body: CampaignIn) -> dict:
    from uuid import uuid4

    campaign_id = "cmp-" + uuid4().hex[:6]
    with connect() as conn:
        conn.execute(
            "INSERT INTO campaigns (campaign_id, brand_id, name, product, image_emoji,"
            " usp, reward_type, reward_amount, affiliate_pct, conditions, capacity,"
            " deadline, status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'open')",
            (campaign_id, body.brand_id, body.name, body.product, body.image_emoji,
             body.usp, body.reward_type, body.reward_amount, body.affiliate_pct,
             _j(body.conditions), body.capacity, body.deadline))
        ledger_append(conn, f"brand:{body.brand_id}", "CAMPAIGN_PUBLISHED",
                      campaign_id, {"name": body.name, "type": body.reward_type})

    # 게시 시 타깃 언어 일괄 번역 → 셀 공지 동시 게시 (기획 §4.5)
    notice = f"[캠페인] {body.name} — 정원 {body.capacity}명" + (
        f" · 마감 {body.deadline}" if body.deadline else "")
    tr = ai.translate(notice, "ko", ALL_LOCALES)
    with connect() as conn:
        cell = conn.execute(
            "SELECT cell_id FROM cells WHERE brand_id=%s LIMIT 1",
            (body.brand_id,)).fetchone()
        if cell:
            conn.execute(
                "INSERT INTO cell_messages (cell_id, channel, author, author_kind,"
                " original, original_locale, translations, campaign_id)"
                " VALUES (%s,'notice','ari','ari',%s,'ko',%s,%s)",
                (cell["cell_id"], notice, _j(tr), campaign_id))
        ledger_append(conn, "system", "CAMPAIGN_TRANSLATED", campaign_id,
                      {"locales": [l for l in ALL_LOCALES if l != "ko"]})
    return {"campaignId": campaign_id, "noticePosted": bool(cell)}


# ── 인바운드 판정 (폼 유입 → 즉시 4축 판정 · 자동 회신) ──────────

class InboundIn(BaseModel):
    """폼 항목은 4개뿐 — 늘리면 이탈 급증 (기획 §4.3)."""

    handle: str
    country: str = "TH"
    product_used: str = ""
    contact: str = ""
    brand_id: str = "glowlab"
    # 공개 지표 (실서비스는 SNS 공개 프로필에서 fetch — 폼 접수 시 병행 조회)
    followers: int | None = None
    engagement_rate: float | None = None
    sponsor_ratio_90d: float | None = None


@router.post("/inbound")
def inbound_judge(body: InboundIn) -> dict:
    """유입 즉시 판정·회신 — '90초'는 사람 기준이고 여기선 요청 안에 끝난다."""
    from harvest.judgment import BrandFit, judge

    with connect() as conn:
        profile = conn.execute(
            "SELECT fields FROM brand_profile_versions WHERE brand_id=%s"
            " ORDER BY version DESC LIMIT 1", (body.brand_id,)).fetchone()
    fields = (profile or {}).get("fields") or {}
    banned_raw = fields.get("banned_words", {})
    banned = tuple(w.strip() for w in
                   (banned_raw.get("value", "") if isinstance(banned_raw, dict) else "")
                   .split(",") if w.strip())

    fit = BrandFit(categories=("beauty", "skincare", "suncare"),
                   banned_words=banned, target_countries=("TH", "VN", "US", "KR"))
    rec = {
        "creator_id": body.handle, "followers": body.followers or 5000,
        "following": 300, "engagement_rate": body.engagement_rate or 0.05,
        "category": ["beauty"], "country": body.country,
        "bio": body.product_used, "sponsor_ratio_90d": body.sponsor_ratio_90d,
        "follower_series": [],
    }
    j = judge(rec, fit)

    # 탈락도 즉시 정중히 회신 — 무응답으로 두지 않는다
    reply = {
        "invite": "확인했어요! 딱 맞는 캠페인이 있어 곧 담당자가 연락드립니다.",
        "hold": "접수됐어요. 지금 열린 캠페인과는 결이 조금 달라서, 맞는 캠페인이 열리면 먼저 알려드릴게요.",
        "billing_excluded": "접수됐어요! 셀에 초대드릴게요 — 편하게 둘러보세요.",
        "reject": "관심 가져주셔서 감사해요. 지금은 함께하기 어렵지만, 계정 활동이 쌓이면 다시 신청해 주세요.",
    }[j.verdict.value]

    with connect() as conn:
        ledger_append(conn, f"ari:{body.brand_id}", "JUDGMENT", body.handle,
                      {"path": "inbound", **j.to_ledger_payload()})
    return {"verdict": j.verdict.value, "fitProbability": j.fit_probability,
            "reply": reply,
            "axes": [{"axis": a.axis, "score": round(a.score, 2)} for a in j.axes]}
