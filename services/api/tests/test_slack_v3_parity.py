"""slack-v3 원본 요소 실동작 패리티 — 리액션·메시지 이미지·제품이야기 채널·
주간 랭킹·알림 설정(실반영/저장)·협업 배송 정보(당사자 격리)·수정 요청."""

from uuid import uuid4

import pytest

from api.db import connect
from api.routes_community import ensure_default_cell

from test_service_transition import _brand_user, _creator, _h, _onboard


@pytest.fixture
def box(client):
    sfx = uuid4().hex[:8]
    a, b = f"par-a-{sfx}", f"par-b-{sfx}"
    with connect() as c:
        for bid, name in [(a, "Parity A"), (b, "Parity B")]:
            c.execute("INSERT INTO brands(brand_id,name) VALUES(%s,%s)",
                      (bid, name))
            ensure_default_cell(c, bid, name)
    return {"a": a, "b": b, "cell_a": f"cell-{a}-main",
            "cell_b": f"cell-{b}-main", "sfx": sfx}


def _member(client, box, tag):
    ch = _h(_creator(client, f"{tag}-{box['sfx']}@ex.com"))
    _onboard(client, ch)
    assert client.post("/me/join", json={"brand_id": box["a"]},
                       headers=ch).status_code == 200
    return ch


def _campaign_to_state(client, box, ch, state="content_submitted"):
    """브랜드 캠페인 생성→발행→지원→선정→합의→(발송→제출) 단계 진행."""
    bh = _h(_brand_user(client, f"bu-{uuid4().hex[:6]}@{box['a']}.ex",
                        box["a"]))
    camp = client.post(f"/brands/{box['a']}/campaigns", json={
        "name": "패리티 캠페인 " + box["sfx"], "product": "세럼",
        "reward_type": "affiliate", "affiliate_pct": 15,
        "countries": ["KR"]}, headers=bh).json()
    cid = camp["campaignId"]
    assert client.post(f"/brands/{box['a']}/campaigns/{cid}/publish",
                       headers=bh).status_code == 200
    me = client.post(f"/campaigns/{cid}/apply", json={"creator_id": "me"},
                     headers=ch).json()
    creator_id = me["creatorId"]
    if state == "applied":
        return cid, creator_id, bh
    assert client.post(f"/brands/{box['a']}/campaigns/{cid}/select", json={
        "creator_id": creator_id, "commission_pct": 15},
        headers=bh).status_code == 200
    if state == "selected":
        return cid, creator_id, bh
    assert client.post(f"/me/campaign-offers/{cid}/agree", json={
        "accept": True, "tiktok_handle": "@parity"},
        headers=ch).status_code == 200
    if state == "terms_agreed":
        return cid, creator_id, bh
    assert client.post(
        f"/brands/{box['a']}/campaigns/{cid}/terms/{creator_id}"
        "/sample-shipped", json={"tracking": "CJ-1"},
        headers=bh).status_code == 200
    if state == "sample_shipped":
        return cid, creator_id, bh
    assert client.post(f"/me/campaign-offers/{cid}/content", json={
        "content_url": "https://example.com/v1"},
        headers=ch).status_code == 200
    return cid, creator_id, bh


# ── 제품이야기 채널 + 메시지 이미지 + 리액션 ─────────────────────

