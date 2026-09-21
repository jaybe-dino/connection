"""복수 제품 학습(버전·근거)·제품별 캠페인·후보 추천 — 브랜드 격리 포함."""

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
        "token": tok, "password": "products-pw-1"}).json()["token"]


def test_product_crud_profile_versioning(client):
    t = _brand_token(client, "prod-a@ex.com", "glowlab")
    p = client.post("/brands/glowlab/products", json={
        "name": "시카 진정 앰플", "tiktok_product_ref": "tt-12345",
        "commission_pct": 12}, headers=_bearer(t)).json()
    pid = p["productId"]
    assert p["commissionPct"] == 12 and p["profileVersion"] == 0
    # 같은 이름 중복 금지
    assert client.post("/brands/glowlab/products", json={
        "name": "시카 진정 앰플"}, headers=_bearer(t)).status_code == 409

    # 직접 입력 저장 → v1, 재저장(수정) → v2, 이전 버전 보존
    v1 = client.post(f"/brands/glowlab/products/{pid}/profile", json={
        "answers": {"product_one_liner": "민감 피부 진정 앰플",
                    "price_range": "2만원대"}}, headers=_bearer(t)).json()
    assert v1["version"] == 1 and v1["fields"]["price_range"]["confirmed"]
    v2 = client.post(f"/brands/glowlab/products/{pid}/profile", json={
        "answers": {"usp": "48시간 진정 테스트"}}, headers=_bearer(t)).json()
    assert v2["version"] == 2
    assert v2["fields"]["product_one_liner"]["value"] == "민감 피부 진정 앰플"
    with psycopg.connect(os.environ["DATABASE_URL"],
                         row_factory=dict_row) as conn:
        n = conn.execute("SELECT count(*) c FROM product_profile_versions"
                         " WHERE product_id=%s", (pid,)).fetchone()["c"]
    assert n == 2                                  # 버전 이력 보존

    # 학습 결과 연동: 근거 인용이 있는 ready 학습만 허용
    assert client.post(f"/brands/glowlab/products/{pid}/profile", json={
        "learning_id": "00000000-0000-0000-0000-000000000001"},
        headers=_bearer(t)).status_code == 400


def test_product_isolation(client, monkeypatch):
    a = _brand_token(client, "prod-iso-a@ex.com", "glowlab")
    b = _brand_token(client, "prod-iso-b@ex.com", "aura")
    # 순서 독립: 목록 인덱스가 아니라 이 테스트가 직접 만든 제품 ID를 쓴다
    pid = client.post("/brands/glowlab/products", json={
        "name": "격리 테스트 크림"}, headers=_bearer(a)).json()["productId"]
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    # 타 브랜드 계정으로 제품 조회·저장·캠페인 개설 전부 403
    assert client.get("/brands/glowlab/products",
                      headers=_bearer(b)).status_code == 403
    assert client.post(f"/brands/glowlab/products/{pid}/profile",
                       json={"answers": {"usp": "x"}},
                       headers=_bearer(b)).status_code == 403
    assert client.post(f"/brands/glowlab/products/{pid}/campaigns",
                       json={"name": "x"}, headers=_bearer(b)).status_code == 403
    # aura 경로로 glowlab 제품 ID를 넘겨도 404 (경로-소유 불일치)
    assert client.post(f"/brands/aura/products/{pid}/campaigns",
                       json={"name": "x"}, headers=_bearer(b)).status_code == 404


