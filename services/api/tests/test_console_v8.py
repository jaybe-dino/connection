"""v8.1 콘솔 이식에 필요한 추가 서버 경로 — 채널 관리, 제품 편집·추가 필드, 브랜드 학습 추가 키, 회신함 후속 처리."""
import json
from test_collab_api import _approved_brand, _bearer, _creator_token


def _cell(client, B, brand):
    return next(c["cellId"] for c in client.get("/community/my-cells", headers=B).json() if c["brandId"] == brand and c["kind"] == "lounge")


def test_channels_managed_by_brand_and_seen_by_creator(client, monkeypatch):
    t = _approved_brand(client, "chanbrand", "채널브랜드", "own@chanbrand.kr")
    B = _bearer(t)
    cid = client.post("/brands/chanbrand/campaigns", json={"name": "연결 캠페인"}, headers=B).json()["campaignId"]
    cell = _cell(client, B, "chanbrand")
    base = client.get(f"/community/cells/{cell}/channels", headers=B).json()
    assert [c["key"] for c in base] == ["notice", "chat", "products", "qna", "tips"] and base[0]["visibility"] == "readonly"
    add = client.post(f"/community/cells/{cell}/channels", json={"name": "촬영 팁방", "description": "촬영 질문", "visibility": "public", "campaign_id": cid}, headers=B)
    assert add.status_code == 200, add.text
    key = add.json()["key"]
    assert client.post(f"/community/cells/{cell}/channels", json={"name": "촬영 팁방"}, headers=B).status_code == 409
    assert client.patch(f"/community/cells/{cell}/channels/chat", json={"name": "수다방"}, headers=B).json()["name"] == "수다방"
    assert client.patch(f"/community/cells/{cell}/channels/chat", json={"archived": True}, headers=B).status_code == 409
    assert client.patch(f"/community/cells/{cell}/channels/notice", json={"visibility": "public"}, headers=B).status_code == 409
    # 다른 브랜드 캠페인 연결·다른 브랜드의 채널 관리 금지
    t2 = _approved_brand(client, "chanother", "다른채널", "own@chanother.kr")
    other = client.post("/brands/chanother/campaigns", json={"name": "남의 캠페인"}, headers=_bearer(t2)).json()["campaignId"]
    assert client.patch(f"/community/cells/{cell}/channels/{key}", json={"campaign_id": other}, headers=B).status_code == 404
    assert client.post(f"/community/cells/{cell}/channels", json={"name": "침입"}, headers=_bearer(t2)).status_code == 403

    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "chan.creator@ex.com"))
    client.post("/me/join", json={"brand_id": "chanbrand"}, headers=ch)
    seen = client.get(f"/community/cells/{cell}/channels", headers=ch).json()
    assert [c["name"] for c in seen if c["key"] in ("chat", key)] == ["수다방", "촬영 팁방"]
    assert next(c for c in seen if c["key"] == key)["campaignName"] == "연결 캠페인"
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "공지 쓰기 시도", "channel": "notice"}, headers=ch).status_code == 403
    # 읽기 전용으로 바꾸면 크리에이터는 쓸 수 없고, 보관하면 메뉴에서 사라지고 글도 못 쓴다
    client.patch(f"/community/cells/{cell}/channels/{key}", json={"visibility": "readonly"}, headers=B)
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "질문", "channel": key}, headers=ch).status_code == 403
    client.patch(f"/community/cells/{cell}/channels/{key}", json={"archived": True}, headers=B)
    assert key not in [c["key"] for c in client.get(f"/community/cells/{cell}/channels", headers=ch).json()]
    assert key in [c["key"] for c in client.get(f"/community/cells/{cell}/channels", headers=B).json()]   # 브랜드는 보관함까지 봄
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "보관 채널", "channel": key}, headers=B).status_code == 400
    assert client.patch(f"/community/cells/{cell}/channels/{key}", json={"archived": False}, headers=B).json()["archived"] is False


