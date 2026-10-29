"""브랜드 복수 제품 — 제품별 학습(근거·버전) · 제품별 캠페인 · AI 후보 추천.

학습 파이프라인은 기존 /brand-learning(레이트리밋·근거 인용 검증 포함)을 그대로
재사용한다: UI가 제품 페이지 URL을 /brand-learning으로 분석 → learning_id를
이 라우터의 제품 프로필 저장에 넘긴다.

후보 추천은 허용된 내부 후보 DB(creator_pool — 수집엔진이 공개 자료·계약 벤더
API로 채운 것)에서 결정적(비생성) 기준으로 뽑고, 각 후보에 '왜'를 데이터 근거
문자열로 붙인다. 존재하지 않는 지표를 만들어내지 않는다.
"""

import json
import hashlib
import re
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

from . import auth
from .db import connect, ledger_append

router = APIRouter()

PRODUCT_KEYS = {"product_one_liner", "hero_product", "ingredients",
                "price_range", "usp", "target_audience", "voice",
                # v8.1 제품 편집기(B03) — 추가 키. 크리에이터용 소개·캠페인 미리보기·AI 초안 근거
                "category", "description", "howto", "banned", "link",
                "price", "currency", "ship", "image_url"}
PRODUCT_CATEGORIES = {"스킨케어", "헤어", "생활", "식품"}
_COUNTRY_CODES = {"KR", "TH", "US", "VN", "JP"}


def _validate_product_answers(answers: dict[str, str]) -> None:
    """형식 검사 — 빈 값은 삭제 의미라 통과."""
    def bad(msg):
        raise HTTPException(400, msg)
    v = answers.get("category")
    if v and v not in PRODUCT_CATEGORIES:
        bad("카테고리는 스킨케어·헤어·생활·식품 중에서 고르세요")
    for k in ("link", "image_url"):
        v = answers.get(k)
        if v and not re.fullmatch(r"https://[^\s\"'<>]{4,480}", v):
            bad(("판매 링크" if k == "link" else "대표 이미지") + "는 https:// 주소로 적어 주세요")
    v = answers.get("price")
    if v and not re.fullmatch(r"\d{1,9}(\.\d{1,2})?", v):
        bad("정가는 숫자로 적어 주세요")
    v = answers.get("currency")
    if v and v not in ("KRW", "USD", "THB", "VND", "JPY"):
        bad("통화를 확인하세요")
    v = answers.get("ship")
    if v and not set(x.strip() for x in v.split(",") if x.strip()) <= _COUNTRY_CODES:
        bad("배송 가능 국가를 확인하세요")

# ── 다국어 토큰 정책 (검수 반영) — 제품 텍스트와 후보 태그 양쪽에 동일 적용 ──
# 유니코드 \w 기반이라 태국어·일본어·베트남어 등 비라틴 문자가 보존된다.
_TOKEN_SPLIT = re.compile(r"[\W_]+", re.UNICODE)


def _norm(text: str) -> str:
    """NFKC 정규화 + casefold — 악센트 조합형(NFC/NFD)·전각/반각·대소문자
    차이를 언어 무관하게 같은 비교 기준으로 만든다."""
    return unicodedata.normalize("NFKC", text or "").casefold()


def _fit_tokens(text: str) -> set[str]:
    """정규화된 텍스트를 유니코드 단어 단위로 토큰화(2자 미만 소음 제거)."""
    return {t for t in _TOKEN_SPLIT.split(_norm(text)) if len(t) >= 2}


def _tag_terms(values) -> tuple[set[str], set[str]]:
    """후보 category/product_tags → (원문 구문 집합, 개별 토큰 집합).
    구문은 원문 태그 전체(정규화)로 보존해 여러 단어·미분절 언어 태그도
    제품 텍스트와 일관되게 비교한다."""
    phrases, toks = set(), set()
    for v in values or []:
        n = _norm(str(v)).strip()
        if len(n) >= 2:
            phrases.add(n)
        toks |= _fit_tokens(str(v))
    return phrases, toks


def _guard(brand, authorization):
    u = auth.current_user(authorization)
    if not u or u.get("otp") == "pending":
        raise HTTPException(401, "로그인이 필요합니다")
    auth.require_brand(brand, authorization, "")
    return u


def _product(conn, brand, product_id):
    p = conn.execute(
        "SELECT * FROM brand_products WHERE product_id=%s AND brand_id=%s",
        (product_id, brand)).fetchone()
    if not p:
        raise HTTPException(404, "제품을 찾을 수 없습니다")
    return p


def _latest_fields(conn, product_id):
    r = conn.execute(
        "SELECT version, fields FROM product_profile_versions"
        " WHERE product_id=%s ORDER BY version DESC LIMIT 1",
        (product_id,)).fetchone()
    return (r["version"], r["fields"]) if r else (0, {})


def _listing_missing(conn, p) -> list[str]:
    """공개 목록에 올리기 전에 채워야 할 항목 — 비어 있으면 공개할 수 없다.
    운영팀이 검수한 소개·이미지가 있으면 그것을 우선하고, 없으면 브랜드가 입력한 상세 설명·업로드한 대표 이미지로 채운다."""
    pres = conn.execute(
        "SELECT summary, image_url FROM product_invitation_profiles"
        " WHERE product_id=%s", (p["product_id"],)).fetchone()
    _, fields = _latest_fields(conn, p["product_id"])
    desc = ((fields or {}).get("description") or {})
    desc = (desc.get("value") if isinstance(desc, dict) else str(desc)) or ""
    summary = ((pres["summary"] if pres else "") or "").strip() or desc.strip()
    has_image = bool(pres and (pres["image_url"] or "").startswith("https://")) or bool(conn.execute(
        "SELECT 1 FROM product_images WHERE product_id=%s AND slot='main' AND deleted_at IS NULL",
        (p["product_id"],)).fetchone())
    missing = []
    if len(summary) < 10:
        missing.append("공개용 제품 소개(10자 이상 · 상세 설명)")
    if not has_image:
        missing.append("공개 HTTPS 제품 이미지(대표 이미지 업로드)")
    if p["state"] != "active":
        missing.append("활성 제품")
    return missing