def test_products_channel_image_and_reactions(client, box):
    ch = _member(client, box, "msg")
    other = _h(_creator(client, f"out-{box['sfx']}@ex.com"))
    _onboard(client, other)                      # 미가입(멤버십 없음)

    # products 채널 게시 + 공개 https 이미지 첨부
    r = client.post(f"/community/cells/{box['cell_a']}/messages", json={
        "text": "신제품 어때요?", "channel": "products", "locale": "ko",
        "image_url": "https://cdn.example.com/p.jpg"}, headers=ch)
    assert r.status_code == 200, r.text
    mid = r.json()["msgId"]
    # http / 비정상 이미지 주소 거절
    assert client.post(f"/community/cells/{box['cell_a']}/messages", json={
        "text": "x", "channel": "products",
        "image_url": "http://x.com/p.jpg"}, headers=ch).status_code == 400
    rows = client.get(f"/community/cells/{box['cell_a']}/messages"
                      "?channel=products", headers=ch).json()
    msg = next(m for m in rows if m["msgId"] == mid)
    assert msg["imageUrl"] == "https://cdn.example.com/p.jpg"
    assert msg["reactionCount"] == 0 and msg["myReaction"] is False

    # 리액션: 사람당 1개 토글(중복 켜도 1), 끄면 0
    for _ in range(2):
        rr = client.post(
            f"/community/cells/{box['cell_a']}/messages/{mid}/reaction",
            json={"on": True}, headers=ch).json()
        assert rr["count"] == 1 and rr["mine"] is True
    ch2 = _member(client, box, "msg2")
    assert client.post(
        f"/community/cells/{box['cell_a']}/messages/{mid}/reaction",
        json={"on": True}, headers=ch2).json()["count"] == 2
    mine = next(m for m in client.get(
        f"/community/cells/{box['cell_a']}/messages?channel=products",
        headers=ch2).json() if m["msgId"] == mid)
    assert mine["reactionCount"] == 2 and mine["myReaction"] is True
    assert client.post(
        f"/community/cells/{box['cell_a']}/messages/{mid}/reaction",
        json={"on": False}, headers=ch).json()["count"] == 1
    # 미가입 크리에이터는 리액션 불가(멤버십 가드)
    assert client.post(
        f"/community/cells/{box['cell_a']}/messages/{mid}/reaction",
        json={"on": True}, headers=other).status_code == 403


# ── 알림 설정: campaign 실반영 + 저장(pending 항목은 정직 표기) ──

def test_notification_prefs_filter_campaign_notify(client, box):
    on = _member(client, box, "non")
    off = _member(client, box, "noff")
    got = client.get("/me/notification-prefs", headers=off).json()
    assert got["prefs"] == {"dm": True, "campaign": True,
                            "deadline": True, "email": True}
    assert got["applied"]["campaign"] == "active"
    assert got["applied"]["email"] == "pending"
    r = client.put("/me/notification-prefs", json={
        "dm": True, "campaign": False, "deadline": False, "email": False},
        headers=off)
    assert r.status_code == 200, r.text
    assert client.get("/me/notification-prefs",
                      headers=off).json()["prefs"]["campaign"] is False

    # 캠페인 발행 알림: 끈 멤버는 받지 않고, 켠 멤버는 받는다
    bh = _h(_brand_user(client, f"nb-{box['sfx']}@{box['a']}.ex", box["a"]))
    camp = client.post(f"/brands/{box['a']}/campaigns", json={
        "name": "알림 캠페인 " + box["sfx"], "reward_type": "affiliate"},
        headers=bh).json()
    client.post(f"/brands/{box['a']}/campaigns/{camp['campaignId']}/publish",
                headers=bh)
    def titles(h):
        return [i["title"] for i in client.get(
            "/me/notifications?limit=30", headers=h).json()["items"]]
    assert any("알림 캠페인" in t for t in titles(on))
    assert not any("알림 캠페인" in t for t in titles(off))
    # 공지(notice)는 토글 대상이 아니므로 그대로 수신
    client.post(f"/community/cells/{box['cell_a']}/messages", json={
        "text": "공지 확인", "channel": "notice"}, headers=bh)
    assert any("새 공지" in t for t in titles(off))


# ── 주간/전체 랭킹 ───────────────────────────────────────────────

def test_ranking_week_vs_all(client, box):
    ch = _member(client, box, "rank")          # join XP 50
    with connect() as c:
        cid = c.execute(
            "SELECT creator_id FROM xp_events WHERE brand_id=%s LIMIT 1",
            (box["a"],)).fetchone()["creator_id"]
        c.execute(
            "INSERT INTO xp_events (creator_id, brand_id, kind, subject,"
            " points, created_at)"
            " VALUES (%s,%s,'completed','old-camp',120,"
            " now() - interval '30 days')", (cid, box["a"]))
    all_rows = client.get(f"/brands/{box['a']}/ranking?period=all",
                          headers=ch).json()
    week_rows = client.get(f"/brands/{box['a']}/ranking?period=week",
                           headers=ch).json()
    me_all = next(r for r in all_rows if r["me"])
    me_week = next(r for r in week_rows if r["me"])
    assert me_all["total"] == me_week["total"] + 120


# ── 협업 배송 정보: 당사자 저장·조회 + 원장 무PII + 시점 제한 ────