def test_product_edit_and_v8_fields(client):
    t = _approved_brand(client, "prodedit", "제품편집", "own@prodedit.kr")
    B = _bearer(t)
    p = client.post("/brands/prodedit/products", json={"name": "앰플"}, headers=B).json()["productId"]
    r = client.patch(f"/brands/prodedit/products/{p}", json={"name": "한방 앰플", "tiktok_product_ref": "1729-shop"}, headers=B)
    assert r.status_code == 200 and r.json()["name"] == "한방 앰플" and r.json()["tiktokProductRef"] == "1729-shop"
    ok = client.post(f"/brands/prodedit/products/{p}/profile", json={"answers": {
        "category": "스킨케어", "usp": "진정\n보습\n저자극", "description": "피부 진정 앰플", "howto": "세안 후 2방울",
        "link": "https://shop.example/amp", "price": "29.90", "currency": "USD", "ship": "US,KR", "image_url": "https://cdn.example/a.png"}}, headers=B)
    assert ok.status_code == 200, ok.text
    got = next(x for x in client.get("/brands/prodedit/products", headers=B).json() if x["productId"] == p)
    assert got["fields"]["ship"]["value"] == "US,KR" and got["fields"]["usp"]["value"] == "진정\n보습\n저자극"
    assert got["publicSummary"] == "" and got["publicImageUrl"] is None and "대표 이미지" in got["publicMissing"]
    for bad in ({"link": "http://x"}, {"category": "가전"}, {"ship": "US,ZZ"}, {"price": "싸요"}, {"image_url": "javascript:1"}):
        assert client.post(f"/brands/prodedit/products/{p}/profile", json={"answers": bad}, headers=B).status_code == 400, bad


def test_brand_learning_v8_keys(client):
    t = _approved_brand(client, "learnv8", "학습브랜드", "own@learnv8.kr")
    B = _bearer(t)
    faq = json.dumps([{"q": "배송은?", "a": "3일"}, {"q": "샘플?", "a": "1개"}], ensure_ascii=False)
    r = client.post("/brands/learnv8/profile/learned", json={"answers": {"brand_one_liner": "한방 원료로 만든 진정 스킨케어 브랜드예요", "homepage": "https://brand.example", "countries": "US,KR", "usp": "한방 진정", "banned_words": "치료, 완치", "faq": faq}}, headers=B)
    assert r.status_code == 200, r.text
    f = client.get("/brands/learnv8/profile/learned", headers=B).json()["fields"]
    assert f["homepage"]["value"] == "https://brand.example" and json.loads(f["faq"]["value"])[1]["q"] == "샘플?"
    assert client.post("/brands/learnv8/profile/learned", json={"answers": {"homepage": "brand.example"}}, headers=B).status_code == 400
    assert client.post("/brands/learnv8/profile/learned", json={"answers": {"faq": "[1,2"}}, headers=B).status_code == 400


def test_brand_reply_task_optimistic_and_optout(client, monkeypatch):
    monkeypatch.setenv("INBOUND_REPLY_KEY", "test-inbound-secret")
    t = _approved_brand(client, "replyv8", "회신브랜드", "own@replyv8.kr")
    B = _bearer(t)
    client.post("/inbound/reply", headers={"X-Inbound-Key": "test-inbound-secret"}, json={"brand_id": "replyv8", "from_email": "kai@creator.example", "text": "Interested! what is the fee?"})
    th = client.get("/brands/replyv8/inbox", headers=B).json()[0]
    assert th["task"] == {"label": "unreviewed", "owner": "", "nextAction": "", "dueAt": None, "revision": 0}
    url = f"/brands/replyv8/inbox/threads/{th['threadId']}/task"
    r = client.put(url, json={"label": "question", "owner": "하린", "next_action": "단가 안내", "revision": 0}, headers=B)
    assert r.status_code == 200 and r.json()["task"]["revision"] == 1
    assert client.put(url, json={"label": "interested", "revision": 0}, headers=B).status_code == 409   # 오래된 revision
    assert client.put(url, json={"label": "optout", "revision": 1}, headers=B).status_code == 200
    assert client.get("/brands/replyv8/inbox", headers=B).json()[0]["task"]["label"] == "optout"
    t2 = _approved_brand(client, "replyother", "다른회신", "own@replyother.kr")
    assert client.put(url.replace("replyv8", "replyother"), json={"label": "question", "revision": 2}, headers=_bearer(t2)).status_code == 404


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _up(client, B, brand, pid, data, ct="image/png", slot="main"):
    return client.post(f"/brands/{brand}/products/{pid}/images?slot={slot}", content=data, headers={**B, "Content-Type": ct})