def _out(conn, p):
    version, fields = _latest_fields(conn, p["product_id"])
    pres = conn.execute("SELECT summary, image_url FROM product_invitation_profiles WHERE product_id=%s",
                        (p["product_id"],)).fetchone()
    return {"productId": str(p["product_id"]), "brandId": p["brand_id"],
            "name": p["name"], "tiktokProductRef": p["tiktok_product_ref"],
            "commissionPct": float(p["commission_pct"]), "state": p["state"],
            "profileVersion": version, "fields": fields,
            "publicListed": bool(p.get("public_listed")),
            "publicMissing": _listing_missing(conn, p),
            # 운영팀이 검수해 등록한 공개 소개·이미지(공개 목록·초대에 쓰임) — 브랜드는 읽기만
            "publicSummary": (pres["summary"] if pres else "") or "",
            "publicImageUrl": (pres["image_url"] if pres and (pres["image_url"] or "").startswith("https://") else None),
            # 브랜드가 올린 제품 이미지(대표 1 + 추가 최대 4) — 서명된 단기 URL 로만 열린다
            "images": product_images_out(conn, p["product_id"])}


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    tiktok_product_ref: str = Field(default="", max_length=300)
    commission_pct: float = Field(default=10, ge=0, le=80)


@router.post("/brands/{brand}/products")
def create_product(brand: str, body: ProductIn,
                   authorization: str = Header(default="")) -> dict:
    _guard(brand, authorization)
    with connect() as conn:
        dup = conn.execute(
            "SELECT 1 FROM brand_products WHERE brand_id=%s AND name=%s",
            (brand, body.name.strip())).fetchone()
        if dup:
            raise HTTPException(409, "같은 이름의 제품이 이미 있습니다")
        p = conn.execute(
            "INSERT INTO brand_products (brand_id, name, tiktok_product_ref,"
            " commission_pct) VALUES (%s,%s,%s,%s) RETURNING *",
            (brand, body.name.strip(), body.tiktok_product_ref.strip(),
             body.commission_pct)).fetchone()
        ledger_append(conn, f"brand:{brand}", "PRODUCT_CREATED",
                      str(p["product_id"]), {"name": p["name"]})
        return _out(conn, p)


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    tiktok_product_ref: str | None = Field(default=None, max_length=300)
    commission_pct: float | None = Field(default=None, ge=0, le=80)


@router.patch("/brands/{brand}/products/{product_id}")
def edit_product(brand: str, product_id: UUID, body: ProductPatch,
                 authorization: str = Header(default="")) -> dict:
    """제품명·Shop 상품 ID·기본 수수료 수정. 이미 진행 중인 합의는 합의 스냅샷 기준이라 바뀌지 않는다."""
    _guard(brand, authorization)
    with connect() as conn:
        p = _product(conn, brand, product_id)
        name = body.name.strip() if body.name is not None else p["name"]
        if body.name is not None and conn.execute(
                "SELECT 1 FROM brand_products WHERE brand_id=%s AND name=%s AND product_id<>%s",
                (brand, name, product_id)).fetchone():
            raise HTTPException(409, "같은 이름의 제품이 이미 있습니다")
        p = conn.execute(
            "UPDATE brand_products SET name=%s, tiktok_product_ref=%s, commission_pct=%s"
            " WHERE product_id=%s AND brand_id=%s RETURNING *",
            (name, body.tiktok_product_ref.strip() if body.tiktok_product_ref is not None else p["tiktok_product_ref"],
             body.commission_pct if body.commission_pct is not None else p["commission_pct"],
             product_id, brand)).fetchone()
        ledger_append(conn, f"brand:{brand}", "PRODUCT_EDITED", str(product_id),
                      {k: v for k, v in body.model_dump().items() if v is not None})
        return _out(conn, p)


@router.get("/brands/{brand}/products")
def list_products(brand: str,
                  authorization: str = Header(default="")) -> list[dict]:
    _guard(brand, authorization)
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM brand_products WHERE brand_id=%s AND state='active'"
            " ORDER BY created_at", (brand,)).fetchall()
        return [_out(conn, p) for p in rows]


class ProductProfileIn(BaseModel):
    learning_id: UUID | None = None
    answers: dict[str, str] = Field(default_factory=dict)


@router.post("/brands/{brand}/products/{product_id}/profile")
def save_product_profile(brand: str, product_id: UUID, body: ProductProfileIn,
                         authorization: str = Header(default="")) -> dict:
    """브랜드 프로필과 동일한 규칙: 학습 결과(근거 인용 검증됨) + 직접 입력을
    합쳐 새 버전으로 저장. 이전 버전은 보존된다."""
    _guard(brand, authorization)
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                     (f"product:{product_id}",))
        p = _product(conn, brand, product_id)
        learned = None
        if body.learning_id:
            learned = conn.execute(
                "SELECT fields FROM brand_learning WHERE learning_id=%s"
                " AND state='ready'", (body.learning_id,)).fetchone()
            if not learned:
                raise HTTPException(400, "완료된 학습 결과가 필요합니다")
        _, fields = _latest_fields(conn, product_id)
        fields = dict(fields or {})
        fields.update((learned or {}).get("fields") or {})
        answers = {k: v.strip()[:2000] for k, v in body.answers.items()
                   if k in PRODUCT_KEYS}
        _validate_product_answers(answers)
        if not learned and not any(v for v in answers.values()) and not fields:
            raise HTTPException(400, "분석 결과나 직접 입력한 제품 정보가 필요합니다")
        for k, v in answers.items():
            if v:
                fields[k] = {"value": v, "source": "brand_confirmed",
                             "confirmed": True}
            else:
                fields.pop(k, None)
        version = conn.execute(
            "SELECT COALESCE(max(version),0)+1 AS v FROM"
            " product_profile_versions WHERE product_id=%s",
            (product_id,)).fetchone()["v"]
        conn.execute(
            "INSERT INTO product_profile_versions (product_id, version,"
            " fields, note) VALUES (%s,%s,%s,%s)",
            (product_id, version, json.dumps(fields, ensure_ascii=False),
             "website + brand answers"))
        ledger_append(conn, f"brand:{brand}", "PRODUCT_PROFILE_SAVED",
                      str(product_id), {"version": version})
        return {"saved": True, "version": version, "fields": fields,
                "productId": str(product_id)}


