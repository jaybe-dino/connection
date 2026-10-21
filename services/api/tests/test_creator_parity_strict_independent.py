"""운영 동일 AUTH_REQUIRED=1 에서 slack-v3 패리티 신규 경로 검증.

독립 검수 재현: legacy_access_boundary 의 self_checked 정확 경로 목록에
/me/notification-prefs(GET/PUT)·/me/campaign-offers/{id}/shipping(POST)이
빠져 정상 크리에이터 JWT가 '관리자 필요' 401로 차단되던 문제의 회귀 방지.
핸들러 자체의 본인 JWT 검사(_me_creator/_creator)는 그대로 유지된다
(넓은 /me/* 허용·AUTH_REQUIRED 해제 금지).
"""

from uuid import uuid4

import pytest

from api.db import connect
from api.routes_community import ensure_default_cell

from test_service_transition import _brand_user, _creator, _h, _onboard


def _go_strict(monkeypatch):
    """검증 구간만 운영과 동일한 AUTH_REQUIRED=1 로 전환.

    계정·캠페인 준비는 개발 모드(demoLink 매직)로 하고, 검증 대상 경로는
    strict 모드에서 호출한다 — 운영에서 메일 링크로 로그인한 크리에이터
    JWT와 동일한 조건이다(auth_required()는 요청마다 env를 읽는다)."""
    monkeypatch.setenv("AUTH_REQUIRED", "1")


@pytest.fixture
def box(client):
    sfx = uuid4().hex[:8]
    a = f"strict-{sfx}"
    with connect() as c:
        c.execute("INSERT INTO brands(brand_id,name) VALUES(%s,%s)",
                  (a, "Strict Brand"))
        ensure_default_cell(c, a, "Strict Brand")
    return {"a": a, "sfx": sfx}


def _member(client, box, tag):
    ch = _h(_creator(client, f"{tag}-{box['sfx']}@ex.com"))
    _onboard(client, ch)
    assert client.post("/me/join", json={"brand_id": box["a"]},
                       headers=ch).status_code == 200
    return ch


def _selected_offer(client, box, ch):
    bh = _h(_brand_user(client, f"sb-{uuid4().hex[:6]}@{box['a']}.ex",
                        box["a"]))
    camp = client.post(f"/brands/{box['a']}/campaigns", json={
        "name": "스트릭트 캠페인 " + box["sfx"], "reward_type": "affiliate",
        "affiliate_pct": 12, "countries": ["KR"]}, headers=bh).json()
    cid = camp["campaignId"]
    assert client.post(f"/brands/{box['a']}/campaigns/{cid}/publish",
                       headers=bh).status_code == 200
    me = client.post(f"/campaigns/{cid}/apply", json={"creator_id": "me"},
                     headers=ch).json()
    assert client.post(f"/brands/{box['a']}/campaigns/{cid}/select", json={
        "creator_id": me["creatorId"], "commission_pct": 12},
        headers=bh).status_code == 200
    return cid


def test_strict_notification_prefs_and_shipping_allowed(client, box, monkeypatch):
    """AUTH_REQUIRED=1: 정상 크리에이터 JWT로 알림 설정 GET/PUT·배송 정보
    POST가 성공해야 한다(경계 허용 + 핸들러 본인 검사)."""
    ch = _member(client, box, "ok")
    cid = _selected_offer(client, box, ch)
    _go_strict(monkeypatch)
    r = client.get("/me/notification-prefs", headers=ch)
    assert r.status_code == 200, r.text
    assert r.json()["prefs"]["campaign"] is True
    r = client.put("/me/notification-prefs", json={
        "dm": False, "campaign": True, "deadline": True, "email": False},
        headers=ch)
    assert r.status_code == 200, r.text
    assert client.get("/me/notification-prefs",
                      headers=ch).json()["prefs"]["dm"] is False

    r = client.post(f"/me/campaign-offers/{cid}/shipping", json={
        "recipient": "검수 수령인", "country": "kr",
        "address": "서울 어딘가 1-2", "phone": "010-1111-2222"}, headers=ch)
    assert r.status_code == 200, r.text
    assert r.json()["shipping"]["country"] == "KR"

    # 공백만 입력은 strip 후 거부(빈 값 저장 금지), 국가는 영문 2자리만
    assert client.post(f"/me/campaign-offers/{cid}/shipping", json={
        "recipient": "   ", "country": "KR", "address": "서울 어딘가 1-2",
        "phone": "010-1111-2222"}, headers=ch).status_code == 422
    assert client.post(f"/me/campaign-offers/{cid}/shipping", json={
        "recipient": "a", "country": "K1", "address": "서울 어딘가 1-2",
        "phone": "010-1111-2222"}, headers=ch).status_code == 422
    assert client.post(f"/me/campaign-offers/{cid}/shipping", json={
        "recipient": "a", "country": "KR", "address": "    주소   ",
        "phone": "010-1111-2222"}, headers=ch).status_code == 422


