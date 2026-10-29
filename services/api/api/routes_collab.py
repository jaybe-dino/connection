"""캠페인 협업 흐름 — 선정 → 수수료 합의 → 샘플 → 콘텐츠 제출 → 완료.

028 campaign_terms 상태머신을 감싼다. TikTok 코드의 종류·권한 구분:
  spark_code     크리에이터가 발급해 제출하는 광고 사용 권한 코드
  affiliate_link 브랜드가 발급하는 판매 추적 링크(상품 연결)
  tiktok_handle  계정 식별자 — 합의 시 크리에이터 본인이 확인

/me/* 경로는 레거시 미들웨어 대상이라 main.py allowlist에 등록되며,
각 핸들러가 크리에이터 JWT 본인 계정을 직접 강제한다.
"""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from urllib.parse import urlsplit

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


def _offer_terms(camp: dict | None, commission_pct) -> dict:
    """크리에이터에게 제안된 조건 — 합의 확인값(fingerprint)과 스냅샷의 공통 원본."""
    camp = camp or {}
    return {"rewardType": camp.get("reward_type"),
            "commissionPct": float(commission_pct) if commission_pct is not None else None,
            "rewardAmount": camp.get("reward_amount"),
            "rewardCurrency": camp.get("reward_currency"),
            "platform": camp.get("platform") or "tiktok",
            "conditions": [str(x) for x in (camp.get("conditions") or [])
                           if isinstance(x, (str, int, float))]}


def _terms_fingerprint(terms: dict) -> str:
    """제안 조건의 확인값 — 사용자가 본 조건과 서버가 수락할 조건이 같은지 비교한다."""
    import hashlib
    import json as _json
    keys = ("rewardType", "commissionPct", "rewardAmount", "rewardCurrency", "platform", "conditions")
    raw = _json.dumps({k: terms.get(k) for k in keys}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


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
           "affiliateLink": t["affiliate_link"],
           "shipping": t.get("shipping"),
           "revisionNote": t.get("revision_note") or "",
           "platformHandle": t.get("platform_handle") or "",
           "agreedTerms": t.get("agreed_terms"),
           "revisionRequestedAt": (t["revision_requested_at"].isoformat()
                                   if t.get("revision_requested_at") else None)}
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
            " c.affiliate_pct, c.lifecycle, c.countries, c.deadline,"
            " c.usp, c.reward_type, c.reward_amount, c.reward_currency,"
            " c.platform, c.conditions, c.capacity, c.product_id,"
            " (SELECT count(*) FROM campaign_applications a"
            "   WHERE a.campaign_id=c.campaign_id) AS applicants,"
            " (SELECT count(*) FROM campaign_terms t"
            "   WHERE t.campaign_id=c.campaign_id"
            "     AND t.state<>'declined') AS selected"
            " FROM campaigns c WHERE c.brand_id=%s"
            " ORDER BY c.campaign_id", (brand,)).fetchall()
    return [{"campaignId": r["campaign_id"], "name": r["name"],
             "product": r["product"], "status": r["status"],
             "lifecycle": r["lifecycle"], "countries": list(r["countries"] or []),
             "deadline": r["deadline"].isoformat() if r["deadline"] else None,
             "affiliatePct": (float(r["affiliate_pct"])
                              if r["affiliate_pct"] is not None else None),
             "applicants": r["applicants"], "selected": r["selected"],
             "usp": r["usp"] or "", "rewardType": r["reward_type"],
             "rewardAmount": r["reward_amount"],
             "rewardCurrency": r["reward_currency"], "platform": r["platform"],
             "conditions": [str(x) for x in (r["conditions"] or [])
                            if isinstance(x, (str, int, float))],
             "capacity": r["capacity"] or 0,
             "productId": str(r["product_id"]) if r["product_id"] else None}
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
            " t.sample_tracking, t.content_url, t.spark_code,"
            " t.affiliate_link, t.shipping, t.revision_note,"
            " t.revision_requested_at, t.platform_handle, t.agreed_terms"
            " FROM campaign_applications a"
            " JOIN creators c USING (creator_id)"
            " LEFT JOIN campaign_terms t"
            "   ON t.campaign_id=a.campaign_id AND t.creator_id=a.creator_id"
            " WHERE a.campaign_id=%s ORDER BY a.applied_at",
            (campaign_id,)).fetchall()
    return [{"creatorId": r["creator_id"], "handle": r["handle"],
             "platform": r["platform"], "verified": r["verified"],
             "appliedAt": r["applied_at"].isoformat(),
             "status": r["status"], "termsState": r["terms_state"],
             "commissionPct": (float(r["commission_pct"])
                               if r["commission_pct"] is not None else None),
             "agreedCommissionPct": (float(r["agreed_commission_pct"])
                                     if r["agreed_commission_pct"] is not None
                                     else None),
             "tiktokHandle": r["tiktok_handle"] or "",
             "sampleTracking": r["sample_tracking"] or "",
             "contentUrl": r["content_url"] or "",
             "sparkCode": r["spark_code"] or "",
             "affiliateLink": r["affiliate_link"] or "",
             "shipping": r["shipping"],
             "revisionNote": r["revision_note"] or "",
             "platformHandle": r["platform_handle"] or "",
             "agreedTerms": r["agreed_terms"]} for r in rows]


