"""v8.1 조건 합의 — 보상 방식·통화·플랫폼별로 같은 조건 데이터로 합의하고 스냅샷을 남긴다."""
from test_collab_api import _approved_brand, _bearer, _creator_token


def test_paid_instagram_and_krw_default(client, monkeypatch):
    t = _approved_brand(client, "termsone", "텀스원", "own@termsone.kr")
    B = _bearer(t)
    # 고정비(USD)·Instagram 캠페인 — 판매 수수료 없이 선정/합의
    c = client.post("/brands/termsone/campaigns", json={
        "name": "인스타 리뷰 영상", "reward_type": "paid", "reward_amount": 100,
        "reward_currency": "USD", "platform": "instagram",
        "conditions": ["Instagram 릴스 1개 · 15~30초"]}, headers=B).json()
    cid = c["campaignId"]
    assert client.post(f"/brands/termsone/campaigns/{cid}/publish", headers=B).status_code == 200
    # 기존 방식(통화 미지정) 캠페인은 KRW 로 저장된다
    c3 = client.post("/brands/termsone/campaigns", json={"name": "기존 고정비", "reward_type": "paid", "reward_amount": 50000}, headers=B).json()
    lst = {x["campaignId"]: x for x in client.get("/brands/termsone/campaigns", headers=B).json()}
    assert lst[c3["campaignId"]]["rewardCurrency"] == "KRW" and lst[cid]["rewardCurrency"] == "USD"
    assert lst[cid]["platform"] == "instagram" and lst[cid]["conditions"] == ["Instagram 릴스 1개 · 15~30초"]

    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "terms.creator@ex.com"))
    assert client.post("/me/join", json={"brand_id": "termsone"}, headers=ch).status_code == 200
    assert client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"}, headers=ch).status_code == 200
    creator_id = client.get(f"/brands/termsone/campaigns/{cid}/applicants", headers=B).json()[0]["creatorId"]
    # 판매 수수료가 아닌 캠페인은 수수료 없이 선정
    sel = client.post(f"/brands/termsone/campaigns/{cid}/select", json={"creator_id": creator_id}, headers=B)
    assert sel.status_code == 200, sel.text
    off = next(o for o in client.get("/me/campaign-offers", headers=ch).json() if o["campaignId"] == cid)
    assert off["rewardType"] == "paid" and off["rewardAmount"] == 100 and off["rewardCurrency"] == "USD" and off["platform"] == "instagram"
    # 계정 없이 합의 불가 → Instagram 계정으로 합의 → 스냅샷
    assert client.post(f"/me/campaign-offers/{cid}/agree", json={"accept": True}, headers=ch).status_code == 400
    r = client.post(f"/me/campaign-offers/{cid}/agree", json={"accept": True, "handle": "@insta.creator"}, headers=ch)
    assert r.status_code == 200, r.text
    snap = r.json()["agreedTerms"]
    assert snap["rewardType"] == "paid" and snap["rewardAmount"] == 100 and snap["rewardCurrency"] == "USD"
    assert snap["platform"] == "instagram" and snap["handle"] == "@insta.creator"
    assert r.json()["platformHandle"] == "@insta.creator"
    # Spark 코드는 TikTok 캠페인에만
    assert client.post(f"/me/campaign-offers/{cid}/spark-code", json={"spark_code": "SPARK1234"}, headers=ch).status_code == 409
    # 판매 수수료 캠페인은 여전히 수수료가 있어야 선정
    a = client.post("/brands/termsone/campaigns", json={"name": "판매 영상", "reward_type": "affiliate", "affiliate_pct": 12}, headers=B).json()
    client.post(f"/brands/termsone/campaigns/{a['campaignId']}/publish", headers=B)
    client.post(f"/campaigns/{a['campaignId']}/apply", json={"creator_id": "x"}, headers=ch)
    assert client.post(f"/brands/termsone/campaigns/{a['campaignId']}/select", json={"creator_id": creator_id}, headers=B).status_code == 400


def test_campaign_product_must_belong_to_brand(client):
    t1 = _approved_brand(client, "prodbrand1", "제품원", "own@prodbrand1.kr")
    t2 = _approved_brand(client, "prodbrand2", "제품투", "own@prodbrand2.kr")
    p2 = client.post("/brands/prodbrand2/products", json={"name": "다른 브랜드 제품"}, headers=_bearer(t2)).json()
    r = client.post("/brands/prodbrand1/campaigns", json={"name": "교차 제품 연결", "product_id": p2["productId"]}, headers=_bearer(t1))
    assert r.status_code == 404