def test_product_images_upload_validate_replace_scope(client, monkeypatch):
    t = _approved_brand(client, "imgbrand", "이미지브랜드", "own@imgbrand.kr")
    B = _bearer(t)
    pid = client.post("/brands/imgbrand/products", json={"name": "앰플"}, headers=B).json()["productId"]
    r = _up(client, B, "imgbrand", pid, PNG)
    assert r.status_code == 200, r.text
    first = r.json()["imageId"]
    url = r.json()["images"][0]["url"]
    got = client.get(url)
    assert got.status_code == 200 and got.content == PNG and got.headers["content-type"] == "image/png" and got.headers["x-content-type-options"] == "nosniff"
    # 형식·크기 오류는 거부되고 기존 대표는 그대로
    assert _up(client, B, "imgbrand", pid, b"GIF89a....", "image/gif").status_code == 415
    assert _up(client, B, "imgbrand", pid, b"<svg onload=alert(1)>", "image/png").status_code == 415   # 내용-형식 불일치
    assert _up(client, B, "imgbrand", pid, b"\x89PNG\r\n\x1a\n" + b"0" * 2_000_001).status_code == 413
    assert _up(client, B, "imgbrand", pid, b"").status_code == 400
    imgs = client.get("/brands/imgbrand/products", headers=B).json()[0]["images"]
    assert [i["imageId"] for i in imgs] == [first]
    # 교체: 새 대표 1장만 남고 이전 대표 주소는 404
    second = _up(client, B, "imgbrand", pid, JPG, "image/jpeg").json()["imageId"]
    imgs = client.get("/brands/imgbrand/products", headers=B).json()[0]["images"]
    assert [i["imageId"] for i in imgs if i["slot"] == "main"] == [second]
    assert client.get(url).status_code == 404
    # 추가 이미지 4장 한도
    for _ in range(4):
        assert _up(client, B, "imgbrand", pid, PNG, slot="extra").status_code == 200
    assert _up(client, B, "imgbrand", pid, PNG, slot="extra").status_code == 409
    extra = next(i for i in client.get("/brands/imgbrand/products", headers=B).json()[0]["images"] if i["slot"] == "extra")
    assert client.delete(f"/brands/imgbrand/products/{pid}/images/{extra['imageId']}", headers=B).json()["ok"]
    # 서명 위·변조·만료
    sig_url = client.get("/brands/imgbrand/products", headers=B).json()[0]["images"][0]["url"]
    assert client.get(sig_url[:-4] + "0000").status_code == 403
    assert client.get(sig_url.split("?")[0] + "?e=1&s=" + sig_url.split("s=")[1]).status_code == 403
    # 다른 브랜드는 올리거나 지울 수 없다
    t2 = _approved_brand(client, "imgother", "다른이미지", "own@imgother.kr")
    B2 = _bearer(t2)
    assert _up(client, B2, "imgbrand", pid, PNG).status_code == 403
    assert _up(client, B2, "imgother", pid, PNG).status_code == 404
    assert client.delete(f"/brands/imgother/products/{pid}/images/{second}", headers=B2).status_code == 404
    # 공개 범위: 멤버 크리에이터의 캠페인 응답엔 서명 URL, 공개 제품 목록엔 브랜드 업로드 이미지 없음
    cid = client.post("/brands/imgbrand/campaigns", json={"name": "이미지 캠페인", "product": "앰플", "product_id": pid}, headers=B).json()["campaignId"]
    client.post(f"/brands/imgbrand/campaigns/{cid}/publish", headers=B)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "img.creator@ex.com"))
    client.post("/me/join", json={"brand_id": "imgbrand"}, headers=ch)
    camp = next(c for c in client.get("/me/campaigns", headers=ch).json() if c["campaignId"] == cid)
    assert camp["imageUrl"].startswith(f"/public/product-images/{second}?") and client.get(camp["imageUrl"]).content == JPG
    pub = client.get("/public/products?limit=100").json()["items"]
    assert all("product-images" not in str(x.get("imageUrl") or "") for x in pub)