class SelectIn(BaseModel):
    creator_id: str
    # 판매 수수료(어필리에이트) 캠페인만 필수. 고정 보상·제품 제공은 캠페인 조건으로 합의한다.
    commission_pct: float | None = Field(default=None, ge=0, le=80)


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
        if camp["reward_type"] == "affiliate" and body.commission_pct is None:
            raise HTTPException(400, "판매 수수료 캠페인은 제안 수수료(%)가 필요합니다")
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

    @field_validator('tracking', mode='before')
    @classmethod
    def clean_tracking(cls, v):
        return v.strip() if isinstance(v, str) else v


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


def _https_evidence(value):
    # Validate the submitted address, not whether its content/ownership is genuine.
    # No remote fetch here: storing a link must not introduce SSRF.
    if not isinstance(value, str):
        raise ValueError('https 주소를 입력해 주세요')
    value = value.strip()
    if any(c.isspace() or ord(c) < 32 for c in value) or '\\' in value:
        raise ValueError('주소에 공백이나 제어문자를 사용할 수 없습니다')
    try:
        url = urlsplit(value)
        port = url.port
        if url.scheme != 'https' or not url.hostname or url.username or url.password:
            raise ValueError()
        if '.' not in url.hostname or url.hostname.startswith('.') or url.hostname.endswith('.'):
            raise ValueError()
    except ValueError:
        raise ValueError('정상적인 https 주소를 입력해 주세요') from None
    return value


class LinkIn(BaseModel):
    link: str = Field(min_length=8, max_length=500)
    _valid_link = field_validator('link', mode='before')(_https_evidence)


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


class ShippingIn(BaseModel):
    """공백만 입력한 값이 길이 검사를 통과해 빈 값으로 저장되지 않도록
    strip 후 길이·형식을 검증한다(검수 반영)."""
    recipient: str = Field(max_length=80)
    country: str = Field(max_length=10)
    address: str = Field(max_length=300)
    phone: str = Field(max_length=40)

    @field_validator('recipient', 'country', 'address', 'phone', mode='before')
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator('recipient')
    @classmethod
    def _recipient(cls, v):
        if len(v) < 1:
            raise ValueError('수령인을 입력해 주세요')
        return v

    @field_validator('country')
    @classmethod
    def _country(cls, v):
        import re as _re
        if not _re.fullmatch(r'[A-Za-z]{2}', v):
            raise ValueError('수령 국가는 영문 2자리 코드입니다 (예: KR)')
        return v.upper()

    @field_validator('address')
    @classmethod
    def _address(cls, v):
        if len(v) < 4:
            raise ValueError('배송 주소를 4자 이상 입력해 주세요')
        return v

    @field_validator('phone')
    @classmethod
    def _phone(cls, v):
        if len(v) < 4:
            raise ValueError('연락처를 4자 이상 입력해 주세요')
        return v


