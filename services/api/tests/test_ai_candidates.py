"""의미 기반 AI 후보 추천 — 근거 검증·캐시·비용 상한·폴백 (외부 호출 없음)."""

import os

import psycopg
from psycopg.rows import dict_row


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def _brand_token(client, email, brand):
    inv = client.post("/auth/invite", json={"email": email,
                                            "brand_id": brand}).json()
    tok = inv["demoLink"].split("invite=")[1]
    return client.post("/auth/accept", json={
        "token": tok, "password": "ai-match-pw-1"}).json()["token"]


def _seed_pool():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute(
            "INSERT INTO creator_pool (platform, platform_uid, handle, country,"
            " lang, category, product_tags, followers, contact_score, email,"
            " email_status) VALUES"
            " ('tiktok','ai-th','ai.th','TH',ARRAY['th'],ARRAY['ครีมกันแดด'],"
            "  ARRAY['sun care'],5000,60,'aith@ex.com','valid'),"
            " ('tiktok','ai-ja','ai.ja','JP',ARRAY['ja'],ARRAY['日焼け止め'],"
            "  ARRAY[]::text[],3000,70,'aija@ex.com','valid')"
            " ON CONFLICT DO NOTHING")
        conn.commit()


def _cleanup():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("DELETE FROM candidate_ai_scores WHERE platform_uid"
                     " LIKE 'ai-%'")
        conn.execute("DELETE FROM creator_pool WHERE platform_uid LIKE 'ai-%'")
        conn.commit()


def _product(client, t, name="AI 선세럼"):
    p = client.post("/brands/glowlab/products", json={"name": name},
                    headers=_bearer(t)).json()
    client.post(f"/brands/glowlab/products/{p['productId']}/profile",
                json={"answers": {"usp": "저자극 선케어 SPF50"}},
                headers=_bearer(t))
    return p["productId"]


def test_ai_mode_scores_validates_signals_and_caches(client, monkeypatch):
    """AI 평가: 언어 간 후보 데이터가 그대로 전달되고, 허구 근거는 버려지며,
    결과는 프로필 버전 단위로 캐시돼 재호출 없이 재사용된다."""
    from api import ai as ai_mod
    t = _brand_token(client, "aim-a@ex.com", "glowlab")
    _seed_pool()
    try:
        pid = _product(client, t, "AI 선세럼 알파")
        seen = {}

        def fake(product_name, fields, candidates):
            seen["payload"] = candidates
            return [
                {"uid": "ai-th", "fit": 91,
                 "reason": "태국어 태그 ครีมกันแดด가 선케어 제품과 같은 의미",
                 "signals": ["ครีมกันแดด", "존재하지-않는-태그"]},
                {"uid": "ai-ja", "fit": 84,
                 "reason": "일본어 태그 日焼け止め가 자외선 차단 제품",
                 "signals": ["日焼け止め"]},
                {"uid": "ai-fake", "fit": 99, "reason": "x", "signals": []},
                {"uid": "ai-th", "fit": 999, "reason": "범위밖", "signals": []},
            ]
        monkeypatch.setattr(ai_mod, "match_candidates", fake)
        r = client.get(f"/brands/glowlab/products/{pid}/candidates?mode=ai",
                       headers=_bearer(t)).json()
        assert r["ai"]["mode"] == "ai" and r["ai"]["evaluated"] == 2
        # 언어 간 원문 데이터가 그대로 AI에 전달됐다 (허구 입력 없음)
        sent = {c["uid"]: c for c in seen["payload"]}
        assert sent["ai-th"]["category"] == ["ครีมกันแดด"]
        assert sent["ai-ja"]["category"] == ["日焼け止め"]
        cands = {c["handle"]: c for c in r["candidates"]}
        assert cands["ai.th"]["aiFit"] == 91
        # 허구 근거("존재하지-않는-태그")는 채택되지 않는다 — 실데이터만
        assert cands["ai.th"]["aiSignals"] == ["ครีมกันแดด"]
        assert cands["ai.ja"]["aiSignals"] == ["日焼け止め"]
        # 존재하지 않는 uid·범위 밖 점수는 거부됐다
        assert all(c.get("aiFit") in (91, 84, None) for c in r["candidates"])
        # AI 점수 순 정렬 (키워드 순위와 무관하게 91 > 84 우선)
        top2 = [c["handle"] for c in r["candidates"][:2]]
        assert top2 == ["ai.th", "ai.ja"]
        assert "실측 지표도 생성하지 않" in r["note"]

        # 캐시: 두 번째 호출은 AI가 죽어도 캐시로 응답 (재호출 없음)
        def boom(*a):
            raise TimeoutError("down")
        monkeypatch.setattr(ai_mod, "match_candidates", boom)
        r2 = client.get(f"/brands/glowlab/products/{pid}/candidates?mode=ai",
                        headers=_bearer(t)).json()
        assert r2["ai"]["mode"] == "ai" and r2["ai"]["cachedHits"] == 2
        c2 = {c["handle"]: c for c in r2["candidates"]}
        assert c2["ai.th"]["aiCached"] is True and c2["ai.th"]["aiFit"] == 91
    finally:
        _cleanup()


