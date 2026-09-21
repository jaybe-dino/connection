"""캠페인 협업 완주 — 새 브랜드 2개: 가입→승인→합류→대화→선정→합의→
샘플→spark/콘텐츠→완료, 그리고 두 브랜드 간 격리 (028 campaign_terms)."""

ADMIN = {"X-Admin-Id": "jay"}


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def _creator_token(client, email):
    r = client.post("/auth/magic", json={"email": email}).json()
    tok = r["demoLink"].split("magic=")[1]
    return client.post("/auth/magic/verify", json={"token": tok}).json()["token"]


def _approved_brand(client, slug, name, email):
    r = client.post("/applications", json={
        "slug": slug, "name": name, "biz_no": "321-54-09876",
        "category": "스킨케어", "countries": ["TH"], "contact": email})
    assert r.status_code == 200, r.text
    apps = client.get("/admin/applications", headers=ADMIN).json()
    app_id = next(a["appId"] for a in apps if a["slug"] == slug)
    ap = client.post(f"/admin/applications/{app_id}/approve",
                     headers=ADMIN).json()
    tok = ap["inviteLink"].split("invite=")[1]
    return client.post("/auth/accept", json={
        "token": tok, "password": "collab-brand-pw-1"}).json()["token"]


def test_two_new_brands_full_campaign_journey(client, monkeypatch):
    t1 = _approved_brand(client, "joyone", "조이원", "own@joyone.kr")
    t2 = _approved_brand(client, "joytwo", "조이투", "own@joytwo.kr")

    # 브랜드1: 제품 등록 → 캠페인 개설 (소수 수수료 유지 확인)
    p = client.post("/brands/joyone/products", json={
        "name": "조이원 선세럼", "tiktok_product_ref": "tt-joy-1",
        "commission_pct": 15.5}, headers=_bearer(t1)).json()
    camp = client.post(f"/brands/joyone/products/{p['productId']}/campaigns",
                       json={"name": "조이원 태국 모집"},
                       headers=_bearer(t1)).json()
    cid = camp["campaignId"]

    monkeypatch.setenv("AUTH_REQUIRED", "1")

    # 크리에이터: 로그인 → 브랜드1 합류 → 기본 셀에서 대화 → 캠페인 목록
    ctok = _creator_token(client, "collab.joy@ex.com")
    ch = _bearer(ctok)
    assert client.post("/me/join", json={"brand_id": "joyone"},
                       headers=ch).status_code == 200
    assert client.post("/community/cells/cell-joyone-main/messages", json={
        "text": "สวัสดีค่ะ 캠페인 기대돼요!", "locale": "th"},
        headers=ch).status_code == 200
    my = client.get("/me/campaigns", headers=ch).json()
    row = next(c for c in my if c["campaignId"] == cid)
    assert row["brandId"] == "joyone" and row["myStatus"] == "none"
    assert row["affiliatePct"] == 15.5

    # 지원 → 브랜드 지원자 목록에 등장
    assert client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"},
                       headers=ch).status_code == 200
    apps = client.get(f"/brands/joyone/campaigns/{cid}/applicants",
                      headers=_bearer(t1)).json()
    assert len(apps) == 1 and apps[0]["termsState"] is None
    creator_id = apps[0]["creatorId"]

    # 미지원자 선정 차단 → 정상 선정(수수료 제안)
    assert client.post(f"/brands/joyone/campaigns/{cid}/select", json={
        "creator_id": "c-nobody", "commission_pct": 10},
        headers=_bearer(t1)).status_code == 409
    sel = client.post(f"/brands/joyone/campaigns/{cid}/select", json={
        "creator_id": creator_id, "commission_pct": 15.5},
        headers=_bearer(t1)).json()
    assert sel["state"] == "selected" and sel["commissionPct"] == 15.5

    # 크리에이터: 오퍼 확인 → 핸들 없이 합의 불가 → 합의(수수료 확정)
    offers = client.get("/me/campaign-offers", headers=ch).json()
    assert offers and offers[0]["campaignId"] == cid
    assert client.post(f"/me/campaign-offers/{cid}/agree", json={
        "accept": True}, headers=ch).status_code == 400
    ag = client.post(f"/me/campaign-offers/{cid}/agree", json={
        "accept": True, "tiktok_handle": "@collab.joy"}, headers=ch).json()
    assert ag["state"] == "terms_agreed"
    assert ag["agreedCommissionPct"] == 15.5      # 제안값이 그대로 확정

    # 순서 강제: 샘플 발송 전 콘텐츠 제출은 가능(디지털)이지만 완료는 불가
    assert client.post(
        f"/brands/joyone/campaigns/{cid}/terms/{creator_id}/complete",
        headers=_bearer(t1)).status_code == 409

    # 브랜드: 샘플 발송 + 어필리에이트 링크 발급(브랜드 권한)
    sh = client.post(
        f"/brands/joyone/campaigns/{cid}/terms/{creator_id}/sample-shipped",
        json={"tracking": "KR123456789TH"}, headers=_bearer(t1)).json()
    assert sh["state"] == "sample_shipped"
    al = client.post(
        f"/brands/joyone/campaigns/{cid}/terms/{creator_id}/affiliate-link",
        json={"link": "https://vt.tiktok.com/joyone-sun"},
        headers=_bearer(t1)).json()
    assert al["affiliateLink"].startswith("https://")

    # 크리에이터: spark 코드 제출(크리에이터 권한) + 콘텐츠 제출
    sp = client.post(f"/me/campaign-offers/{cid}/spark-code",
                     json={"spark_code": "SPARK-9F2K"}, headers=ch).json()
    assert sp["sparkCode"] == "SPARK-9F2K"
    ct = client.post(f"/me/campaign-offers/{cid}/content", json={
        "content_url": "https://www.tiktok.com/@collab.joy/video/1"},
        headers=ch).json()
    assert ct["state"] == "content_submitted"

    # 브랜드: 완료 확정 → 지원 상태도 passed
    done = client.post(
        f"/brands/joyone/campaigns/{cid}/terms/{creator_id}/complete",
        headers=_bearer(t1)).json()
    assert done["state"] == "completed"
    apps = client.get(f"/brands/joyone/campaigns/{cid}/applicants",
                      headers=_bearer(t1)).json()
    assert apps[0]["termsState"] == "completed"

    # ── 브랜드 간 격리 ──
    # 브랜드2는 브랜드1 캠페인의 지원자·선정에 접근 불가
    assert client.get(f"/brands/joyone/campaigns/{cid}/applicants",
                      headers=_bearer(t2)).status_code == 403
    assert client.post(f"/brands/joytwo/campaigns/{cid}/select", json={
        "creator_id": creator_id, "commission_pct": 5},
        headers=_bearer(t2)).status_code == 404   # 경로-소유 불일치
    # 브랜드2 미합류 크리에이터의 /me/campaigns에는 브랜드2 것이 없다
    assert all(c["brandId"] != "joytwo"
               for c in client.get("/me/campaigns", headers=ch).json())
    # 크리에이터 커뮤니티도 격리: 브랜드2 기본 셀 접근 403
    assert client.get("/community/cells/cell-joytwo-main/messages",
                      headers=ch).status_code == 403

    # 원장에 협업 이벤트가 남는다 (어드민 JWT 없이 레거시 /ledger는 잠김)
    monkeypatch.delenv("AUTH_REQUIRED")
    ledger = client.get("/ledger?limit=200").json()["entries"]
    for ev in ["CAMPAIGN_CREATOR_SELECTED", "CAMPAIGN_TERMS_AGREED",
               "CAMPAIGN_SAMPLE_SHIPPED", "AFFILIATE_LINK_ISSUED",
               "SPARK_CODE_SUBMITTED", "CAMPAIGN_CONTENT_SUBMITTED",
               "CAMPAIGN_TERMS_COMPLETED"]:
        assert any(e["type"] == ev and e["subject"] == cid for e in ledger), ev