@router.post("/me/campaign-offers/{campaign_id}/shipping")
def submit_shipping(campaign_id: str, body: ShippingIn,
                    authorization: str = Header(default="")) -> dict:
    """샘플 수령 정보 — 협업 당사자(크리에이터 본인 ↔ 해당 브랜드)만
    저장·조회한다. 감사 원장에는 주소·연락처를 남기지 않는다."""
    import json as _json
    with connect() as conn:
        cid = _creator(conn, authorization)
        t = _terms(conn, campaign_id, cid)
        if t["state"] not in ("selected", "terms_agreed"):
            raise HTTPException(409, "샘플 발송 전(선정~합의)에만 수령 정보를"
                                     f" 등록할 수 있어요 (현재 {t['state']})")
        t = conn.execute(
            "UPDATE campaign_terms SET shipping=%s::jsonb"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (_json.dumps({"recipient": body.recipient.strip(),
                          "country": body.country.strip().upper(),
                          "address": body.address.strip(),
                          "phone": body.phone.strip()}),
             campaign_id, cid)).fetchone()
        ledger_append(conn, f"creator:{cid}", "SHIPPING_INFO_SUBMITTED",
                      campaign_id, {"country": body.country.strip().upper()})
    return _terms_out(t)


class RevisionIn(BaseModel):
    note: str = Field(max_length=500)

    @field_validator('note', mode='before')
    @classmethod
    def _strip_note(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator('note')
    @classmethod
    def _note(cls, v):
        if len(v) < 4:
            raise ValueError('요청 내용을 4자 이상 적어 주세요')
        return v


@router.post("/brands/{brand}/campaigns/{campaign_id}/terms/{creator_id}/request-revision")
def request_revision(brand: str, campaign_id: str, creator_id: str,
                     body: RevisionIn,
                     authorization: str = Header(default="")) -> dict:
    """브랜드 수정 요청 — 제출된 콘텐츠에 피드백을 남기고 재제출을 받는다."""
    _brand_guard(brand, authorization)
    with connect() as conn:
        _campaign(conn, brand, campaign_id)
        t = _terms(conn, campaign_id, creator_id)
        if t["state"] != "content_submitted":
            raise HTTPException(409, "제출된 콘텐츠에만 수정을 요청할 수"
                                     f" 있어요 (현재 {t['state']})")
        t = conn.execute(
            "UPDATE campaign_terms SET state='revision_requested',"
            " revision_note=%s, revision_requested_at=now()"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (body.note.strip(), campaign_id, creator_id)).fetchone()
        camp = conn.execute("SELECT name FROM campaigns WHERE campaign_id=%s",
                            (campaign_id,)).fetchone()
        # 해당 크리에이터에게만 알림(배지+카드, 강제 이동 없음)
        import json as _json
        conn.execute(
            "INSERT INTO notifications (user_id, type, title, body, target)"
            " SELECT u.user_id::text, 'campaign', %s, %s, %s::jsonb"
            " FROM users u WHERE u.creator_id=%s",
            (f"수정 요청: {(camp or {}).get('name') or campaign_id}",
             body.note.strip()[:200],
             _json.dumps({"brandId": brand, "campaignId": campaign_id}),
             creator_id))
        ledger_append(conn, f"brand:{brand}", "CAMPAIGN_REVISION_REQUESTED",
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
        from .routes_service import award_xp
        award_xp(conn, creator_id, brand, "completed", campaign_id)
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
            "SELECT c.campaign_id, c.brand_id, c.name, c.product, c.usp,"
            " c.reward_type, c.affiliate_pct, c.deadline, c.status,"
            " c.countries, b.name AS brand_name, b.logo_url,"
            " c.reward_amount, c.capacity, c.conditions,"
            " c.reward_currency, c.platform, c.product_id,"
            " a.status AS my_status, t.state AS terms_state,"
            # 캠페인 제품 이미지 — 반드시 같은 브랜드의 제품만 연결(타 브랜드
            # 이미지 금지). 초대 소개 이미지(최신 운영 입력)를 사용한다.
            " pip.image_url AS product_image"
            " FROM campaigns c JOIN brands b USING (brand_id)"
            " JOIN memberships m ON m.brand_id=c.brand_id AND m.creator_id=%s"
            " LEFT JOIN brand_products bp ON bp.product_id=c.product_id"
            "   AND bp.brand_id=c.brand_id"
            " LEFT JOIN product_invitation_profiles pip"
            "   ON pip.product_id=bp.product_id"
            " LEFT JOIN campaign_applications a"
            "   ON a.campaign_id=c.campaign_id AND a.creator_id=%s"
            " LEFT JOIN campaign_terms t"
            "   ON t.campaign_id=c.campaign_id AND t.creator_id=%s"
            " WHERE c.status='open' AND c.lifecycle='published'"
            " ORDER BY c.campaign_id",
            (cid, cid, cid)).fetchall()
        prof = conn.execute(
            "SELECT country, ship_countries FROM creator_profiles"
            " WHERE creator_id=%s", (cid,)).fetchone()
    my_countries = set()
    if prof:
        if prof["country"]:
            my_countries.add(prof["country"])
        my_countries.update(prof["ship_countries"] or [])
    out = []
    for r in rows:
        countries = r["countries"] or []
        eligible = not countries or bool(my_countries & set(countries))
        out.append(
            {"campaignId": r["campaign_id"], "brandId": r["brand_id"],
             "brandName": r["brand_name"], "logoUrl": r["logo_url"],
             "imageUrl": (r["product_image"]
                          if (r["product_image"] or "").startswith("https://")
                          else None),
             "name": r["name"], "product": r["product"],
             "usp": r["usp"] or "", "rewardType": r["reward_type"],
             "affiliatePct": (float(r["affiliate_pct"])
                              if r["affiliate_pct"] is not None else None),
             "deadline": r["deadline"].isoformat() if r["deadline"] else None,
             # 브랜드가 저장한 값 그대로 — 비어 있으면 화면이 '브랜드 안내 대기'로 표시
             "rewardAmount": r["reward_amount"],
             "rewardCurrency": r["reward_currency"], "platform": r["platform"],
             "productId": str(r["product_id"]) if r["product_id"] else None,
             "capacity": r["capacity"] or 0,
             "conditions": [str(x) for x in (r["conditions"] or [])
                            if isinstance(x, (str, int, float))],
             "myStatus": r["my_status"] or "none",
             "termsState": r["terms_state"],
             "countries": list(countries), "eligible": eligible,
             "ineligibleReason": (None if eligible else
                                  "이 캠페인은 " + ", ".join(countries)
                                  + " 지역 대상입니다 — 프로필의 국가/배송 가능"
                                  " 국가가 조건과 맞지 않습니다")})
    return out


@router.get("/me/campaign-offers")
def my_offers(authorization: str = Header(default="")) -> list[dict]:
    with connect() as conn:
        cid = _creator(conn, authorization)
        rows = conn.execute(
            "SELECT t.*, c.name AS campaign_name, c.brand_id, c.product,"
            " c.reward_type, c.reward_amount, c.reward_currency, c.platform,"
            " c.affiliate_pct, c.conditions,"
            " b.name AS brand_name, b.logo_url,"
            " pip.image_url AS product_image"
            " FROM campaign_terms t"
            " JOIN campaigns c USING (campaign_id)"
            " JOIN brands b ON b.brand_id=c.brand_id"
            " LEFT JOIN brand_products bp ON bp.product_id=c.product_id"
            "   AND bp.brand_id=c.brand_id"
            " LEFT JOIN product_invitation_profiles pip"
            "   ON pip.product_id=bp.product_id"
            " WHERE t.creator_id=%s ORDER BY t.selected_at", (cid,)).fetchall()
    def _offer_extra(r):
        terms = _offer_terms(r, r["commission_pct"])
        return {"offerTerms": terms, "termsFingerprint": _terms_fingerprint(terms)}
    return [_terms_out(r, {**_offer_extra(r), "campaignName": r["campaign_name"],
                           "brandId": r["brand_id"],
                           "brandName": r["brand_name"],
                           "product": r["product"],
                           "rewardType": r["reward_type"],
                           "rewardAmount": r["reward_amount"],
                           "rewardCurrency": r["reward_currency"],
                           "platform": r["platform"],
                           "conditions": [str(x) for x in (r["conditions"] or [])
                                          if isinstance(x, (str, int, float))],
                           "logoUrl": r["logo_url"],
                           "imageUrl": (r["product_image"]
                                        if (r["product_image"] or "")
                                        .startswith("https://") else None)})
            for r in rows]


class AgreeIn(BaseModel):
    accept: bool = True
    tiktok_handle: str = Field(default="", max_length=80)
    handle: str = Field(default="", max_length=80)   # 캠페인 플랫폼 계정(TikTok/Instagram)
    # 화면에서 확인한 제안 조건의 확인값(GET /me/campaign-offers 의 termsFingerprint).
    # 보내면 현재 조건과 다를 때 409 로 재확인을 요구한다. 비우면 기존 API 와 같다.
    terms_fingerprint: str = Field(default="", max_length=64)


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
        # 캠페인 행을 잠가 확인값 비교와 합의 저장 사이에 브랜드 수정이 끼어들지 못하게 한다
        camp = conn.execute(
            "SELECT reward_type, reward_amount, reward_currency, platform,"
            " conditions, affiliate_pct FROM campaigns WHERE campaign_id=%s FOR UPDATE",
            (campaign_id,)).fetchone()
        offered = _offer_terms(camp, t["commission_pct"])
        current_fp = _terms_fingerprint(offered)
        seen_fp = (body.terms_fingerprint or "").strip()
        if seen_fp and seen_fp != current_fp:
            raise HTTPException(409, {"code": "terms_changed",
                                      "message": "확인하신 뒤 브랜드가 조건을 바꿨어요. 새 조건을 다시 확인해 주세요.",
                                      "termsFingerprint": current_fp, "offerTerms": offered})
        platform = offered["platform"]
        handle = (body.handle or body.tiktok_handle).strip()
        if not handle:
            raise HTTPException(400, "합의에는 " + ("Instagram" if platform == "instagram" else "TikTok")
                                     + " 계정 확인이 필요합니다")
        # 합의 시점의 조건을 그대로 남긴다(이후 캠페인 수정과 무관하게 이 합의 기준 유지)
        snapshot = {**offered, "handle": handle, "termsFingerprint": current_fp,
                    "confirmedByCreator": bool(seen_fp)}
        import json as _json
        t = conn.execute(
            "UPDATE campaign_terms SET state='terms_agreed',"
            " agreed_commission_pct=commission_pct,"
            " tiktok_handle=CASE WHEN %s='tiktok' THEN %s ELSE tiktok_handle END,"
            " platform_handle=%s, agreed_terms=%s, agreed_at=now()"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (platform, handle, handle, _json.dumps(snapshot, ensure_ascii=False),
             campaign_id, cid)).fetchone()
        from .routes_service import award_xp
        _b = conn.execute("SELECT brand_id FROM campaigns WHERE"
                          " campaign_id=%s", (campaign_id,)).fetchone()
        if _b:
            award_xp(conn, cid, _b["brand_id"], "agreement", campaign_id)
        ledger_append(conn, f"creator:{cid}", "CAMPAIGN_TERMS_AGREED",
                      campaign_id,
                      {"commissionPct": (float(t["agreed_commission_pct"])
                                         if t["agreed_commission_pct"] is not None else None),
                       "rewardType": snapshot["rewardType"], "platform": platform})
    return _terms_out(t)


class SparkIn(BaseModel):
    spark_code: str = Field(min_length=4, max_length=120)

    @field_validator('spark_code', mode='before')
    @classmethod
    def clean_code(cls, v):
        return v.strip() if isinstance(v, str) else v


@router.post("/me/campaign-offers/{campaign_id}/spark-code")
def submit_spark_code(campaign_id: str, body: SparkIn,
                      authorization: str = Header(default="")) -> dict:
    """Spark(광고 권한) 코드 제출 — 크리에이터 권한. 합의 후 제출 가능."""
    with connect() as conn:
        cid = _creator(conn, authorization)
        t = _terms(conn, campaign_id, cid)
        if t["state"] not in ("terms_agreed", "sample_shipped",
                              "content_submitted", "revision_requested"):
            raise HTTPException(409, f"합의 후 제출 가능 (현재 {t['state']})")
        plat = conn.execute("SELECT platform FROM campaigns WHERE campaign_id=%s",
                            (campaign_id,)).fetchone()
        if plat and plat["platform"] != "tiktok":
            raise HTTPException(409, "Spark 코드는 TikTok 캠페인에만 제출해요")
        t = conn.execute(
            "UPDATE campaign_terms SET spark_code=%s"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (body.spark_code.strip(), campaign_id, cid)).fetchone()
        ledger_append(conn, f"creator:{cid}", "SPARK_CODE_SUBMITTED",
                      campaign_id, {})
    return _terms_out(t)


class ContentIn(BaseModel):
    content_url: str = Field(min_length=8, max_length=500)
    _valid_url = field_validator('content_url', mode='before')(_https_evidence)


@router.post("/me/campaign-offers/{campaign_id}/content")
def submit_content(campaign_id: str, body: ContentIn,
                   authorization: str = Header(default="")) -> dict:
    if not body.content_url.startswith("https://"):
        raise HTTPException(400, "https 콘텐츠 링크만 제출할 수 있습니다")
    with connect() as conn:
        cid = _creator(conn, authorization)
        t = _terms(conn, campaign_id, cid)
        if t["state"] not in ("terms_agreed", "sample_shipped",
                              "revision_requested", "content_submitted"):
            # 완료(completed) 후에는 기록 보존을 위해 변경 금지
            raise HTTPException(409, f"합의/샘플 수령 후 제출 가능 (현재 {t['state']})")
        edited = t["state"] == "content_submitted"   # 검토 중 링크 수정
        t = conn.execute(
            "UPDATE campaign_terms SET state='content_submitted',"
            " content_url=%s, submitted_at=now(),"
            " revision_note='', revision_requested_at=NULL"
            " WHERE campaign_id=%s AND creator_id=%s RETURNING *",
            (body.content_url, campaign_id, cid)).fetchone()
        conn.execute(
            "UPDATE campaign_applications SET status='submitted'"
            " WHERE campaign_id=%s AND creator_id=%s", (campaign_id, cid))
        from .routes_service import award_xp
        _b = conn.execute("SELECT brand_id FROM campaigns WHERE"
                          " campaign_id=%s", (campaign_id,)).fetchone()
        if _b:
            award_xp(conn, cid, _b["brand_id"], "content_submitted",
                     campaign_id)
        ledger_append(conn, f"creator:{cid}", "CAMPAIGN_CONTENT_SUBMITTED",
                      campaign_id, {"url": body.content_url,
                                    "edited": edited})
    return _terms_out(t)
