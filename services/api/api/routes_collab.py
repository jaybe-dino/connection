"""캠페인 협업 흐름 — 선정 → 수수료 합의 → 샘플 → 콘텐츠 제출 → 완료.

028 campaign_terms 상태머신을 감싼다. TikTok 코드의 종류·권한 구분:
  spark_code     크리에이터가 발급해 제출하는 광고 사용 권한 코드
  affiliate_link 브랜드가 발급하는 판매 추적 링크(상품 연결)
  tiktok_handle  계정 식별자 — 합의 시 크리에이터 본인이 확인

/me/* 경로는 레거시 미들웨어 대상이라 main.py allowlist에 등록되며,
각 핸들러가 크리에이터 JWT 본인 계정을 직접 강제한다.
"""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import auth
from .db import connect, ledger_append
from .routes_products import _guard as _brand_guard

router = APIRouter()

STATES = ["selected", "terms_agreed", "sample_shipped",
          "content_submitted", "completed", "declined"]


def _creator(conn, authorization: str) -> str:
    u = auth.current_user(authorization)
    if not u or u.get("kind") != "creator" or u.get("otp") == "pending":
        raise HTTPException(401, "크리에이터 로그인이 필요합니다")
    from .routes_identity import _ensure_creator_row
    return _ensure_creator_row(conn, u)


def _campaign(conn, brand: str, campaign_id: str, lock: bool = False) -> dict:
    c = conn.execute(
        "SELECT * FROM campaigns WHERE campaign_id=%s AND brand_id=%s"
        + (" FOR UPDATE" if lock else ""),
        (campaign_id, brand)).fetchone()
    if not c:
        raise HTTPException(404, "이 브랜드의 캠페인이 아닙니다")
    return c


def _terms(conn, campaign_id: str, creator_id: str, lock: bool = True) -> dict:
    t = conn.execute(
        "SELECT * FROM campaign_terms WHERE campaign_id=%s AND creator_id=%s"
        + (" FOR UPDATE" if lock else ""),
        (campaign_id, creator_id)).fetchone()
    if not t:
        raise HTTPException(404, "선정 내역이 없습니다")
    return t


def _terms_out(t: dict, extra: dict | None = None) -> dict:
    out = {"campaignId": t["campaign_id"], "creatorId": t["creator_id"],
           "state": t["state"],
           "commissionPct": (float(t["commission_pct"])
                             if t["commission_pct"] is not None else None),
           "agreedCommissionPct": (float(t["agreed_commission_pct"])
                                   if t["agreed_commission_pct"] is not None
                                   else None),
           "tiktokHandle": t["tiktok_handle"],
           "sampleTracking": t["sample_tracking"],
           "contentUrl": t["content_url"],
           "sparkCode": t["spark_code"],
           "affiliateLink": t["affiliate_link"]}
    if extra:
        out.update(extra)
    return out


# ── 브랜드 측 ────────────────────────────────────────────────────

@router.get("/brands/{brand}/campaigns")
def brand_campaigns(brand: str,
                    authorization: str = Header(default="")) -> list[dict]:
    _brand_guard(brand, authorization)
    with connect() as conn:
        rows = conn.execute(
            "SELECT c.campaign_id, c.name, c.product, c.status,"
            " c.affiliate_pct,"
            " (SELECT count(*) FROM campaign_applications a"
            "   WHERE a.campaign_id=c.campaign_id) AS applicants,"
            " (SELECT count(*) FROM campaign_terms t"
            "   WHERE t.campaign_id=c.campaign_id"
            "     AND t.state<>'declined') AS selected"
            " FROM campaigns c WHERE c.brand_id=%s"
            " ORDER BY c.campaign_id", (brand,)).fetchall()
    return [{"campaignId": r["campaign_id"], "name": r["name"],
             "product": r["product"], "status": r["status"],
             "affiliatePct": (float(r["affiliate_pct"])
                              if r["affiliate_pct"] is not None else None),
             "applicants": r["applicants"], "selected": r["selected"]}
            for r in rows]