def test_strict_anonymous_and_cross_creator_blocked(client, box, monkeypatch):
    """AUTH_REQUIRED=1: 익명은 401, 타 크리에이터의 shipping은 404 —
    경계를 넓히지 않고 핸들러 본인 검사로 막는다."""
    ch = _member(client, box, "own")
    cid = _selected_offer(client, box, ch)
    other = _member(client, box, "oth")       # 같은 브랜드의 다른 크리에이터
    _go_strict(monkeypatch)
    assert client.get("/me/notification-prefs").status_code == 401
    assert client.put("/me/notification-prefs", json={
        "dm": True, "campaign": True, "deadline": True,
        "email": True}).status_code == 401
    assert client.post("/me/campaign-offers/any/shipping", json={
        "recipient": "x", "country": "KR", "address": "yyyy",
        "phone": "0000"}).status_code == 401

    r = client.post(f"/me/campaign-offers/{cid}/shipping", json={
        "recipient": "탈취 시도", "country": "KR", "address": "다른 주소 99",
        "phone": "010-9999-9999"}, headers=other)
    assert r.status_code == 404, r.text
    # 본인 저장은 그대로 성공·조회
    assert client.post(f"/me/campaign-offers/{cid}/shipping", json={
        "recipient": "본인", "country": "KR", "address": "본인 주소 11",
        "phone": "010-1234-0000"}, headers=ch).status_code == 200
    mine = next(o for o in client.get("/me/campaign-offers",
                                      headers=ch).json()
                if o["campaignId"] == cid)
    assert mine["shipping"]["recipient"] == "본인"


def test_strict_revision_note_strip_validation(client, box, monkeypatch):
    """RevisionIn note — 공백만 입력은 strip 후 422."""
    ch = _member(client, box, "rv")
    cid = _selected_offer(client, box, ch)
    bh = _h(_brand_user(client, f"rv2-{uuid4().hex[:6]}@{box['a']}.ex",
                        box["a"]))
    _go_strict(monkeypatch)
    assert client.post(f"/me/campaign-offers/{cid}/agree", json={
        "accept": True, "tiktok_handle": "@strict"},
        headers=ch).status_code == 200
    assert client.post(f"/me/campaign-offers/{cid}/content", json={
        "content_url": "https://example.com/v1"},
        headers=ch).status_code == 200
    with connect() as c:
        creator_id = c.execute(
            "SELECT creator_id FROM campaign_terms WHERE campaign_id=%s",
            (cid,)).fetchone()["creator_id"]
    assert client.post(
        f"/brands/{box['a']}/campaigns/{cid}/terms/{creator_id}"
        "/request-revision", json={"note": "     "},
        headers=bh).status_code == 422
    assert client.post(
        f"/brands/{box['a']}/campaigns/{cid}/terms/{creator_id}"
        "/request-revision", json={"note": "  제품명을 크게  "},
        headers=bh).json()["revisionNote"] == "제품명을 크게"


def test_strict_dm_pref_filters_unread_badge(client, box, monkeypatch):
    """'담당자 메시지' off → DM 미읽음 배지 제외(내부 기능 실반영),
    라운지 배지는 유지. 대화 열람 자체는 그대로 가능하다."""
    ch = _member(client, box, "dmp")
    bh = _h(_brand_user(client, f"dm-{uuid4().hex[:6]}@{box['a']}.ex",
                        box["a"]))
    _go_strict(monkeypatch)
    dm = client.post(f"/community/dm/{box['a']}", headers=ch).json()
    # 브랜드 담당자가 DM + 라운지에 각각 메시지
    assert client.post(f"/community/cells/{dm['cellId']}/messages", json={
        "text": "담당자 DM 안내"}, headers=bh).status_code == 200
    lounge = f"cell-{box['a']}-main"
    assert client.post(f"/community/cells/{lounge}/messages", json={
        "text": "라운지 소식"}, headers=bh).status_code == 200

    def unread_map():
        return {u["cellId"]: u["unread"]
                for u in client.get("/me/unread", headers=ch).json()}

    m = unread_map()
    assert m.get(dm["cellId"], 0) >= 1 and m.get(lounge, 0) >= 1
    client.put("/me/notification-prefs", json={
        "dm": False, "campaign": True, "deadline": True, "email": True},
        headers=ch)
    m = unread_map()
    assert dm["cellId"] not in m and m.get(lounge, 0) >= 1
    # 대화 자체는 열람 가능(배지만 끔)
    assert client.get(f"/community/cells/{dm['cellId']}/messages",
                      headers=ch).status_code == 200
    client.put("/me/notification-prefs", json={
        "dm": True, "campaign": True, "deadline": True, "email": True},
        headers=ch)
    assert unread_map().get(dm["cellId"], 0) >= 1