def _db_exec(sql, args=()):
    import os

    import psycopg
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute(sql, args)
        conn.commit()


def test_apply_server_side_guards(client, monkeypatch):
    """검수 반영: 지원 시 캠페인 존재/모집 상태/마감일/멤버십을 서버가 검사,
    재지원은 멱등이며 실제 상태를 반환한다."""
    t = _approved_brand(client, "guardone", "가드원", "own@guardone.kr")
    p = client.post("/brands/guardone/products", json={
        "name": "가드 세럼"}, headers=_bearer(t)).json()
    mk = lambda nm: client.post(
        f"/brands/guardone/products/{p['productId']}/campaigns",
        json={"name": nm}, headers=_bearer(t)).json()["campaignId"]
    c_open, c_closed, c_late = mk("모집중"), mk("모집종료"), mk("마감경과")
    _db_exec("UPDATE campaigns SET status='closed' WHERE campaign_id=%s",
             (c_closed,))
    _db_exec("UPDATE campaigns SET deadline=CURRENT_DATE-1 WHERE campaign_id=%s",
             (c_late,))

    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ctok = _creator_token(client, "guard.creator@ex.com")
    ch = _bearer(ctok)

    # 멤버십 없는 크리에이터 → 403 (모집 중 캠페인이어도)
    assert client.post(f"/campaigns/{c_open}/apply", json={"creator_id": "x"},
                       headers=ch).status_code == 403
    # 존재하지 않는 캠페인 → 404
    assert client.post("/campaigns/cmp-none/apply", json={"creator_id": "x"},
                       headers=ch).status_code == 404

    client.post("/me/join", json={"brand_id": "guardone"}, headers=ch)
    # 모집 종료 → 409, 마감일 경과 → 409
    assert client.post(f"/campaigns/{c_closed}/apply", json={"creator_id": "x"},
                       headers=ch).status_code == 409
    assert client.post(f"/campaigns/{c_late}/apply", json={"creator_id": "x"},
                       headers=ch).status_code == 409
    # 정상 지원 → applied, 재지원 → 멱등 + 실제 상태
    r1 = client.post(f"/campaigns/{c_open}/apply", json={"creator_id": "x"},
                     headers=ch).json()
    assert r1["myStatus"] == "applied" and not r1["alreadyApplied"]
    r2 = client.post(f"/campaigns/{c_open}/apply", json={"creator_id": "x"},
                     headers=ch).json()
    assert r2["alreadyApplied"] and r2["myStatus"] == "applied"
    # 선정 후 재지원 응답은 실제 상태(selected)를 반영
    apps = client.get(f"/brands/guardone/campaigns/{c_open}/applicants",
                      headers=_bearer(t)).json()
    client.post(f"/brands/guardone/campaigns/{c_open}/select", json={
        "creator_id": apps[0]["creatorId"], "commission_pct": 10},
        headers=_bearer(t))
    r3 = client.post(f"/campaigns/{c_open}/apply", json={"creator_id": "x"},
                     headers=ch).json()
    assert r3["alreadyApplied"] and r3["myStatus"] == "selected"