@router.get("/brands/{brand}/campaigns/{campaign_id}/applicants")
def applicants(brand: str, campaign_id: str,
               authorization: str = Header(default="")) -> list[dict]:
    _brand_guard(brand, authorization)
    with connect() as conn:
        _campaign(conn, brand, campaign_id)
        rows = conn.execute(
            "SELECT a.creator_id, a.status, a.applied_at, c.handle,"
            " c.platform, c.verified, t.state AS terms_state,"
            " t.commission_pct, t.agreed_commission_pct, t.tiktok_handle,"
            " t.sample_tracking, t.content_url, t.spark_code, t.affiliate_link"
            " FROM campaign_applications a"
            " JOIN creators c USING (creator_id)"
            " LEFT JOIN campaign_terms t"
            "   ON t.campaign_id=a.campaign_id AND t.creator_id=a.creator_id"
            " WHERE a.campaign_id=%s ORDER BY a.applied_at",
            (campaign_id,)).fetchall()
    return [{"creatorId": r["creator_id"], "handle": r["handle"],
             "platform": r["platform"], "verified": r["verified"],
             "appliedAt": r["applied_at"].isoformat(),
             "termsState": r["terms_state"],
             "commissionPct": (float(r["commission_pct"])
                               if r["commission_pct"] is not None else None),
             "agreedCommissionPct": (float(r["agreed_commission_pct"])
                                     if r["agreed_commission_pct"] is not None
                                     else None),
             "tiktokHandle": r["tiktok_handle"] or "",
             "sampleTracking": r["sample_tracking"] or "",
             "contentUrl": r["content_url"] or "",
             "sparkCode": r["spark_code"] or "",
             "affiliateLink": r["affiliate_link"] or ""} for r in rows]


class SelectIn(BaseModel):
    creator_id: str
    commission_pct: float = Field(ge=0, le=80)


@router.post("/brands/{brand}/campaigns/{campaign_id}/select")
def select_creator(brand: str, campaign_id: str, body: SelectIn,
                   authorization: str = Header(default="")) -> dict:
    """지원자 선정 + 수수료 제안 — 크리에이터가 agree 해야 합의 확정.

    정책: 취소·보관 상태가 아닌 캠페인(open/closed)에서만 선정할 수 있고,
    capacity>0이면 유효 선정(거절 제외) 수가 정원을 넘을 수 없다.
    캠페인 행 잠금(FOR UPDATE)으로 동시 선정 경쟁을 직렬화한다."""
    _brand_guard(brand, authorization)
    with connect() as conn:
        camp = _campaign(conn, brand, campaign_id, lock=True)
        if camp["status"] not in ("open", "closed"):
            raise HTTPException(409, f"선정할 수 없는 캠페인 상태({camp['status']})입니다")
        applied = conn.execute(
            "SELECT 1 FROM campaign_applications WHERE campaign_id=%s"
            " AND creator_id=%s", (campaign_id, body.creator_id)).fetchone()
        if not applied:
            raise HTTPException(409, "지원하지 않은 크리에이터는 선정할 수 없습니다")
        if camp["capacity"] and camp["capacity"] > 0:
            n = conn.execute(
                "SELECT count(*) c FROM campaign_terms"
                " WHERE campaign_id=%s AND state<>'declined'",
                (campaign_id,)).fetchone()["c"]
            if n >= camp["capacity"]:
                raise HTTPException(409, f"정원({camp['capacity']}명)이 가득 찼습니다")
        t = conn.execute(
            "INSERT INTO campaign_terms (campaign_id, creator_id,"
            " commission_pct) VALUES (%s,%s,%s)"
            " ON CONFLICT (campaign_id, creator_id) DO NOTHING RETURNING *",
            (campaign_id, body.creator_id, body.commission_pct)).fetchone()
        if not t:
            raise HTTPException(409, "이미 선정된 크리에이터입니다")
        conn.execute(
            "UPDATE campaign_applications SET status='selected'"
            " WHERE campaign_id=%s AND creator_id=%s",
            (campaign_id, body.creator_id))
        ledger_append(conn, f"brand:{brand}", "CAMPAIGN_CREATOR_SELECTED",
                      campaign_id, {"creator": body.creator_id,
                                    "commissionPct": body.commission_pct})
    return _terms_out(t)


class TrackingIn(BaseModel):
    tracking: str = Field(min_length=1, max_length=120)


@router.post("/brands/{brand}/campaigns/{campaign_id}/terms/{creator_id}/sample-shipped")
def sample_shipped(brand: str, campaign_id: str, creator_id: str,
                   body: TrackingIn,
                   authorization: str = Header(default="")) -> dict:
    _brand_guard(brand, authorization)
    with connect() as conn:
        _campaign(conn, brand, campaign_id)
        t = _terms(conn, campaign_id, creator_id)
        if t["state"] != "terms_agreed":
            raise HTTPException(409, f"합의 후에만 발송 처리 가능 (현재 {t['state']})")
        t = conn.execute(
            "UPDATE campaign_terms SET state='sample_shipped',"
            " sample_tracking=%s, shipped_at=now()"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (body.tracking, campaign_id, creator_id)).fetchone()
        conn.execute(
            "UPDATE campaign_applications SET status='shipping'"
            " WHERE campaign_id=%s AND creator_id=%s", (campaign_id, creator_id))
        ledger_append(conn, f"brand:{brand}", "CAMPAIGN_SAMPLE_SHIPPED",
                      campaign_id, {"creator": creator_id,
                                    "tracking": body.tracking})
    return _terms_out(t)