def test_shipping_info_parties_only(client, box):
    ch = _member(client, box, "ship")
    cid, creator_id, bh = _campaign_to_state(client, box, ch, "terms_agreed")
    r = client.post(f"/me/campaign-offers/{cid}/shipping", json={
        "recipient": "민지", "country": "kr",
        "address": "서울시 어딘가 12-3", "phone": "010-1234-5678"},
        headers=ch)
    assert r.status_code == 200, r.text
    assert r.json()["shipping"]["country"] == "KR"
    # 크리에이터 본인·해당 브랜드 콘솔 양쪽에서 조회
    mine = next(o for o in client.get("/me/campaign-offers",
                                      headers=ch).json()
                if o["campaignId"] == cid)
    assert mine["shipping"]["address"] == "서울시 어딘가 12-3"
    apps = client.get(f"/brands/{box['a']}/campaigns/{cid}/applicants",
                      headers=bh).json()
    assert apps[0]["shipping"]["recipient"] == "민지"
    # 감사 원장에 주소·연락처를 남기지 않는다
    with connect() as c:
        rows = c.execute(
            "SELECT payload::text t FROM ledger WHERE"
            " event_type='SHIPPING_INFO_SUBMITTED' AND subject=%s",
            (cid,)).fetchall()
        assert rows and all("어딘가" not in x["t"] and "1234" not in x["t"]
                            for x in rows)
    # 발송 후에는 수정 불가
    client.post(f"/brands/{box['a']}/campaigns/{cid}/terms/{creator_id}"
                "/sample-shipped", json={"tracking": "CJ-2"}, headers=bh)
    assert client.post(f"/me/campaign-offers/{cid}/shipping", json={
        "recipient": "민지", "country": "KR", "address": "변경 주소 44",
        "phone": "010-0000-0000"}, headers=ch).status_code == 409
    # 타 크리에이터는 이 협업의 배송 정보에 접근할 경로가 없다(404)
    ch2 = _member(client, box, "ship2")
    assert client.post(f"/me/campaign-offers/{cid}/shipping", json={
        "recipient": "x", "country": "KR", "address": "yyyy",
        "phone": "0000"}, headers=ch2).status_code == 404


# ── 수정 요청: 제출→요청→재제출→완료 ────────────────────────────

def test_revision_request_roundtrip(client, box):
    ch = _member(client, box, "rev")
    cid, creator_id, bh = _campaign_to_state(client, box, ch)
    # 제출 전 요청 불가 검사는 위 헬퍼가 보장(content_submitted 도달)
    r = client.post(f"/brands/{box['a']}/campaigns/{cid}/terms/{creator_id}"
                    "/request-revision", json={"note": "첫 장면에 제품명을 보여주세요"},
                    headers=bh)
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "revision_requested"
    mine = next(o for o in client.get("/me/campaign-offers",
                                      headers=ch).json()
                if o["campaignId"] == cid)
    assert mine["revisionNote"] == "첫 장면에 제품명을 보여주세요"
    assert mine["revisionRequestedAt"]
    # 크리에이터에게 알림 전달
    titles = [i["title"] for i in client.get("/me/notifications?limit=30",
                                             headers=ch).json()["items"]]
    assert any(t.startswith("수정 요청") for t in titles)
    # 수정 요청 상태에서 완료 처리 불가, Spark 코드는 수정 가능
    assert client.post(f"/brands/{box['a']}/campaigns/{cid}/terms/"
                       f"{creator_id}/complete",
                       headers=bh).status_code == 409
    assert client.post(f"/me/campaign-offers/{cid}/spark-code", json={
        "spark_code": "SPARK-REV"}, headers=ch).status_code == 200
    # 수정본 재제출 → 요청 해소 + content_submitted 복귀
    r = client.post(f"/me/campaign-offers/{cid}/content", json={
        "content_url": "https://example.com/v2"}, headers=ch)
    assert r.status_code == 200 and r.json()["state"] == "content_submitted"
    assert r.json()["revisionNote"] == "" and r.json()["contentUrl"].endswith("/v2")
    assert client.post(f"/brands/{box['a']}/campaigns/{cid}/terms/"
                       f"{creator_id}/complete",
                       headers=bh).status_code == 200


# ── 검토 중 제출 링크 수정(본인만·완료 후 금지·XP 중복 없음) ─────