def test_product_campaign_and_candidates(client):
    t = _brand_token(client, "prod-a@ex.com", "glowlab")
    # 순서 독립: 목록 인덱스가 아니라 이 테스트가 직접 만든 제품 ID를 쓴다
    pid = client.post("/brands/glowlab/products", json={
        "name": "캠페인·후보 테스트 앰플", "commission_pct": 12},
        headers=_bearer(t)).json()["productId"]
    c = client.post(f"/brands/glowlab/products/{pid}/campaigns", json={
        "name": "9월 시카 앰플 · 태국 어필리에이트", "capacity": 30,
        "conditions": ["15초 이상", "#ad 표기"]}, headers=_bearer(t)).json()
    assert c["rewardType"] == "affiliate" and c["affiliatePct"] == 12
    with psycopg.connect(os.environ["DATABASE_URL"],
                         row_factory=dict_row) as conn:
        row = conn.execute("SELECT product_id, affiliate_pct FROM campaigns"
                           " WHERE campaign_id=%s",
                           (c["campaignId"],)).fetchone()
        assert str(row["product_id"]) == pid
        # 후보 풀 시드 (수집엔진 실데이터 형태)
        conn.execute(
            "INSERT INTO creator_pool (platform, platform_uid, handle,"
            " display_name, country, category, followers, engagement_rate,"
            " influence_score, contact_score, email, email_status)"
            " VALUES ('tiktok','uid-th-1','ploy.beauty','Ploy','TH',"
            " ARRAY['beauty'],52000,0.041,71,88,'ploy@ex.com','valid'),"
            " ('tiktok','uid-th-2','nok.skin','Nok','TH',ARRAY['skincare'],"
            " 8000,0.062,55,80,'nok@ex.com','valid'),"
            " ('tiktok','uid-vn-1','linh.glow','Linh','VN',ARRAY['beauty'],"
            " 90000,0.03,80,70,'linh@ex.com','valid'),"
            " ('tiktok','uid-bad','x.spam','X','TH',ARRAY['beauty'],"
            " 100,0.01,5,5,'bad@ex.com','none')"
            " ON CONFLICT DO NOTHING")
        conn.commit()

    r = client.get(f"/brands/glowlab/products/{pid}/candidates?country=TH",
                   headers=_bearer(t)).json()
    handles = [x["handle"] for x in r["candidates"]]
    assert "ploy.beauty" in handles and "nok.skin" in handles
    assert "linh.glow" not in handles              # 국가 필터
    assert "x.spam" not in handles                 # 이메일 미검증 제외
    top = r["candidates"][0]
    assert top["handle"] == "ploy.beauty"          # contact_score 순
    assert any("팔로워" in e for e in top["evidence"])
    assert any("수신거부" in e for e in top["evidence"])
    assert "생성하지 않" in r["note"]           # 지표 비생성 명시

    # 다른 테스트(러너 등록 수 기대치)에 영향 없도록 시드 정리
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("DELETE FROM creator_pool WHERE platform_uid LIKE 'uid-%'")
        conn.commit()


def test_decimal_commission_preserved(client):
    """검수 회귀: 12.5% 커미션이 캠페인까지 소수 그대로 보존돼야 한다."""
    t = _brand_token(client, "prod-a@ex.com", "glowlab")
    p = client.post("/brands/glowlab/products", json={
        "name": "소수점 테스트 세럼", "commission_pct": 12.5},
        headers=_bearer(t)).json()
    assert p["commissionPct"] == 12.5
    c = client.post(f"/brands/glowlab/products/{p['productId']}/campaigns",
                    json={"name": "소수 커미션 캠페인"},
                    headers=_bearer(t)).json()
    assert c["affiliatePct"] == 12.5
    with psycopg.connect(os.environ["DATABASE_URL"],
                         row_factory=dict_row) as conn:
        row = conn.execute("SELECT affiliate_pct FROM campaigns"
                           " WHERE campaign_id=%s", (c["campaignId"],)).fetchone()
    assert float(row["affiliate_pct"]) == 12.5