class LinkIn(BaseModel):
    link: str = Field(min_length=8, max_length=500)


@router.post("/brands/{brand}/campaigns/{campaign_id}/terms/{creator_id}/affiliate-link")
def issue_affiliate_link(brand: str, campaign_id: str, creator_id: str,
                         body: LinkIn,
                         authorization: str = Header(default="")) -> dict:
    """어필리에이트 링크 발급 — 브랜드 권한. 합의 전에는 발급 불가."""
    _brand_guard(brand, authorization)
    if not body.link.startswith("https://"):
        raise HTTPException(400, "https 링크만 등록할 수 있습니다")
    with connect() as conn:
        _campaign(conn, brand, campaign_id)
        t = _terms(conn, campaign_id, creator_id)
        if t["state"] in ("selected", "declined"):
            raise HTTPException(409, "수수료 합의 후에 발급할 수 있습니다")
        t = conn.execute(
            "UPDATE campaign_terms SET affiliate_link=%s"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (body.link, campaign_id, creator_id)).fetchone()
        ledger_append(conn, f"brand:{brand}", "AFFILIATE_LINK_ISSUED",
                      campaign_id, {"creator": creator_id})
    return _terms_out(t)


@router.post("/brands/{brand}/campaigns/{campaign_id}/terms/{creator_id}/complete")
def complete_terms(brand: str, campaign_id: str, creator_id: str,
                   authorization: str = Header(default="")) -> dict:
    _brand_guard(brand, authorization)
    with connect() as conn:
        _campaign(conn, brand, campaign_id)
        t = _terms(conn, campaign_id, creator_id)
        if t["state"] != "content_submitted":
            raise HTTPException(409, f"콘텐츠 제출 후에만 완료 가능 (현재 {t['state']})")
        t = conn.execute(
            "UPDATE campaign_terms SET state='completed'"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (campaign_id, creator_id)).fetchone()
        conn.execute(
            "UPDATE campaign_applications SET status='passed'"
            " WHERE campaign_id=%s AND creator_id=%s", (campaign_id, creator_id))
        ledger_append(conn, f"brand:{brand}", "CAMPAIGN_TERMS_COMPLETED",
                      campaign_id, {"creator": creator_id})
    return _terms_out(t)


# ── 크리에이터 측 (/me/* — 핸들러가 본인 JWT 강제) ────────────────

@router.get("/me/campaigns")
def my_campaigns(authorization: str = Header(default="")) -> list[dict]:
    """내 멤버십 브랜드의 모집 중 캠페인 + 내 지원/선정 상태."""
    with connect() as conn:
        cid = _creator(conn, authorization)
        rows = conn.execute(
            "SELECT c.campaign_id, c.brand_id, c.name, c.product,"
            " c.reward_type, c.affiliate_pct, c.deadline, c.status,"
            " b.name AS brand_name, b.logo_url,"
            " a.status AS my_status, t.state AS terms_state"
            " FROM campaigns c JOIN brands b USING (brand_id)"
            " JOIN memberships m ON m.brand_id=c.brand_id AND m.creator_id=%s"
            " LEFT JOIN campaign_applications a"
            "   ON a.campaign_id=c.campaign_id AND a.creator_id=%s"
            " LEFT JOIN campaign_terms t"
            "   ON t.campaign_id=c.campaign_id AND t.creator_id=%s"
            " WHERE c.status='open' ORDER BY c.campaign_id",
            (cid, cid, cid)).fetchall()
    return [{"campaignId": r["campaign_id"], "brandId": r["brand_id"],
             "brandName": r["brand_name"], "logoUrl": r["logo_url"],
             "name": r["name"], "product": r["product"],
             "rewardType": r["reward_type"],
             "affiliatePct": (float(r["affiliate_pct"])
                              if r["affiliate_pct"] is not None else None),
             "deadline": r["deadline"].isoformat() if r["deadline"] else None,
             "myStatus": r["my_status"] or "none",
             "termsState": r["terms_state"]} for r in rows]