def test_reselect_rejected_needs_reconsider_and_shipping_needs_address(client, monkeypatch):
    t = _approved_brand(client, "reselect", "재선정", "own@reselect.kr")
    B = _bearer(t)
    cid = client.post("/brands/reselect/campaigns", json={"name": "재선정 캠페인", "reward_type": "gifted"}, headers=B).json()["campaignId"]
    client.post(f"/brands/reselect/campaigns/{cid}/publish", headers=B)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "reselect.creator@ex.com"))
    client.post("/me/join", json={"brand_id": "reselect"}, headers=ch)
    client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"}, headers=ch)
    creator_id = client.get(f"/brands/reselect/campaigns/{cid}/applicants", headers=B).json()[0]["creatorId"]
    client.post(f"/brands/reselect/campaigns/{cid}/applicants/{creator_id}/reject", json={"reason": "국가"}, headers=B)
    assert client.post(f"/brands/reselect/campaigns/{cid}/select", json={"creator_id": creator_id}, headers=B).status_code == 409
    assert client.post(f"/brands/reselect/campaigns/{cid}/select", json={"creator_id": creator_id, "reconsider": True}, headers=B).status_code == 200
    client.post(f"/me/campaign-offers/{cid}/agree", json={"accept": True, "handle": "@r"}, headers=ch)
    assert client.post(f"/brands/reselect/campaigns/{cid}/terms/{creator_id}/sample-shipped", json={"tracking": "T1"}, headers=B).status_code == 409


def test_uploaded_images_reach_public_catalog_only_while_listed(client):
    t = _approved_brand(client, "pubimg", "공개이미지", "own@pubimg.kr")
    B = _bearer(t)
    pid = client.post("/brands/pubimg/products", json={"name": "새 앰플"}, headers=B).json()["productId"]
    # 운영 소개 없이도: 상세 설명 + 대표 이미지 업로드로 공개 가능
    assert client.post(f"/brands/pubimg/products/{pid}/public", json={"listed": True}, headers=B).status_code == 409
    client.post(f"/brands/pubimg/products/{pid}/profile", json={"answers": {"description": "피부 진정에 쓰는 한방 앰플이에요"}}, headers=B)
    from conftest import listing_ready
    listing_ready(client, "pubimg", pid, B)
    main = _up(client, B, "pubimg", pid, PNG).json()["imageId"]
    extra = _up(client, B, "pubimg", pid, JPG, "image/jpeg", "extra").json()["imageId"]
    unsigned = f"/public/product-images/{main}"
    assert client.get(unsigned).status_code == 403                     # 공개 전: 익명 불가
    assert client.post(f"/brands/pubimg/products/{pid}/public", json={"listed": True}, headers=B).status_code == 200
    item = next(x for x in client.get("/public/products?limit=100").json()["items"] if x["productId"] == pid)
    assert item["imageUrl"] == unsigned and item["images"] == [f"/public/product-images/{extra}"]
    assert item["summary"] == "피부 진정에 쓰는 한방 앰플이에요"
    r = client.get(unsigned)
    assert r.status_code == 200 and r.content == PNG and r.headers["cache-control"].startswith("public")
    assert client.get(item["images"][0]).content == JPG
    # 만료된 서명 주소도 공개 중이면 열림(재조회 없이 깨지지 않음)
    assert client.get(unsigned + "?e=1&s=" + "0" * 32).status_code == 200
    # 운영 검수 이미지가 있으면 그것이 우선
    with __import__("api.db", fromlist=["connect"]).connect() as c:
        c.execute("INSERT INTO product_invitation_profiles(product_id,summary,image_url) VALUES(%s,%s,%s)",
                  (pid, "운영팀이 검수한 공개 소개 문장입니다", "https://cdn.example.com/ops.png"))
    item = next(x for x in client.get("/public/products?limit=100").json()["items"] if x["productId"] == pid)
    assert item["imageUrl"] == "https://cdn.example.com/ops.png" and item["summary"] == "운영팀이 검수한 공개 소개 문장입니다"
    # 공개를 내리면 익명 접근은 다시 막히고, 소유 브랜드의 서명 주소는 열린다
    client.post(f"/brands/pubimg/products/{pid}/public", json={"listed": False}, headers=B)
    assert client.get(unsigned).status_code == 403
    signed = client.get("/brands/pubimg/products", headers=B).json()[0]["images"][0]["url"]
    assert client.get(signed).status_code == 200