def test_agree_requires_seen_terms_fingerprint_and_keeps_snapshot(client, monkeypatch):
    """GET 한 100 USD 조건 → 브랜드가 200 KRW 로 변경 → 옛 확인값 합의 409 → 최신 조건 재확인 합의
    → 합의 후 캠페인 재수정 → 양쪽(크리에이터 offers·브랜드 applicants) 모두 확정 스냅샷 유지."""
    t = _approved_brand(client, "termsfp", "텀스에프피", "own@termsfp.kr")
    B = _bearer(t)
    cid = client.post("/brands/termsfp/campaigns", json={
        "name": "고정비 리뷰", "reward_type": "paid", "reward_amount": 100, "reward_currency": "USD",
        "platform": "instagram", "conditions": ["릴스 1개"]}, headers=B).json()["campaignId"]
    client.post(f"/brands/termsfp/campaigns/{cid}/publish", headers=B)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "fp.creator@ex.com"))
    client.post("/me/join", json={"brand_id": "termsfp"}, headers=ch)
    client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"}, headers=ch)
    creator_id = client.get(f"/brands/termsfp/campaigns/{cid}/applicants", headers=B).json()[0]["creatorId"]
    assert client.post(f"/brands/termsfp/campaigns/{cid}/select", json={"creator_id": creator_id}, headers=B).status_code == 200
    offer = lambda: next(o for o in client.get("/me/campaign-offers", headers=ch).json() if o["campaignId"] == cid)
    seen = offer()
    assert seen["offerTerms"]["rewardAmount"] == 100 and seen["offerTerms"]["rewardCurrency"] == "USD"
    old_fp = seen["termsFingerprint"]

    # 크리에이터가 본 뒤 브랜드가 금액·통화·조건을 바꾼다
    r = client.patch(f"/brands/termsfp/campaigns/{cid}", json={"reward_amount": 200, "reward_currency": "KRW", "conditions": ["릴스 2개"]}, headers=B)
    assert r.status_code == 200, r.text
    stale = client.post(f"/me/campaign-offers/{cid}/agree", json={"accept": True, "handle": "@fp", "terms_fingerprint": old_fp}, headers=ch)
    assert stale.status_code == 409, stale.text
    d = stale.json()["detail"]
    assert d["code"] == "terms_changed" and d["offerTerms"]["rewardAmount"] == 200 and d["offerTerms"]["rewardCurrency"] == "KRW"
    assert offer()["state"] == "selected" and offer()["agreedTerms"] is None   # 옛 조건으로 합의되지 않음

    # 최신 조건 재확인 후 합의
    fresh = offer()
    assert fresh["termsFingerprint"] != old_fp and fresh["termsFingerprint"] == d["termsFingerprint"]
    ok = client.post(f"/me/campaign-offers/{cid}/agree", json={"accept": True, "handle": "@fp", "terms_fingerprint": fresh["termsFingerprint"]}, headers=ch)
    assert ok.status_code == 200, ok.text
    snap = ok.json()["agreedTerms"]
    assert snap["rewardAmount"] == 200 and snap["rewardCurrency"] == "KRW" and snap["conditions"] == ["릴스 2개"]
    assert snap["termsFingerprint"] == fresh["termsFingerprint"] and snap["confirmedByCreator"] is True

    # 합의 후 브랜드가 다시 수정해도 양쪽 스냅샷은 그대로
    client.patch(f"/brands/termsfp/campaigns/{cid}", json={"reward_amount": 999, "reward_currency": "USD", "platform": "tiktok", "conditions": ["바뀐 조건"]}, headers=B)
    mine = offer()["agreedTerms"]
    brand_side = next(a for a in client.get(f"/brands/termsfp/campaigns/{cid}/applicants", headers=B).json() if a["creatorId"] == creator_id)["agreedTerms"]
    for s in (mine, brand_side):
        assert s["rewardAmount"] == 200 and s["rewardCurrency"] == "KRW" and s["platform"] == "instagram" and s["conditions"] == ["릴스 2개"]
    assert mine == brand_side

    # 기존 API 호환: 확인값 없이도 합의 가능(구 클라이언트)
    cid2 = client.post("/brands/termsfp/campaigns", json={"name": "구 클라이언트", "reward_type": "gifted"}, headers=B).json()["campaignId"]
    client.post(f"/brands/termsfp/campaigns/{cid2}/publish", headers=B)
    client.post(f"/campaigns/{cid2}/apply", json={"creator_id": "x"}, headers=ch)
    client.post(f"/brands/termsfp/campaigns/{cid2}/select", json={"creator_id": creator_id}, headers=B)
    legacy = client.post(f"/me/campaign-offers/{cid2}/agree", json={"accept": True, "tiktok_handle": "@fp"}, headers=ch)
    assert legacy.status_code == 200 and legacy.json()["agreedTerms"]["confirmedByCreator"] is False


