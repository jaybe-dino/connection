"""브랜드 복수 제품 — 제품별 학습(근거·버전) · 제품별 캠페인 · AI 후보 추천.

학습 파이프라인은 기존 /brand-learning(레이트리밋·근거 인용 검증 포함)을 그대로
재사용한다: UI가 제품 페이지 URL을 /brand-learning으로 분석 → learning_id를
이 라우터의 제품 프로필 저장에 넘긴다.

후보 추천은 허용된 내부 후보 DB(creator_pool — 수집엔진이 공개 자료·계약 벤더
API로 채운 것)에서 결정적(비생성) 기준으로 뽑고, 각 후보에 '왜'를 데이터 근거
문자열로 붙인다. 존재하지 않는 지표를 만들어내지 않는다.
"""

import json
import re
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import auth
from .db import connect, ledger_append

router = APIRouter()

PRODUCT_KEYS = {"product_one_liner", "hero_product", "ingredients",
                "price_range", "usp", "target_audience", "voice"}

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


def _out(conn, p):
    version, fields = _latest_fields(conn, p["product_id"])
    return {"productId": str(p["product_id"]), "brandId": p["brand_id"],
            "name": p["name"], "tiktokProductRef": p["tiktok_product_ref"],
            "commissionPct": float(p["commission_pct"]), "state": p["state"],
            "profileVersion": version, "fields": fields}


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
            "SELECT platform_uid, handle, display_name, country, lang,"
            "       category, product_tags, followers, engagement_rate,"
            "       influence_score, contact_score, email_status"
            " FROM creator_pool"
            " WHERE email IS NOT NULL AND email_status='valid'"
            "   AND (%s = '' OR country = %s)"
            "   AND NOT EXISTS (SELECT 1 FROM outreach_optouts o"
            "        WHERE o.brand_id=%s AND o.email=creator_pool.email"
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
            evidence.append("이메일 검증 통과 · 수신거부 이력 없음")
            scored.append((fit, r["contact_score"] or 0,
                           r["influence_score"] or 0, r["followers"] or 0,
                           {"uid": r["platform_uid"], "handle": r["handle"],
                            "displayName": r["display_name"],
                            "country": r["country"],
                            "followers": r["followers"],
                            "fitScore": fit, "matchedTerms": matched,
                            "evidence": evidence}))
        scored.sort(key=lambda x: (-x[0], -x[1], -x[2], -x[3]))
        ai_meta = {"mode": "keyword"}
        if mode == "ai":
            rows_by_uid = {r["platform_uid"]: r for r in rows}
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
    per_call = int(_os.environ.get("AI_MATCH_MAX_CANDIDATES",
                                   AI_MATCH_MAX_PER_CALL))
    daily_cap = int(_os.environ.get("AI_MATCH_DAILY_CAP", AI_MATCH_DAILY_CAP))
    uids = [d["uid"] for d in pool]
    if not uids:
        return {"mode": "fallback_keyword", "reason": "평가할 후보가 없습니다"}
    cached = conn.execute(
        "SELECT platform_uid, fit, reason, signals FROM candidate_ai_scores"
        " WHERE product_id=%s AND profile_version=%s AND platform_uid=ANY(%s)",
        (p["product_id"], profile_version, uids)).fetchall()
    by_uid = {d["uid"]: d for d in pool}
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
        "SELECT count(*) n FROM candidate_ai_scores s"
        " JOIN brand_products bp USING (product_id)"
        " WHERE bp.brand_id=%s AND s.created_at >= date_trunc('day', now())",
        (p["brand_id"],)).fetchone()["n"]
    if used_today >= daily_cap:
        if cached:
            meta["notice"] = "일일 AI 평가 상한 도달 — 캐시된 평가만 사용"
            return meta
        return {"mode": "fallback_keyword",
                "reason": f"일일 AI 평가 상한({daily_cap}건) 도달 — 키워드 순위 사용"}
    batch = uncached[:max(1, min(per_call, daily_cap - used_today))]
    payload = []
    for d in batch:
        r = rows_by_uid[d["uid"]]
        payload.append({"uid": r["platform_uid"], "handle": r["handle"],
                        "country": r["country"], "lang": r["lang"],
                        "category": list(r["category"] or []),
                        "product_tags": list(r["product_tags"] or []),
                        "followers": r["followers"],
                        "engagement_rate": (float(r["engagement_rate"])
                                            if r["engagement_rate"] is not None
                                            else None)})
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
    allowed = {d["uid"] for d in batch}
    for item in results:
        uid = str(item.get("uid", ""))
        fit = item.get("fit")
        if uid not in allowed or not isinstance(fit, int) or not 0 <= fit <= 100:
            continue                       # 허구 uid·범위 밖 점수 거부
        r = rows_by_uid[uid]
        data_terms = {_norm(str(t)) for t in
                      list(r["category"] or []) + list(r["product_tags"] or [])}
        signals = [str(s)[:120] for s in (item.get("signals") or [])
                   if isinstance(s, str) and _norm(s) in data_terms][:8]
        reason = str(item.get("reason", ""))[:300]
        conn.execute(
            "INSERT INTO candidate_ai_scores (product_id, profile_version,"
            " platform_uid, fit, reason, signals, model)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            (p["product_id"], profile_version, uid, fit, reason,
             json.dumps(signals, ensure_ascii=False), _ai.MODEL))
        by_uid[uid].update(aiFit=fit, aiReason=reason, aiSignals=signals,
                           aiCached=False)
        meta["evaluated"] += 1
    return meta