# ── 제품별 캠페인 개설 (틱톡샵 어필리에이트 모집) ────────────────

class ProductCampaignIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    capacity: int = Field(default=20, ge=1, le=200)
    deadline: str | None = None                    # YYYY-MM-DD
    conditions: list[str] = Field(default_factory=list)


@router.post("/brands/{brand}/products/{product_id}/campaigns")
def create_product_campaign(brand: str, product_id: UUID,
                            body: ProductCampaignIn,
                            authorization: str = Header(default="")) -> dict:
    _guard(brand, authorization)
    with connect() as conn:
        p = _product(conn, brand, product_id)
        cid = f"cmp-{str(product_id)[:8]}-{conn.execute('SELECT count(*) n FROM campaigns WHERE product_id=%s', (product_id,)).fetchone()['n'] + 1}"
        c = conn.execute(
            "INSERT INTO campaigns (campaign_id, brand_id, name, product,"
            " reward_type, affiliate_pct, conditions, capacity, deadline,"
            " product_id) VALUES (%s,%s,%s,%s,'affiliate',%s,%s,%s,%s,%s)"
            " RETURNING *",
            (cid, brand, body.name.strip(), p["name"],
             p["commission_pct"],
             json.dumps(body.conditions, ensure_ascii=False),
             body.capacity, body.deadline, product_id)).fetchone()
        ledger_append(conn, f"brand:{brand}", "PRODUCT_CAMPAIGN_CREATED",
                      cid, {"product": p["name"],
                            "commissionPct": float(p["commission_pct"])})
    return {"campaignId": c["campaign_id"], "productId": str(product_id),
            "rewardType": "affiliate",
            "affiliatePct": float(c["affiliate_pct"]),
            "capacity": c["capacity"], "status": c["status"]}


# ── AI 후보 추천 — 후보 DB에서 결정적 기준 + 데이터 근거 ─────────