@router.get("/me/campaign-offers")
def my_offers(authorization: str = Header(default="")) -> list[dict]:
    with connect() as conn:
        cid = _creator(conn, authorization)
        rows = conn.execute(
            "SELECT t.*, c.name AS campaign_name, c.brand_id,"
            " b.name AS brand_name FROM campaign_terms t"
            " JOIN campaigns c USING (campaign_id)"
            " JOIN brands b ON b.brand_id=c.brand_id"
            " WHERE t.creator_id=%s ORDER BY t.selected_at", (cid,)).fetchall()
    return [_terms_out(r, {"campaignName": r["campaign_name"],
                           "brandId": r["brand_id"],
                           "brandName": r["brand_name"]}) for r in rows]


class AgreeIn(BaseModel):
    accept: bool = True
    tiktok_handle: str = Field(default="", max_length=80)


@router.post("/me/campaign-offers/{campaign_id}/agree")
def agree_offer(campaign_id: str, body: AgreeIn,
                authorization: str = Header(default="")) -> dict:
    """수수료 합의(또는 거절) — 합의 시 제안 수수료가 확정값이 된다."""
    with connect() as conn:
        cid = _creator(conn, authorization)
        t = _terms(conn, campaign_id, cid)
        if t["state"] != "selected":
            raise HTTPException(409, f"선정 상태에서만 응답 가능 (현재 {t['state']})")
        if not body.accept:
            t = conn.execute(
                "UPDATE campaign_terms SET state='declined'"
                " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
                (campaign_id, cid)).fetchone()
            ledger_append(conn, f"creator:{cid}", "CAMPAIGN_TERMS_DECLINED",
                          campaign_id, {})
            return _terms_out(t)
        handle = body.tiktok_handle.strip()
        if not handle:
            raise HTTPException(400, "합의에는 TikTok 핸들 확인이 필요합니다")
        t = conn.execute(
            "UPDATE campaign_terms SET state='terms_agreed',"
            " agreed_commission_pct=commission_pct, tiktok_handle=%s,"
            " agreed_at=now()"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (handle, campaign_id, cid)).fetchone()
        ledger_append(conn, f"creator:{cid}", "CAMPAIGN_TERMS_AGREED",
                      campaign_id,
                      {"commissionPct": float(t["agreed_commission_pct"])})
    return _terms_out(t)


class SparkIn(BaseModel):
    spark_code: str = Field(min_length=4, max_length=120)


@router.post("/me/campaign-offers/{campaign_id}/spark-code")
def submit_spark_code(campaign_id: str, body: SparkIn,
                      authorization: str = Header(default="")) -> dict:
    """Spark(광고 권한) 코드 제출 — 크리에이터 권한. 합의 후 제출 가능."""
    with connect() as conn:
        cid = _creator(conn, authorization)
        t = _terms(conn, campaign_id, cid)
        if t["state"] not in ("terms_agreed", "sample_shipped",
                              "content_submitted"):
            raise HTTPException(409, f"합의 후 제출 가능 (현재 {t['state']})")
        t = conn.execute(
            "UPDATE campaign_terms SET spark_code=%s"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (body.spark_code.strip(), campaign_id, cid)).fetchone()
        ledger_append(conn, f"creator:{cid}", "SPARK_CODE_SUBMITTED",
                      campaign_id, {})
    return _terms_out(t)


class ContentIn(BaseModel):
    content_url: str = Field(min_length=8, max_length=500)


@router.post("/me/campaign-offers/{campaign_id}/content")
def submit_content(campaign_id: str, body: ContentIn,
                   authorization: str = Header(default="")) -> dict:
    if not body.content_url.startswith("https://"):
        raise HTTPException(400, "https 콘텐츠 링크만 제출할 수 있습니다")
    with connect() as conn:
        cid = _creator(conn, authorization)
        t = _terms(conn, campaign_id, cid)
        if t["state"] not in ("terms_agreed", "sample_shipped"):
            raise HTTPException(409, f"합의/샘플 수령 후 제출 가능 (현재 {t['state']})")
        t = conn.execute(
            "UPDATE campaign_terms SET state='content_submitted',"
            " content_url=%s, submitted_at=now()"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (body.content_url, campaign_id, cid)).fetchone()
        conn.execute(
            "UPDATE campaign_applications SET status='submitted'"
            " WHERE campaign_id=%s AND creator_id=%s", (campaign_id, cid))
        ledger_append(conn, f"creator:{cid}", "CAMPAIGN_CONTENT_SUBMITTED",
                      campaign_id, {"url": body.content_url})
    return _terms_out(t)