def test_select_capacity_and_status_policy(client, monkeypatch):
    """정원(capacity) 초과 선정 차단 + 취소 상태 캠페인 선정 차단."""
    t = _approved_brand(client, "capone", "캡원", "own@capone.kr")
    p = client.post("/brands/capone/products", json={
        "name": "캡 세럼"}, headers=_bearer(t)).json()
    cid = client.post(f"/brands/capone/products/{p['productId']}/campaigns",
                      json={"name": "정원1 모집", "capacity": 1},
                      headers=_bearer(t)).json()["campaignId"]
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    creators = []
    for i in (1, 2):
        ct = _creator_token(client, f"cap{i}@ex.com")
        client.post("/me/join", json={"brand_id": "capone"},
                    headers=_bearer(ct))
        r = client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"},
                        headers=_bearer(ct)).json()
        creators.append(r["creatorId"])
    ok = client.post(f"/brands/capone/campaigns/{cid}/select", json={
        "creator_id": creators[0], "commission_pct": 10}, headers=_bearer(t))
    assert ok.status_code == 200
    # 정원 1명 초과 → 409
    full = client.post(f"/brands/capone/campaigns/{cid}/select", json={
        "creator_id": creators[1], "commission_pct": 10}, headers=_bearer(t))
    assert full.status_code == 409 and "정원" in full.json()["detail"]
    # 모집 종료(closed) 후에도 선정은 가능 정책 — 취소 상태에선 불가
    _db_exec("UPDATE campaigns SET status='cancelled' WHERE campaign_id=%s",
             (cid,))
    bad = client.post(f"/brands/capone/campaigns/{cid}/select", json={
        "creator_id": creators[1], "commission_pct": 10}, headers=_bearer(t))
    assert bad.status_code == 409


def test_me_campaign_routes_require_creator_jwt(client, monkeypatch):
    """allowlist로 열린 /me/캠페인 경로도 무토큰·브랜드 토큰은 401."""
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    assert client.get("/me/campaigns").status_code == 401
    assert client.get("/me/campaign-offers").status_code == 401
    assert client.post("/me/campaign-offers/cmp-x/agree",
                       json={"accept": True,
                             "tiktok_handle": "@x"}).status_code == 401
    # 허용 목록 밖 레거시 /me 경로는 여전히 관리자 전용
    assert client.get("/me/c-anyone").status_code == 401