@router.get("/brands/{brand}/products/{product_id}/candidates")
def product_candidates(brand: str, product_id: UUID, country: str = "",
                       limit: int = 20, mode: str = "keyword",
                       authorization: str = Header(default="")) -> dict:
    """제품·브랜드 적합도를 실제 순위에 반영한 후보 추천.

    mode=keyword(기본): 제품 텍스트 키워드와 후보 category/product_tags의
    문자 일치 교집합으로 결정적 랭킹.
    mode=ai: 키워드 상위 후보를 대상으로 Claude가 언어를 넘어 의미 적합도
    (0-100)를 평가 — 제공된 수집 데이터만 근거로 쓰고, 인용 근거(signals)는
    후보 실데이터에 존재하는 항목만 채택한다. 프로필 버전 단위 캐시와
    호출당/일일 평가 상한으로 비용을 제한하며, AI 미연동·호출 실패 시
    키워드 랭킹으로 폴백한다. 어떤 실측 지표도 생성하지 않는다.
    """
    _guard(brand, authorization)
    limit = max(1, min(limit, 50))
    country = country.strip().upper()[:2]
    with connect() as conn:
        p = _product(conn, brand, product_id)
        profile_version, fields = _latest_fields(conn, product_id)
        keywords: set[str] = set()
        used_fields: list[str] = []
        # 제품 전체 텍스트(정규화)도 보존 — 태국어처럼 띄어쓰기 없는 언어의
        # 태그 구문은 부분 문자열로 비교한다(토큰 경계가 없으므로).
        product_text = _norm(p["name"])
        keywords |= _fit_tokens(p["name"])
        for k, f in (fields or {}).items():
            v = f.get("value") if isinstance(f, dict) else str(f)
            toks = _fit_tokens(v or "")
            if toks:
                keywords |= toks
                used_fields.append(k)
                product_text += "\n" + _norm(v or "")
        rows = conn.execute(
            "SELECT creator_id, platform, platform_uid, handle, display_name, country, lang,"
            "       category, product_tags, followers, engagement_rate,"
            "       influence_score, contact_score, email, email_status"
            " FROM creator_pool"
            # 이메일 보유 후보만. 'valid'(검증 통과) 외에 'none'(운영자 등록
            # 미검증)도 포함하되 응답에 미검증임을 명시한다 — 형식만으로
            # 검증을 주장하지 않는다. 'risky'(검증 실패 이력)와 EXCLUDED
            # 상태는 제외, 이 브랜드 수신거부 이메일 제외(보존).
            " WHERE email IS NOT NULL AND email_status IN ('valid','none')"
            "   AND NOT EXISTS (SELECT 1 FROM outreach_contact_blocks x WHERE x.email=lower(trim(creator_pool.email)))"
            "   AND state <> 'EXCLUDED'"
            "   AND (%s = '' OR country = %s)"
            "   AND NOT EXISTS (SELECT 1 FROM outreach_optouts o"
            "        WHERE o.brand_id=%s AND o.email=lower(creator_pool.email)"
            "          AND o.opted_out_at IS NOT NULL)",
            (country, country, brand)).fetchall()
        scored = []
        for r in rows:
            phrases, creator_tokens = _tag_terms(
                (r["category"] or []) + (r["product_tags"] or []))
            # 토큰 교집합 + 태그 구문의 제품 텍스트 포함(미분절 언어·다단어
            # 구문 대응) — 양쪽 모두 동일 정규화(_norm) 기준의 문자 일치다.
            matched = sorted((keywords & creator_tokens)
                             | {ph for ph in phrases if ph in product_text})
            fit = len(matched)
            evidence = []
            if matched:
                evidence.append("제품 적합: " + ", ".join(matched[:5])
                                + " — 제품 프로필 키워드와 후보 분류 일치")
            if r["country"]:
                evidence.append(f"국가 {r['country']}"
                                + (" — 요청 타깃과 일치" if country and r["country"] == country else ""))
            if r["followers"] is not None:
                evidence.append(f"팔로워 {r['followers']:,} (수집 데이터)")
            if r["engagement_rate"] is not None:
                evidence.append(f"참여율 {r['engagement_rate']:.2%}")
            if r["influence_score"] is not None:
                evidence.append(f"영향력 점수 {r['influence_score']:.0f}/100")
            if r["email_status"] == "valid":
                evidence.append("이메일 검증 통과 · 이 브랜드 수신거부 이력 없음")
            else:
                evidence.append("이메일 미검증(운영자 등록) — 발송 전 주소 확인"
                                " 권장 · 이 브랜드 수신거부 이력 없음")
            scored.append((fit, r["contact_score"] or 0,
                           r["influence_score"] or 0, r["followers"] or 0,
                           {"uid": r["platform_uid"], "candidateId": str(r["creator_id"]), "platform": r["platform"], "handle": r["handle"],
                            "displayName": r["display_name"],
                            "country": r["country"],
                            "followers": r["followers"],
                            "email": r["email"],
                            "emailStatus": r["email_status"],
                            "emailVerified": r["email_status"] == "valid",
                            "fitScore": fit, "matchedTerms": matched,
                            "evidence": evidence}))
        scored.sort(key=lambda x: (-x[0], -x[1], -x[2], -x[3]))
        ai_meta = {"mode": "keyword"}
        if mode == "ai":
            rows_by_uid = {str(r["creator_id"]): r for r in rows}
            pool = [x[4] for x in scored[:limit]]
            ai_meta = _ai_annotate(conn, p, profile_version, fields,
                                   pool, rows_by_uid)
            if ai_meta["mode"] == "ai":
                # AI 평가 우선, 미평가 후보는 키워드 순위 그대로 뒤에
                scored.sort(key=lambda x: (
                    -(x[4]["aiFit"] if x[4].get("aiFit") is not None else -1),
                    -x[0], -x[1], -x[2], -x[3]))
        out = [x[4] for x in scored[:limit]]
    note = ("적합도는 제품 프로필 텍스트와 후보의 수집된 분류"
            "(category/product_tags)의 문자 일치 — 유니코드 정규화·"
            "대소문자 무시 키워드/태그 구문 교집합 — 로만 계산합니다."
            " 의미 추론 AI가 아니며, 후보 지표를 생성하지 않습니다."
            " 아웃리치 발송은 초안 검토·승인 후에만 진행됩니다.")
    if ai_meta["mode"] == "ai":
        note = ("AI 적합도(aiFit)는 제공된 수집 데이터(분류·태그·국가·언어·"
                "팔로워)에 대한 모델의 언어 간 의미 평가이며, 인용 근거"
                "(aiSignals)는 후보 실데이터에 존재하는 항목만 표시합니다."
                " 어떤 실측 지표도 생성하지 않고, 미평가 후보는 키워드 순위로"
                " 정렬됩니다. 아웃리치 발송은 초안 검토·승인 후에만 진행됩니다.")
    return {"productId": str(product_id), "productName": p["name"],
            "productFieldsUsed": sorted(set(used_fields)),
            "candidates": out, "ai": ai_meta, "note": note}


AI_MATCH_MAX_PER_CALL = 8      # 호출당 신규 평가 상한 (env로 조정)
AI_MATCH_DAILY_CAP = 200       # 브랜드당 일일 신규 평가 상한


