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
                       limit: int = 20,
                       authorization: str = Header(default="")) -> dict:
    """제품·브랜드 적합도를 실제 순위에 반영한 후보 추천.

    적합도 = 제품 이름·프로필 필드에서 뽑은 키워드와 후보의 category/product_tags
    (수집엔진 실측 분류)의 교집합 수. 적합도 우선, 동률은 접촉·영향력 점수순.
    모든 순위 근거를 후보별 evidence로 반환하며 지표를 생성하지 않는다.
    """
    _guard(brand, authorization)
    limit = max(1, min(limit, 50))
    country = country.strip().upper()[:2]
    with connect() as conn:
        p = _product(conn, brand, product_id)
        _, fields = _latest_fields(conn, product_id)
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
                           {"handle": r["handle"],
                            "displayName": r["display_name"],
                            "country": r["country"],
                            "followers": r["followers"],
                            "fitScore": fit, "matchedTerms": matched,
                            "evidence": evidence}))
        scored.sort(key=lambda x: (-x[0], -x[1], -x[2], -x[3]))
        out = [x[4] for x in scored[:limit]]
    return {"productId": str(product_id), "productName": p["name"],
            "productFieldsUsed": sorted(set(used_fields)),
            "candidates": out,
            "note": ("적합도는 제품 프로필 텍스트와 후보의 수집된 분류"
                     "(category/product_tags)의 문자 일치 — 유니코드 정규화·"
                     "대소문자 무시 키워드/태그 구문 교집합 — 로만 계산합니다."
                     " 의미 추론 AI가 아니며, 후보 지표를 생성하지 않습니다."
                     " 아웃리치 발송은 초안 검토·승인 후에만 진행됩니다.")}
