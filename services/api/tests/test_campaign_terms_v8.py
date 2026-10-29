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