def _ai_annotate(conn, p, profile_version, fields, pool, rows_by_uid) -> dict:
    """키워드 상위 후보(pool)에 AI 의미 평가를 주석으로 붙인다.

    캐시(candidate_ai_scores, 프로필 버전 단위) 우선 → 남은 후보만 상한
    내에서 신규 평가 → 근거(signals)는 그 후보의 실데이터(category/
    product_tags)에 존재하는 문구만 채택(허구 근거 차단). 실패·미연동이면
    폴백 사유를 담은 meta를 반환하고 후보는 키워드 순위 그대로 둔다."""
    import os as _os

    from . import ai as _ai
    try:
        per_call = int(_os.environ.get("AI_MATCH_MAX_CANDIDATES",
                                       AI_MATCH_MAX_PER_CALL))
        daily_cap = int(_os.environ.get("AI_MATCH_DAILY_CAP", AI_MATCH_DAILY_CAP))
    except ValueError:
        return {"mode": "fallback_keyword", "reason": "AI 평가 상한 설정 오류 — 키워드 순위 사용"}
    per_call = max(0, min(per_call, 50))
    daily_cap = max(0, daily_cap)
    # Serialize cache lookup + reservation per brand, including concurrent products.
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                 ("candidate-ai:" + p["brand_id"],))
    # Platform UIDs can collide across networks. Cache/model IDs use pool UUIDs.
    def candidate_key(d):
        return d.get("candidateId", d["uid"])

    fingerprints = {candidate_key(d): hashlib.sha256(json.dumps(
        {"product": p["name"], "fields": fields, "model": _ai.MODEL,
         "candidate": dict(rows_by_uid[candidate_key(d)])},
        ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
        for d in pool}
    uids = [candidate_key(d) for d in pool]
    if not uids:
        return {"mode": "fallback_keyword", "reason": "평가할 후보가 없습니다"}
    cached = conn.execute(
        "SELECT platform_uid, fit, reason, signals, input_hash FROM candidate_ai_scores"
        " WHERE product_id=%s AND profile_version=%s AND platform_uid=ANY(%s)",
        (p["product_id"], profile_version, uids)).fetchall()
    cached = [c for c in cached if c["input_hash"] == fingerprints[c["platform_uid"]]]
    by_uid = {candidate_key(d): d for d in pool}
    for c in cached:
        d = by_uid[c["platform_uid"]]
        d.update(aiFit=c["fit"], aiReason=c["reason"],
                 aiSignals=c["signals"], aiCached=True)
    uncached = [d for d in pool if "aiFit" not in d]
    meta = {"mode": "ai", "model": _ai.MODEL, "cachedHits": len(cached),
            "evaluated": 0, "capPerCall": per_call, "dailyCap": daily_cap}
    if not uncached:
        return meta
    used_today = conn.execute(
        "SELECT COALESCE(sum(quantity),0) n FROM candidate_ai_usage"
        " WHERE brand_id=%s AND created_at >= date_trunc('day', now())",
        (p["brand_id"],)).fetchone()["n"]
    if used_today >= daily_cap or per_call == 0:
        if cached:
            meta["notice"] = "일일 AI 평가 상한 도달 — 캐시된 평가만 사용"
            return meta
        return {"mode": "fallback_keyword",
                "reason": f"일일 AI 평가 상한({daily_cap}건) 도달 — 키워드 순위 사용"}
    batch = uncached[:min(per_call, daily_cap - used_today)]
    payload = []
    for d in batch:
        r = rows_by_uid[candidate_key(d)]
        payload.append({"uid": candidate_key(d), "platform": r["platform"], "handle": r["handle"],
                        "country": r["country"], "lang": r["lang"],
                        "category": list(r["category"] or []),
                        "product_tags": list(r["product_tags"] or []),
                        "followers": r["followers"],
                        "engagement_rate": (float(r["engagement_rate"])
                                            if r["engagement_rate"] is not None
                                            else None)})
    conn.execute("INSERT INTO candidate_ai_usage(brand_id,quantity) VALUES(%s,%s)",
                 (p["brand_id"],len(batch)))
    try:
        results = _ai.match_candidates(p["name"], fields, payload)
    except Exception as e:
        if cached:
            meta["notice"] = f"신규 평가 실패({type(e).__name__}) — 캐시만 사용"
            return meta
        return {"mode": "fallback_keyword",
                "reason": f"AI 호출 실패({type(e).__name__}) — 키워드 순위 사용"}
    if results is None:
        if cached:
            meta["notice"] = "AI 미연동 — 캐시된 평가만 사용"
            return meta
        return {"mode": "fallback_keyword",
                "reason": "AI 미연동(ANTHROPIC_API_KEY 없음) — 키워드 순위 사용"}
    if not isinstance(results, list):
        if cached:
            meta["notice"] = "AI 응답 형식 오류 — 캐시된 평가만 사용"
            return meta
        return {"mode": "fallback_keyword", "reason": "AI 응답 형식 오류 — 키워드 순위 사용"}
    allowed = {candidate_key(d) for d in batch}
    for item in results:
        if not isinstance(item, dict):
            continue
        uid = str(item.get("uid", ""))
        fit = item.get("fit")
        if uid not in allowed or type(fit) is not int or not 0 <= fit <= 100:
            continue                       # 허구 uid·범위 밖 점수 거부
        r = rows_by_uid[uid]
        data_terms = {_norm(str(t)) for t in
                      list(r["category"] or []) + list(r["product_tags"] or [])}
        raw_signals = item.get("signals")
        if not isinstance(raw_signals, list):
            raw_signals = []
        signals = [str(s)[:120] for s in raw_signals
                   if isinstance(s, str) and _norm(s) in data_terms][:8]
        reason = str(item.get("reason", ""))[:300]
        conn.execute(
            "INSERT INTO candidate_ai_scores (product_id, profile_version,"
            " platform_uid, fit, reason, signals, model, input_hash)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s)"
            " ON CONFLICT(product_id,profile_version,platform_uid) DO UPDATE SET"
            " fit=EXCLUDED.fit,reason=EXCLUDED.reason,signals=EXCLUDED.signals,"
            " model=EXCLUDED.model,input_hash=EXCLUDED.input_hash,created_at=now()",
            (p["product_id"], profile_version, uid, fit, reason,
             json.dumps(signals, ensure_ascii=False), _ai.MODEL, fingerprints[uid]))
        by_uid[uid].update(aiFit=fit, aiReason=reason, aiSignals=signals,
                           aiCached=False)
        meta["evaluated"] += 1
        allowed.remove(uid)
    if not meta["evaluated"] and not cached:
        return {"mode": "fallback_keyword", "reason": "유효한 AI 평가 없음 — 키워드 순위 사용"}
    return meta


# ── 독립 제품 모아보기: 브랜드가 고른 제품만 공개 목록에 올린다 ───────────

class PublicListingIn(BaseModel):
    listed: bool


@router.post("/brands/{brand}/products/{product_id}/public")
def set_public_listing(brand: str, product_id: UUID, body: PublicListingIn,
                       authorization: str = Header(default="")) -> dict:
    """공개 목록 표시 켜기/끄기. 켤 때는 공개용 소개·이미지가 있어야 한다.
    제품 소개·이미지는 운영팀이 검수해 등록한 값(product_invitation_profiles)만 쓴다."""
    u = _guard(brand, authorization)
    with connect() as conn:
        b = conn.execute("SELECT suspended_at, is_internal, is_demo FROM brands"
                         " WHERE brand_id=%s", (brand,)).fetchone()
        if not b or b["is_internal"] or b["is_demo"]:
            raise HTTPException(404, "고객 브랜드가 아닙니다")
        if b["suspended_at"]:
            raise HTTPException(409, "정지된 브랜드는 제품을 공개할 수 없습니다")
        p = _product(conn, brand, product_id)
        if body.listed:
            missing = _listing_missing(conn, p)
            if missing:
                raise HTTPException(409, "공개 전에 필요한 정보: " + ", ".join(missing))
        conn.execute(
            "UPDATE brand_products SET public_listed=%s,"
            " public_listed_at=CASE WHEN %s THEN now() ELSE public_listed_at END"
            " WHERE product_id=%s AND brand_id=%s",
            (body.listed, body.listed, product_id, brand))
        actor = f"brand:{brand}" if u.get("kind") == "brand" else str(u.get("sub"))
        ledger_append(conn, actor, "PRODUCT_PUBLIC_LISTING", str(product_id),
                      {"brandId": brand, "listed": body.listed})
        return _out(conn, _product(conn, brand, product_id))


public_router = APIRouter()

# 공개 소개: 운영 검수 소개 우선, 없으면 브랜드가 입력한 상세 설명
_EFF_SUMMARY = ("COALESCE(NULLIF(btrim(v.summary),''), NULLIF(btrim((SELECT fields->'description'->>'value'"
                " FROM product_profile_versions pv WHERE pv.product_id=p.product_id ORDER BY version DESC LIMIT 1)),''), '')")
_MAIN_IMAGE = ("(SELECT pi.image_id FROM product_images pi WHERE pi.product_id=p.product_id"
               " AND pi.slot='main' AND pi.deleted_at IS NULL)")
_PUBLIC_WHERE = (
    " p.public_listed AND p.state='active'"
    " AND b.suspended_at IS NULL AND NOT b.is_internal AND NOT b.is_demo"
    # 공개 조건은 읽을 때도 확인한다 — 공개 후 소개·이미지를 지우면 목록에서 빠진다
    " AND length(" + _EFF_SUMMARY + ") >= 10"
    " AND (v.image_url LIKE 'https://%%' OR " + _MAIN_IMAGE + " IS NOT NULL)")
_PUBLIC_FROM = (" FROM brand_products p JOIN brands b USING (brand_id)"
                " LEFT JOIN product_invitation_profiles v USING (product_id)")
_OPEN_CAMPAIGN = (
    "c.product_id=p.product_id AND c.brand_id=p.brand_id"   # 같은 브랜드 캠페인만
    " AND c.status='open' AND c.lifecycle='published'"
    " AND (c.deadline IS NULL OR c.deadline >= (now() AT TIME ZONE 'Asia/Seoul')::date)")


@public_router.get("/public/products")
def public_products(q: str = "", brand: str = "", category: str = "",
                    country: str = "", reward: str = "", can: bool = False,
                    ids: str = "", offset: int = 0, limit: int = 60) -> dict:
    """공개 표시한 제품만(서버 필터·페이지). 비공개·초안·정지·내부/데모 브랜드와
    공개 조건(소개·이미지)이 빠진 제품은 제외. 연락처·주소·계약 금액은 담지 않는다."""
    limit = max(1, min(int(limit or 60), 100))
    offset = max(0, int(offset or 0))
    where, args = [_PUBLIC_WHERE], []
    if q.strip():
        where.append("(p.name ILIKE %s OR b.name ILIKE %s)")
        like = "%" + q.strip()[:80].replace("%", r"\%").replace("_", r"\_") + "%"
        args += [like, like]
    if brand.strip():
        where.append("p.brand_id=%s"); args.append(brand.strip()[:40])
    if country.strip():
        if not re.fullmatch(r"[A-Z]{2}", country.strip().upper()):
            raise HTTPException(400, "국가는 ISO 2자리 코드입니다")
        where.append(f"EXISTS (SELECT 1 FROM campaigns c WHERE {_OPEN_CAMPAIGN}"
                     " AND (cardinality(c.countries)=0 OR %s = ANY(c.countries)))")
        args.append(country.strip().upper())
    rt = {"affiliate": "affiliate", "ugc": "paid", "sample": "gifted"}.get(reward.strip())
    if reward.strip() and not rt:
        raise HTTPException(400, "보상 방식은 affiliate/ugc/sample 중 하나입니다")
    if rt:
        where.append(f"EXISTS (SELECT 1 FROM campaigns c WHERE {_OPEN_CAMPAIGN} AND c.reward_type=%s)")
        args.append(rt)
    if can:
        where.append(f"EXISTS (SELECT 1 FROM campaigns c WHERE {_OPEN_CAMPAIGN})")
    if category.strip():
        # 분야: 제품 분야가 저장돼 있으면 그 값, 없을 때만 브랜드 분야(목록 표시와 같은 규칙)
        where.append("COALESCE(NULLIF((SELECT fields->'category'->>'value' FROM product_profile_versions pv"
                     " WHERE pv.product_id=p.product_id ORDER BY version DESC LIMIT 1),''), b.category)=%s")
        args.append(category.strip()[:60])
    if ids.strip():
        id_list = [x for x in ids.split(",")[:200] if re.fullmatch(r"[0-9a-f-]{36}", x.strip())]
        where.append("p.product_id::text = ANY(%s)"); args.append(id_list)
    with connect() as conn:
        base = _PUBLIC_FROM + " WHERE " + " AND ".join(where)
        rows = conn.execute(
            "SELECT p.product_id, p.brand_id, p.name, p.commission_pct,"
            " " + _EFF_SUMMARY + " AS summary, v.image_url, " + _MAIN_IMAGE + " AS main_image,"
            " b.name AS brand_name, b.logo_url,"
            " b.category AS brand_category,"
            " (SELECT fields->'category'->>'value' FROM product_profile_versions pv"
            "   WHERE pv.product_id=p.product_id ORDER BY version DESC LIMIT 1) AS product_category"
            + base + " ORDER BY p.public_listed_at DESC NULLS LAST, p.created_at DESC, p.product_id"
            " LIMIT %s OFFSET %s", args + [limit, offset]).fetchall()
        total = conn.execute("SELECT count(*) n" + base, args).fetchone()["n"]
        # 분야: 제품 분야가 저장돼 있으면 그 값, 없을 때만 브랜드 분야
        cats = conn.execute(
            "SELECT DISTINCT COALESCE(NULLIF((SELECT fields->'category'->>'value' FROM product_profile_versions pv"
            "   WHERE pv.product_id=p.product_id ORDER BY version DESC LIMIT 1),''), b.category) AS cat"
            + _PUBLIC_FROM + " WHERE " + _PUBLIC_WHERE).fetchall()
        brands = conn.execute(
            "SELECT DISTINCT p.brand_id, b.name" + _PUBLIC_FROM + " WHERE " + _PUBLIC_WHERE
            + " ORDER BY b.name").fetchall()
        ids_ = [r["product_id"] for r in rows]
        camps = conn.execute(
            "SELECT c.campaign_id, c.product_id, c.name, c.reward_type, c.affiliate_pct,"
            " c.reward_amount, c.reward_currency, c.platform, c.deadline, c.countries, c.conditions"
            " FROM campaigns c JOIN brand_products p ON " + _OPEN_CAMPAIGN +
            " WHERE p.product_id = ANY(%s) ORDER BY c.deadline NULLS LAST", (ids_,)).fetchall() if ids_ else []
        extras = conn.execute(
            "SELECT product_id, image_id FROM product_images WHERE product_id = ANY(%s) AND slot='extra'"
            " AND deleted_at IS NULL ORDER BY created_at", (ids_,)).fetchall() if ids_ else []
    ex = {}
    for x in extras:
        ex.setdefault(x["product_id"], []).append(f"/public/product-images/{x['image_id']}")
    by = {}
    for c in camps:
        by.setdefault(c["product_id"], []).append(
            {"campaignId": c["campaign_id"], "name": c["name"],
             "rewardType": c["reward_type"],
             "affiliatePct": float(c["affiliate_pct"]) if c["affiliate_pct"] is not None else None,
             "rewardAmount": c["reward_amount"], "rewardCurrency": c["reward_currency"],
             "platform": c["platform"],
             "deadline": c["deadline"].isoformat() if c["deadline"] else None,
             "countries": list(c["countries"] or []),
             "conditions": [str(x) for x in (c["conditions"] or []) if isinstance(x, (str, int, float))]})
    items = []
    for r in rows:
        cat = (r["product_category"] or "").strip() or (r["brand_category"] or "")
        items.append({"productId": str(r["product_id"]), "brandId": r["brand_id"],
                      "brandName": r["brand_name"],
                      "logoUrl": r["logo_url"] if (r["logo_url"] or "").startswith("https://") else "",
                      "category": cat, "name": r["name"], "summary": r["summary"] or "",
                      # 운영 검수 이미지 우선, 없으면 브랜드 업로드 대표 이미지(공개 표시 중인 제품만 익명 열람)
                      "imageUrl": r["image_url"] if (r["image_url"] or "").startswith("https://")
                      else (f"/public/product-images/{r['main_image']}" if r["main_image"] else ""),
                      "images": ex.get(r["product_id"], []),
                      "commissionPct": float(r["commission_pct"]),
                      "campaigns": by.get(r["product_id"], [])})
    return {"items": items, "total": total, "offset": offset, "limit": limit,
            "nextOffset": offset + len(items) if offset + len(items) < total else None,
            "facets": {"categories": sorted({c["cat"] for c in cats if c["cat"]}),
                       "brands": [{"brandId": b["brand_id"], "name": b["name"]} for b in brands]}}



# ── 제품 이미지 업로드(v8.1 B03) — 외부 스토리지 없이 DB 저장, 서명 URL 로 제공 ─────────
IMAGE_MAX = 2_000_000
IMAGE_EXTRA_MAX = 4
_MAGIC = (("image/jpeg", lambda b: b[:3] == b"\xff\xd8\xff"),
          ("image/png", lambda b: b[:8] == b"\x89PNG\r\n\x1a\n"),
          ("image/webp", lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP"))


def _sniff(data: bytes) -> str | None:
    return next((ct for ct, ok in _MAGIC if ok(data)), None)


def image_url(image_id, ttl: int = 12 * 3600) -> str:
    """이미지 서명 URL — 소유 브랜드·멤버 크리에이터 응답에만 실어 준다. 만료 시각은 시간 단위로 맞춰 캐시를 살린다."""
    import hmac as _h
    import time as _t
    exp = (int(_t.time()) // 3600 + 1) * 3600 + ttl
    sig = _h.new(auth._secret().encode(), f"{image_id}.{exp}".encode(), hashlib.sha256).hexdigest()[:32]
    return f"/public/product-images/{image_id}?e={exp}&s={sig}"


def product_images_out(conn, product_id) -> list[dict]:
    rows = conn.execute(
        "SELECT image_id, slot, content_type, size_bytes, created_at FROM product_images"
        " WHERE product_id=%s AND deleted_at IS NULL ORDER BY (slot='main') DESC, created_at",
        (product_id,)).fetchall()
    return [{"imageId": str(r["image_id"]), "slot": r["slot"], "contentType": r["content_type"],
             "size": r["size_bytes"], "url": image_url(r["image_id"]),
             "at": r["created_at"].isoformat()} for r in rows]


def main_image_url(conn, product_id) -> str | None:
    if not product_id:
        return None
    r = conn.execute("SELECT image_id FROM product_images WHERE product_id=%s AND slot='main'"
                     " AND deleted_at IS NULL", (product_id,)).fetchone()
    return image_url(r["image_id"]) if r else None


@router.post("/brands/{brand}/products/{product_id}/images")
async def upload_product_image(brand: str, product_id: UUID, request: Request, slot: str = "extra",
                               authorization: str = Header(default="")) -> dict:
    u = _guard(brand, authorization)
    if slot not in ("main", "extra"):
        raise HTTPException(400, "slot 은 main 또는 extra")
    declared = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if declared not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, "JPG·PNG·WEBP 이미지만 올릴 수 있어요")
    try:
        if int(request.headers.get("content-length") or 0) > IMAGE_MAX:
            raise HTTPException(413, "이미지는 2MB 이하만 올릴 수 있어요")
    except ValueError:
        raise HTTPException(400, "Content-Length 를 확인하세요")
    data = await request.body()
    if not data:
        raise HTTPException(400, "빈 파일입니다")
    if len(data) > IMAGE_MAX:
        raise HTTPException(413, "이미지는 2MB 이하만 올릴 수 있어요")
    if _sniff(data) != declared:
        raise HTTPException(415, "파일 내용이 이미지 형식과 맞지 않아요 (JPG·PNG·WEBP)")
    digest = hashlib.sha256(data).hexdigest()
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("product-images:" + str(product_id),))
        _product(conn, brand, product_id)
        if slot == "extra" and conn.execute(
                "SELECT count(*) n FROM product_images WHERE product_id=%s AND slot='extra' AND deleted_at IS NULL",
                (product_id,)).fetchone()["n"] >= IMAGE_EXTRA_MAX:
            raise HTTPException(409, f"추가 이미지는 {IMAGE_EXTRA_MAX}장까지예요")
        # 대표 교체: 같은 트랜잭션에서 이전 대표를 보관 → 새 저장이 실패하면 이전 대표가 그대로 남는다
        if slot == "main":
            conn.execute("UPDATE product_images SET deleted_at=now() WHERE product_id=%s AND slot='main'"
                         " AND deleted_at IS NULL", (product_id,))
        r = conn.execute(
            "INSERT INTO product_images (product_id, brand_id, slot, content_type, data, size_bytes, sha256, created_by)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING image_id",
            (product_id, brand, slot, declared, data, len(data), digest, str(u.get("sub") or ""))).fetchone()
        ledger_append(conn, f"brand:{brand}", "PRODUCT_IMAGE_UPLOADED", str(product_id),
                      {"imageId": str(r["image_id"]), "slot": slot, "size": len(data), "sha256": digest[:16]})
        return {"imageId": str(r["image_id"]), "slot": slot, "images": product_images_out(conn, product_id)}


@router.delete("/brands/{brand}/products/{product_id}/images/{image_id}")
def delete_product_image(brand: str, product_id: UUID, image_id: UUID,
                         authorization: str = Header(default="")) -> dict:
    _guard(brand, authorization)
    with connect() as conn:
        _product(conn, brand, product_id)
        r = conn.execute("UPDATE product_images SET deleted_at=now() WHERE image_id=%s AND product_id=%s"
                         " AND brand_id=%s AND deleted_at IS NULL RETURNING image_id",
                         (image_id, product_id, brand)).fetchone()
        if not r:
            raise HTTPException(404, "이미지를 찾을 수 없습니다")
        ledger_append(conn, f"brand:{brand}", "PRODUCT_IMAGE_DELETED", str(product_id), {"imageId": str(image_id)})
        return {"ok": True, "images": product_images_out(conn, product_id)}


@public_router.get("/public/product-images/{image_id}")
def serve_product_image(image_id: UUID, e: int = 0, s: str = "") -> Response:
    import hmac as _h
    import time as _t
    want = _h.new(auth._secret().encode(), f"{image_id}.{e}".encode(), hashlib.sha256).hexdigest()[:32]
    signed = bool(s) and _h.compare_digest(s, want) and e >= int(_t.time())
    with connect() as conn:
        r = conn.execute("SELECT content_type, data, product_id FROM product_images WHERE image_id=%s AND deleted_at IS NULL",
                         (image_id,)).fetchone()
        # 서명이 없거나 만료된 주소는 지금 공개 표시 중인(읽을 때 공개 조건 재확인) 제품의 이미지일 때만 연다
        public = bool(r) and not signed and bool(conn.execute(
            "SELECT 1" + _PUBLIC_FROM + " WHERE p.product_id=%s AND " + _PUBLIC_WHERE.replace("%%", "%%"),
            (r["product_id"],)).fetchone())
    if not r:
        raise HTTPException(404, "이미지를 찾을 수 없습니다")
    if not signed and not public:
        raise HTTPException(403, "만료됐거나 공개되지 않은 이미지 주소입니다 — 목록을 새로고침하세요")
    return Response(content=bytes(r["data"]), media_type=r["content_type"],
                    headers={"Cache-Control": ("public, max-age=300" if public else "private, max-age=3600"),
                             "X-Content-Type-Options": "nosniff",
                             "Content-Disposition": "inline", "Cross-Origin-Resource-Policy": "cross-origin"})