def test_content_edit_while_in_review(client, box):
    ch = _member(client, box, "edit")
    cid, creator_id, bh = _campaign_to_state(client, box, ch)
    # 검토 중(content_submitted) 수정 — UI '제출 링크 수정' 버튼의 실제 경로
    r = client.post(f"/me/campaign-offers/{cid}/content", json={
        "content_url": "https://example.com/v1-edited"}, headers=ch)
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "content_submitted"
    assert r.json()["contentUrl"].endswith("v1-edited")
    # 본인 terms 만 — 같은 브랜드 다른 크리에이터는 404
    other = _member(client, box, "edit2")
    assert client.post(f"/me/campaign-offers/{cid}/content", json={
        "content_url": "https://example.com/steal"},
        headers=other).status_code == 404
    # XP는 (creator,brand,kind,subject) 1회 — 수정으로 중복 지급 없음
    with connect() as c:
        n = c.execute(
            "SELECT count(*) c FROM xp_events WHERE creator_id=%s AND"
            " kind='content_submitted' AND subject=%s",
            (creator_id, cid)).fetchone()["c"]
    assert n == 1
    # 완료 후 변경 금지(기록 보존)
    assert client.post(f"/brands/{box['a']}/campaigns/{cid}/terms/"
                       f"{creator_id}/complete", headers=bh).status_code == 200
    assert client.post(f"/me/campaign-offers/{cid}/content", json={
        "content_url": "https://example.com/late"},
        headers=ch).status_code == 409


# ── 캠페인 카드 실제품 이미지(같은 브랜드만·https만) ─────────────

def test_campaign_product_image_join(client, box):
    ch = _member(client, box, "img")
    bh = _h(_brand_user(client, f"im-{box['sfx']}@{box['a']}.ex", box["a"]))
    prod = client.post(f"/brands/{box['a']}/products", json={
        "name": "이미지 세럼 " + box["sfx"], "commission_pct": 10},
        headers=bh).json()
    camp = client.post(f"/brands/{box['a']}/campaigns", json={
        "name": "이미지 캠페인 " + box["sfx"], "reward_type": "affiliate",
        "countries": ["KR"]}, headers=bh).json()
    cid = camp["campaignId"]
    client.post(f"/brands/{box['a']}/campaigns/{cid}/publish", headers=bh)
    with connect() as c:
        c.execute("INSERT INTO product_invitation_profiles"
                  " (product_id, image_url) VALUES (%s,%s)",
                  (prod["productId"], "https://cdn.example.com/serum.jpg"))
        c.execute("UPDATE campaigns SET product_id=%s WHERE campaign_id=%s",
                  (prod["productId"], cid))
    def my(cid_):
        return next(x for x in client.get("/me/campaigns", headers=ch).json()
                    if x["campaignId"] == cid_)
    assert my(cid)["imageUrl"] == "https://cdn.example.com/serum.jpg"
    # 협업 카드(offers)에도 동반
    client.post(f"/campaigns/{cid}/apply", json={"creator_id": "me"},
                headers=ch)
    me = client.get("/me/campaigns", headers=ch).json()
    creator_id = client.post(f"/campaigns/{cid}/apply",
                             json={"creator_id": "me"},
                             headers=ch).json()["creatorId"]
    client.post(f"/brands/{box['a']}/campaigns/{cid}/select", json={
        "creator_id": creator_id, "commission_pct": 10}, headers=bh)
    off = next(o for o in client.get("/me/campaign-offers",
                                     headers=ch).json()
               if o["campaignId"] == cid)
    assert off["imageUrl"] == "https://cdn.example.com/serum.jpg"
    # 타 브랜드 제품이 잘못 연결돼도 이미지가 노출되지 않는다(브랜드 가드)
    bh_b = _h(_brand_user(client, f"im2-{box['sfx']}@{box['b']}.ex",
                          box["b"]))
    prod_b = client.post(f"/brands/{box['b']}/products", json={
        "name": "타브랜드 제품 " + box["sfx"], "commission_pct": 10},
        headers=bh_b).json()
    with connect() as c:
        c.execute("INSERT INTO product_invitation_profiles"
                  " (product_id, image_url) VALUES (%s,%s)",
                  (prod_b["productId"], "https://cdn.example.com/other.jpg"))
        c.execute("UPDATE campaigns SET product_id=%s WHERE campaign_id=%s",
                  (prod_b["productId"], cid))
    assert my(cid)["imageUrl"] is None
    # https 가 아닌 이미지 값은 무시(중립 fallback)
    with connect() as c:
        c.execute("UPDATE campaigns SET product_id=%s WHERE campaign_id=%s",
                  (prod["productId"], cid))
        c.execute("UPDATE product_invitation_profiles SET image_url="
                  "'http://insecure/img.jpg' WHERE product_id=%s",
                  (prod["productId"],))
    assert my(cid)["imageUrl"] is None