def test_brand_members_scoped(client, monkeypatch):
    t = _approved_brand(client, "membrand", "멤버브랜드", "own@membrand.kr")
    t2 = _approved_brand(client, "memother", "멤버다른", "own@memother.kr")
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "mem.creator@ex.com"))
    client.post("/me/join", json={"brand_id": "membrand"}, headers=ch)
    m = client.get("/brands/membrand/members", headers=_bearer(t)).json()
    assert len(m) == 1 and m[0]["dmCellId"].startswith("dm-membrand--") and "email" not in m[0]
    assert client.get("/brands/memother/members", headers=_bearer(t2)).json() == []
    assert client.get("/brands/membrand/members", headers=_bearer(t2)).status_code == 403


def test_review_fixes_stream_limit_thread_channel_blank_names(client, monkeypatch):
    t = _approved_brand(client, "fixbrand", "수정브랜드", "own@fixbrand.kr")
    B = _bearer(t)
    # 공백 이름 거부(제품·채널, 생성·수정)
    assert client.post("/brands/fixbrand/products", json={"name": "   "}, headers=B).status_code == 400
    pid = client.post("/brands/fixbrand/products", json={"name": "  앰플  "}, headers=B).json()
    assert pid["name"] == "앰플"
    assert client.patch(f"/brands/fixbrand/products/{pid['productId']}", json={"name": " "}, headers=B).status_code == 400
    cell = _cell(client, B, "fixbrand")
    assert client.post(f"/community/cells/{cell}/channels", json={"name": "  "}, headers=B).status_code == 400
    assert client.patch(f"/community/cells/{cell}/channels/chat", json={"name": " "}, headers=B).status_code == 400
    # Content-Length 없는 chunked 업로드도 누적 2MB 초과 시 413
    def chunks():
        yield b"\x89PNG\r\n\x1a\n"
        for _ in range(40):
            yield b"0" * 65536
    r = client.post(f"/brands/fixbrand/products/{pid['productId']}/images?slot=main", content=chunks(), headers={**B, "Content-Type": "image/png"})
    assert r.status_code == 413
    # 답글은 원문과 같은 채널만(공지 답글은 기존 'chat' 전송도 공지로 유지)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    tip = client.post(f"/community/cells/{cell}/messages", json={"text": "팁 원문", "channel": "tips"}, headers=B).json()["msgId"]
    note = client.post(f"/community/cells/{cell}/messages", json={"text": "공지 원문", "channel": "notice"}, headers=B).json()["msgId"]
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "다른 채널 답글", "channel": "chat", "thread_parent": tip}, headers=B).status_code == 400
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "같은 채널 답글", "channel": "tips", "thread_parent": tip}, headers=B).status_code == 200
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "공지 답글(구 클라이언트)", "channel": "chat", "thread_parent": note}, headers=B).status_code == 200