def test_product_is_part_of_agreed_terms(client, monkeypatch):
    """제품도 합의 대상: 본 뒤 제품이 바뀌면 409, 합의 후 제품이 바뀌어도 스냅샷은 합의한 제품."""
    t = _approved_brand(client, "termsprod", "텀스프로드", "own@termsprod.kr")
    B = _bearer(t)
    p1 = client.post("/brands/termsprod/products", json={"name": "앰플 A"}, headers=B).json()["productId"]
    p2 = client.post("/brands/termsprod/products", json={"name": "크림 B"}, headers=B).json()["productId"]
    cid = client.post("/brands/termsprod/campaigns", json={"name": "제품 합의", "reward_type": "gifted", "product": "앰플 A", "product_id": p1}, headers=B).json()["campaignId"]
    client.post(f"/brands/termsprod/campaigns/{cid}/publish", headers=B)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "prod.creator@ex.com"))
    client.post("/me/join", json={"brand_id": "termsprod"}, headers=ch)
    client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"}, headers=ch)
    creator_id = client.get(f"/brands/termsprod/campaigns/{cid}/applicants", headers=B).json()[0]["creatorId"]
    client.post(f"/brands/termsprod/campaigns/{cid}/select", json={"creator_id": creator_id}, headers=B)
    offer = lambda: next(o for o in client.get("/me/campaign-offers", headers=ch).json() if o["campaignId"] == cid)
    seen = offer()
    assert seen["offerTerms"]["product"] == "앰플 A" and seen["offerTerms"]["productId"] == p1
    client.patch(f"/brands/termsprod/campaigns/{cid}", json={"product": "크림 B", "product_id": p2}, headers=B)
    r = client.post(f"/me/campaign-offers/{cid}/agree", json={"accept": True, "handle": "@p", "terms_fingerprint": seen["termsFingerprint"]}, headers=ch)
    assert r.status_code == 409 and r.json()["detail"]["offerTerms"]["product"] == "크림 B"
    fp = offer()["termsFingerprint"]
    snap = client.post(f"/me/campaign-offers/{cid}/agree", json={"accept": True, "handle": "@p", "terms_fingerprint": fp}, headers=ch).json()["agreedTerms"]
    assert snap["product"] == "크림 B" and snap["productId"] == p2
    client.patch(f"/brands/termsprod/campaigns/{cid}", json={"product": "앰플 A", "product_id": p1}, headers=B)
    assert offer()["agreedTerms"]["product"] == "크림 B"
    brand_side = client.get(f"/brands/termsprod/campaigns/{cid}/applicants", headers=B).json()[0]["agreedTerms"]
    assert brand_side["product"] == "크림 B" and brand_side == offer()["agreedTerms"]


def test_campaign_card_post_is_real_message_with_campaign_id(client, monkeypatch):
    t = _approved_brand(client, "postbrand", "포스트브랜드", "own@postbrand.kr")
    B = _bearer(t)
    draft = client.post("/brands/postbrand/campaigns", json={"name": "초안 캠페인"}, headers=B).json()["campaignId"]
    assert client.post(f"/brands/postbrand/campaigns/{draft}/post", json={"channel": "notice"}, headers=B).status_code == 409
    cid = client.post("/brands/postbrand/campaigns", json={"name": "게시할 캠페인", "reward_type": "paid", "reward_amount": 30, "reward_currency": "USD", "conditions": ["릴스 1개"]}, headers=B).json()["campaignId"]
    client.post(f"/brands/postbrand/campaigns/{cid}/publish", headers=B)
    r = client.post(f"/brands/postbrand/campaigns/{cid}/post", json={"channel": "notice"}, headers=B)
    assert r.status_code == 200, r.text
    cell = r.json()["cellId"]
    assert client.post(f"/brands/postbrand/campaigns/{cid}/post", json={"channel": "notice"}, headers=B).status_code == 409   # 중복 게시 방지
    # 다른 브랜드는 이 브랜드 캠페인을 게시할 수 없다
    t2 = _approved_brand(client, "postother", "다른브랜드", "own@postother.kr")
    assert client.post(f"/brands/postother/campaigns/{cid}/post", json={"channel": "notice"}, headers=_bearer(t2)).status_code == 404
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "post.creator@ex.com"))
    client.post("/me/join", json={"brand_id": "postbrand"}, headers=ch)
    client.post(f"/community/cells/{cell}/messages", json={"text": "일반 대화"}, headers=ch)
    posts = client.get(f"/community/cells/{cell}/messages?campaign_posts=true", headers=ch).json()
    assert [m["campaignId"] for m in posts] == [cid] and "30 USD" in posts[0]["original"] and posts[0]["channel"] == "notice"