def test_candidates_multilingual_tokens_and_exclusions(client):
    """검수 재현: 태국어·일본어 제품/태그가 [^0-9A-Za-z가-힣] 토큰화로 전부
    지워져 fitScore=0이던 결함. 유니코드 정규화·casefold 공통 정책으로
    태국어(미분절 구문 포함)·일본어·베트남어 악센트(NFD/NFC)·대소문자를
    일관 비교하고, 국가 필터·수신거부 제외는 그대로 유지한다."""
    import unicodedata
    t = _brand_token(client, "prod-a@ex.com", "glowlab")

    def make(name):
        return client.post("/brands/glowlab/products", json={"name": name},
                           headers=_bearer(t)).json()["productId"]
    pid_th = make("ครีมกันแดดสูตรอ่อนโยน")     # 태국어 — 태그가 이름의 부분 구문
    pid_jp = make("日焼け止め ミルク")
    pid_vi = make("Kem Chống Nắng SPF50")       # NFC — 후보 태그는 NFD로 저장
    vi_nfd = unicodedata.normalize("NFD", "kem chống nắng")
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute(
            "INSERT INTO creator_pool (platform, platform_uid, handle, country,"
            " category, followers, contact_score, email, email_status) VALUES"
            " ('tiktok','ml-th','th.cr','TH',ARRAY['ครีมกันแดด'],1000,50,"
            "  'mlth@ex.com','valid'),"
            " ('tiktok','ml-jp','jp.cr','JP',ARRAY['日焼け止め'],1000,50,"
            "  'mljp@ex.com','valid'),"
            " ('tiktok','ml-vi','vi.cr','VN',ARRAY[%s],1000,50,"
            "  'mlvi@ex.com','valid'),"
            " ('tiktok','ml-opt','opt.cr','TH',ARRAY['ครีมกันแดด'],9000,99,"
            "  'mlopt@ex.com','valid') ON CONFLICT DO NOTHING", (vi_nfd,))
        conn.execute("INSERT INTO outreach_optouts (brand_id,email,opted_out_at)"
                     " VALUES ('glowlab','mlopt@ex.com',now())"
                     " ON CONFLICT DO NOTHING")
        conn.commit()
    try:
        # 태국어: 태그(ครีมกันแดด)가 제품명(미분절 구문)의 일부 — 구문 일치
        r = client.get(f"/brands/glowlab/products/{pid_th}/candidates?country=TH",
                       headers=_bearer(t)).json()
        handles = {x["handle"]: x for x in r["candidates"]}
        assert "th.cr" in handles
        assert handles["th.cr"]["fitScore"] >= 1
        assert "ครีมกันแดด" in handles["th.cr"]["matchedTerms"]
        assert "opt.cr" not in handles          # 수신거부 제외 유지
        assert "jp.cr" not in handles           # 국가 필터 유지(JP≠TH)
        assert "의미 추론" in r["note"]          # 키워드 매칭 한계 명시
        # 일본어
        r = client.get(f"/brands/glowlab/products/{pid_jp}/candidates?country=JP",
                       headers=_bearer(t)).json()
        jp = {x["handle"]: x for x in r["candidates"]}
        assert jp["jp.cr"]["fitScore"] >= 1
        assert "日焼け止め" in jp["jp.cr"]["matchedTerms"]
        # 베트남어 악센트: NFD 태그 vs NFC 제품명 + 대소문자 차이 → 일치
        r = client.get(f"/brands/glowlab/products/{pid_vi}/candidates?country=VN",
                       headers=_bearer(t)).json()
        vi = {x["handle"]: x for x in r["candidates"]}
        assert vi["vi.cr"]["fitScore"] >= 2      # kem/chống/nắng 토큰 일치
        assert any("chống" in m for m in vi["vi.cr"]["matchedTerms"])
    finally:
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            conn.execute("DELETE FROM creator_pool WHERE platform_uid LIKE 'ml-%'")
            conn.execute("DELETE FROM outreach_optouts WHERE email='mlopt@ex.com'")
            conn.commit()


def test_candidates_ranked_by_product_fit(client):
    """검수 반영: 제품 프로필이 실제 순위를 바꾼다 — 서로 다른 제품은
    서로 다른 후보가 1위가 되고, 근거에 일치 키워드가 명시된다."""
    t = _brand_token(client, "prod-a@ex.com", "glowlab")
    def make(name, usp):
        p = client.post("/brands/glowlab/products",
                        json={"name": name}, headers=_bearer(t)).json()
        client.post(f"/brands/glowlab/products/{p['productId']}/profile",
                    json={"answers": {"usp": usp}}, headers=_bearer(t))
        return p["productId"]
    pid_sun = make("선쿠션 핏테스트", "sunscreen spf protection")
    pid_amp = make("앰플 핏테스트", "ampoule serum soothing")
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute(
            "INSERT INTO creator_pool (platform, platform_uid, handle, country,"
            " category, followers, contact_score, email, email_status) VALUES"
            " ('tiktok','fit-sun','sun.cr','TH',ARRAY['sunscreen'],1000,10,"
            "  'sun@ex.com','valid'),"
            " ('tiktok','fit-amp','amp.cr','TH',ARRAY['ampoule'],1000,99,"
            "  'amp@ex.com','valid') ON CONFLICT DO NOTHING")
        conn.commit()
    try:
        r1 = client.get(f"/brands/glowlab/products/{pid_sun}/candidates?country=TH",
                        headers=_bearer(t)).json()
        r2 = client.get(f"/brands/glowlab/products/{pid_amp}/candidates?country=TH",
                        headers=_bearer(t)).json()
        # 적합도가 접촉점수(99>10)를 이긴다: 선쿠션 → sun.cr 1위
        assert r1["candidates"][0]["handle"] == "sun.cr"
        assert r1["candidates"][0]["fitScore"] >= 1
        assert "sunscreen" in r1["candidates"][0]["matchedTerms"]
        assert any("제품 적합" in e for e in r1["candidates"][0]["evidence"])
        # 앰플 → amp.cr 1위 (제품이 다르면 순위가 달라진다)
        assert r2["candidates"][0]["handle"] == "amp.cr"
        assert "ampoule" in r2["candidates"][0]["matchedTerms"]
        assert "usp" in r1["productFieldsUsed"]
    finally:
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            conn.execute("DELETE FROM creator_pool WHERE platform_uid LIKE 'fit-%'")
            conn.commit()