def test_ai_mode_fallbacks_are_honest(client, monkeypatch):
    """미연동(None)·호출 실패·일일 상한 각각에서 키워드 랭킹으로 폴백하고
    사유를 명시한다. 점수·지표를 만들어내지 않는다."""
    from api import ai as ai_mod
    t = _brand_token(client, "aim-b@ex.com", "glowlab")
    _seed_pool()
    try:
        pid = _product(client, t, "AI 선세럼 베타")
        # ① 미연동 → fallback_keyword + 사유
        monkeypatch.setattr(ai_mod, "match_candidates", lambda *a: None)
        r = client.get(f"/brands/glowlab/products/{pid}/candidates?mode=ai",
                       headers=_bearer(t)).json()
        assert r["ai"]["mode"] == "fallback_keyword"
        assert "미연동" in r["ai"]["reason"]
        assert all("aiFit" not in c for c in r["candidates"])
        # ② 호출 실패 → fallback + 사유
        def boom(*a):
            raise TimeoutError("down")
        monkeypatch.setattr(ai_mod, "match_candidates", boom)
        r = client.get(f"/brands/glowlab/products/{pid}/candidates?mode=ai",
                       headers=_bearer(t)).json()
        assert r["ai"]["mode"] == "fallback_keyword"
        assert "TimeoutError" in r["ai"]["reason"]
        # ③ 일일 상한 0 → 신규 평가 없이 폴백 + 사유
        monkeypatch.setenv("AI_MATCH_DAILY_CAP", "0")
        called = []
        monkeypatch.setattr(ai_mod, "match_candidates",
                            lambda *a: called.append(1) or [])
        r = client.get(f"/brands/glowlab/products/{pid}/candidates?mode=ai",
                       headers=_bearer(t)).json()
        assert r["ai"]["mode"] == "fallback_keyword" and "상한" in r["ai"]["reason"]
        assert called == []                      # 상한이면 호출 자체가 없다
        # 기본 keyword 모드는 AI 메타 없이 기존과 동일
        r = client.get(f"/brands/glowlab/products/{pid}/candidates",
                       headers=_bearer(t)).json()
        assert r["ai"]["mode"] == "keyword"
    finally:
        _cleanup()


def test_ai_mode_per_call_cap(client, monkeypatch):
    """호출당 평가 상한: AI_MATCH_MAX_CANDIDATES=1이면 배치에 1명만 전달."""
    from api import ai as ai_mod
    t = _brand_token(client, "aim-c@ex.com", "glowlab")
    _seed_pool()
    try:
        pid = _product(client, t, "AI 선세럼 감마")
        monkeypatch.setenv("AI_MATCH_MAX_CANDIDATES", "1")
        batches = []

        def fake(product_name, fields, candidates):
            batches.append(len(candidates))
            return [{"uid": c["uid"], "fit": 50, "reason": "제공 데이터 평가",
                     "signals": []} for c in candidates]
        monkeypatch.setattr(ai_mod, "match_candidates", fake)
        r = client.get(f"/brands/glowlab/products/{pid}/candidates?mode=ai",
                       headers=_bearer(t)).json()
        assert batches == [1] and r["ai"]["evaluated"] == 1
        # 다음 호출은 캐시 1 + 신규 1 — 호출당 1명 유지
        r2 = client.get(f"/brands/glowlab/products/{pid}/candidates?mode=ai",
                        headers=_bearer(t)).json()
        assert batches == [1, 1]
        assert r2["ai"]["cachedHits"] >= 1 and r2["ai"]["evaluated"] == 1
    finally:
        _cleanup()
