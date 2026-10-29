"""콘솔 검수 반영 — 샘플 없는 캠페인, 합의 플랫폼 기준 Spark, owner 팀 초대, 추가 채널 캠페인 게시,
DM·회신 AI 초안(초안만), 본인 연결 메일함 테스트 발송."""
import json
from types import SimpleNamespace
from uuid import uuid4

from api import ai
from api import routes_gmail
from api.db import connect
from api.routes_collab import _terms_fingerprint
from test_collab_api import _approved_brand, _bearer, _creator_token
from test_console_v8 import _cell


def _agreed(client, B, ch, brand, cid, handle="@nosample"):
    client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"}, headers=ch)
    creator = next(x for x in client.get(f"/brands/{brand}/campaigns/{cid}/applicants", headers=B).json())["creatorId"]
    assert client.post(f"/brands/{brand}/campaigns/{cid}/select", json={"creator_id": creator}, headers=B).status_code == 200
    off = next(o for o in client.get("/me/campaign-offers", headers=ch).json() if o["campaignId"] == cid)
    r = client.post(f"/me/campaign-offers/{cid}/agree", json={"accept": True, "handle": handle, "terms_fingerprint": off["termsFingerprint"]}, headers=ch)
    assert r.status_code == 200, r.text
    return creator, off, r.json()


def test_sample_free_campaign_skips_address_and_shipping(client, monkeypatch):
    t = _approved_brand(client, "nosample", "노샘플", "own@nosample.kr")
    B = _bearer(t)
    cid = client.post("/brands/nosample/campaigns", json={"name": "보유 제품 UGC", "reward_type": "paid", "reward_amount": 50,
                                                         "reward_currency": "USD", "sample_required": False,
                                                         "conditions": ["TikTok 영상 1개 · 30초", "샘플 없음 · 보유 제품으로 촬영"]}, headers=B).json()["campaignId"]
    legacy = client.post("/brands/nosample/campaigns", json={"name": "기존 샘플 캠페인", "reward_type": "gifted"}, headers=B).json()["campaignId"]
    lst = {x["campaignId"]: x for x in client.get("/brands/nosample/campaigns", headers=B).json()}
    assert lst[cid]["sampleRequired"] is False and lst[legacy]["sampleRequired"] is True     # 기본값은 기존과 같은 true
    client.post(f"/brands/nosample/campaigns/{cid}/publish", headers=B)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "nosample.creator@ex.com"))
    client.post("/me/join", json={"brand_id": "nosample"}, headers=ch)
    assert next(c for c in client.get("/me/campaigns", headers=ch).json() if c["campaignId"] == cid)["sampleRequired"] is False
    creator, off, agreed = _agreed(client, B, ch, "nosample", cid)
    assert off["offerTerms"]["sampleRequired"] is False and agreed["agreedTerms"]["sampleRequired"] is False
    # 주소 수집·발송 처리 없음
    ship = client.post(f"/me/campaign-offers/{cid}/shipping", json={"recipient": "홍길동", "country": "KR", "address": "서울시 어딘가 1", "phone": "010-0000-0000"}, headers=ch)
    assert ship.status_code == 409, ship.text
    assert client.post(f"/brands/nosample/campaigns/{cid}/terms/{creator}/sample-shipped", json={"tracking": "X1"}, headers=B).status_code == 409
    # 합의 후 캠페인을 샘플 필요로 바꿔도 이 합의는 샘플 없음 그대로
    assert client.patch(f"/brands/nosample/campaigns/{cid}", json={"sample_required": True}, headers=B).status_code == 200
    row = client.get(f"/brands/nosample/campaigns/{cid}/applicants", headers=B).json()[0]
    assert row["sampleRequired"] is False
    assert client.post(f"/brands/nosample/campaigns/{cid}/terms/{creator}/sample-shipped", json={"tracking": "X1"}, headers=B).status_code == 409
    # 합의 상태에서 바로 영상 제출
    r = client.post(f"/me/campaign-offers/{cid}/content", json={"content_url": "https://www.tiktok.com/@nosample/video/1"}, headers=ch)
    assert r.status_code == 200 and r.json()["state"] == "content_submitted", r.text


def test_sample_flag_fingerprint_keeps_legacy_offers():
    base = {"product": "p", "productId": None, "rewardType": "gifted", "commissionPct": None, "rewardAmount": None,
            "rewardCurrency": "KRW", "platform": "tiktok", "conditions": []}
    assert _terms_fingerprint({**base, "sampleRequired": True}) == _terms_fingerprint(base)
    assert _terms_fingerprint({**base, "sampleRequired": False}) != _terms_fingerprint(base)


def test_spark_follows_agreed_platform_both_directions(client, monkeypatch):
    t = _approved_brand(client, "sparkplat", "스파크플랫", "own@sparkplat.kr")
    B = _bearer(t)
    tk = client.post("/brands/sparkplat/campaigns", json={"name": "틱톡 합의", "reward_type": "gifted", "platform": "tiktok"}, headers=B).json()["campaignId"]
    ig = client.post("/brands/sparkplat/campaigns", json={"name": "인스타 합의", "reward_type": "gifted", "platform": "instagram"}, headers=B).json()["campaignId"]
    for c in (tk, ig):
        client.post(f"/brands/sparkplat/campaigns/{c}/publish", headers=B)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "spark.plat@ex.com"))
    client.post("/me/join", json={"brand_id": "sparkplat"}, headers=ch)
    _agreed(client, B, ch, "sparkplat", tk)
    _agreed(client, B, ch, "sparkplat", ig)
    # 합의 후 플랫폼을 서로 바꾼다 — Spark 는 합의한 플랫폼 기준
    client.patch(f"/brands/sparkplat/campaigns/{tk}", json={"platform": "instagram"}, headers=B)
    client.patch(f"/brands/sparkplat/campaigns/{ig}", json={"platform": "tiktok"}, headers=B)
    r = client.post(f"/me/campaign-offers/{tk}/spark-code", json={"spark_code": "SPARK-TK-1"}, headers=ch)
    assert r.status_code == 200 and r.json()["sparkCode"] == "SPARK-TK-1", r.text
    assert client.post(f"/me/campaign-offers/{ig}/spark-code", json={"spark_code": "SPARK-IG-1"}, headers=ch).status_code == 409


def test_owner_registers_team_member_with_invite_link(client, monkeypatch):
    owner = _bearer(_approved_brand(client, "teaminv", "팀초대", "own@teaminv.kr"))
    other = _bearer(_approved_brand(client, "teaminv2", "팀초대투", "own@teaminv2.kr"))
    r = client.post("/brands/teaminv/team/members", json={"email": "Ops@TeamInv.kr", "role": "manager"}, headers=owner)
    assert r.status_code == 200, r.text
    inv = r.json()
    assert inv["role"] == "manager" and inv["email"] == "ops@teaminv.kr" and "/?invite=" in inv["invite"]["link"]
    team = {m["email"]: m for m in client.get("/brands/teaminv/team", headers=owner).json()}
    assert team["ops@teaminv.kr"]["passwordSet"] is False and team["own@teaminv.kr"]["passwordSet"] is True
    # 중복·타 브랜드·크리에이터 이메일, 소유자 역할 직접 생성 차단
    assert client.post("/brands/teaminv/team/members", json={"email": "ops@teaminv.kr", "role": "viewer"}, headers=owner).status_code == 409
    assert client.post("/brands/teaminv/team/members", json={"email": "own@teaminv2.kr", "role": "viewer"}, headers=owner).status_code == 409
    _creator_token(client, "creator.teaminv@ex.com")
    assert client.post("/brands/teaminv/team/members", json={"email": "creator.teaminv@ex.com"}, headers=owner).status_code == 409
    assert client.post("/brands/teaminv/team/members", json={"email": "x@teaminv.kr", "role": "owner"}, headers=owner).status_code == 422
    assert client.post("/brands/teaminv/team/members", json={"email": "not-an-email"}, headers=owner).status_code == 400
    # 다른 브랜드 토큰으로 이 브랜드 팀 등록 불가
    assert client.post("/brands/teaminv/team/members", json={"email": "y@teaminv.kr"}, headers=other).status_code in (401, 403)
    # 재발급하면 이전 링크 폐기, 새 링크로 본인이 비밀번호 설정 → 운영자로 로그인
    old = inv["invite"]["link"].split("invite=")[1]
    re_ = client.post(f"/brands/teaminv/team/{inv['userId']}/invite-link", headers=owner)
    assert re_.status_code == 200, re_.text
    assert client.post("/auth/accept", json={"token": old, "password": "team-invite-pw-1"}).status_code in (400, 401, 404, 410)
    acc = client.post("/auth/accept", json={"token": re_.json()["link"].split("invite=")[1], "password": "team-invite-pw-1"})
    assert acc.status_code == 200, acc.text
    manager = _bearer(acc.json()["token"])
    # 운영자는 팀원 등록·링크 발급 불가, 이미 비밀번호 설정한 계정엔 링크 재발급 불가
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    assert client.post("/brands/teaminv/team/members", json={"email": "z@teaminv.kr"}, headers=manager).status_code == 403
    assert client.post(f"/brands/teaminv/team/{inv['userId']}/invite-link", headers=owner).status_code == 409
    v = client.post("/brands/teaminv/team/members", json={"email": "viewer@teaminv.kr", "role": "viewer"}, headers=owner)
    assert v.status_code == 200 and v.json()["role"] == "viewer"


def test_campaign_post_to_added_channel(client):
    B = _bearer(_approved_brand(client, "postchan", "포스트채널", "own@postchan.kr"))
    cid = client.post("/brands/postchan/campaigns", json={"name": "채널 게시", "reward_type": "gifted"}, headers=B).json()["campaignId"]
    client.post(f"/brands/postchan/campaigns/{cid}/publish", headers=B)
    cell = _cell(client, B, "postchan")
    key = client.post(f"/community/cells/{cell}/channels", json={"name": "신제품 체험방"}, headers=B).json()["key"]
    r = client.post(f"/brands/postchan/campaigns/{cid}/post", json={"channel": key}, headers=B)
    assert r.status_code == 200, r.text
    assert client.post(f"/brands/postchan/campaigns/{cid}/post", json={"channel": "no-such-channel"}, headers=B).status_code == 400
    client.patch(f"/community/cells/{cell}/channels/{key}", json={"archived": True}, headers=B)
    assert client.post(f"/brands/postchan/campaigns/{cid}/post", json={"channel": key}, headers=B).status_code == 400


class _FakeAI:
    def __init__(self):
        self.calls = []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.calls.append(json.loads(kw["messages"][0]["content"]))
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps({"text": "안녕하세요! 확인해서 알려드릴게요."}))], stop_reason="end_turn")


def test_dm_and_reply_ai_drafts_are_drafts_only(client, monkeypatch):
    B = _bearer(_approved_brand(client, "aidraft", "에이아이", "own@aidraft.kr"))
    other = _bearer(_approved_brand(client, "aidraft2", "에이아이투", "own@aidraft2.kr"))
    cid = client.post("/brands/aidraft/campaigns", json={"name": "선택 캠페인", "reward_type": "paid", "reward_amount": 70, "reward_currency": "USD"}, headers=B).json()["campaignId"]
    unrelated = client.post("/brands/aidraft/campaigns", json={"name": "무관 캠페인", "reward_type": "gifted"}, headers=B).json()["campaignId"]
    client.post(f"/brands/aidraft/campaigns/{cid}/publish", headers=B)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, "ai.creator@ex.com"))
    client.post("/me/join", json={"brand_id": "aidraft"}, headers=ch)
    client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"}, headers=ch)
    creator = client.get(f"/brands/aidraft/campaigns/{cid}/applicants", headers=B).json()[0]["creatorId"]
    cell = client.post("/community/dm/aidraft", headers=ch).json().get("cellId") or f"dm-aidraft--{creator}"
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "배송은 언제쯤 되나요?", "channel": "chat"}, headers=ch).status_code == 200
    # 브랜드 DM 답장의 관련 캠페인 태그 — 이 크리에이터 캠페인만, 크리에이터·라운지에선 불가
    tagged = client.post(f"/community/cells/{cell}/messages", json={"text": "선택 캠페인 답장", "channel": "chat", "campaign_id": cid}, headers=B)
    assert tagged.status_code == 200, tagged.text
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "무관", "channel": "chat", "campaign_id": unrelated}, headers=B).status_code == 409
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "크리에이터", "channel": "chat", "campaign_id": cid}, headers=ch).status_code == 400
    msgs = client.get(f"/community/cells/{cell}/messages", headers=B).json()
    assert next(m for m in msgs if m["original"] == "선택 캠페인 답장")["campaignId"] == cid
    with connect() as c:
        before = c.execute("SELECT count(*) n FROM cell_messages WHERE cell_id=%s", (cell,)).fetchone()["n"]
    # AI 미연결 → 실제 오류(가짜 초안 없음)
    monkeypatch.setattr(ai, "_client", lambda: None)
    r = client.post("/brands/aidraft/assist/dm-draft", json={"cell_id": cell, "campaign_id": cid}, headers=B)
    assert r.status_code == 503, r.text
    # 다른 브랜드 대화·무관한 캠페인 거부
    assert client.post("/brands/aidraft2/assist/dm-draft", json={"cell_id": cell}, headers=other).status_code == 404
    assert client.post("/brands/aidraft/assist/dm-draft", json={"cell_id": cell, "campaign_id": unrelated}, headers=B).status_code == 409
    fake = _FakeAI()
    monkeypatch.setattr(ai, "_client", lambda: fake)
    r = client.post("/brands/aidraft/assist/dm-draft", json={"cell_id": cell, "campaign_id": cid}, headers=B)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent"] is False and body["campaignId"] == cid and body["text"]
    assert any("배송은 언제쯤" in e for e in body["evidence"])
    assert fake.calls[-1]["campaign"]["terms"]["rewardAmount"] == 70 and fake.calls[-1]["campaign"]["termsBasis"] == "campaign"
    # 캠페인 미선택 = 일반 문의(조건 미전달)
    g = client.post("/brands/aidraft/assist/dm-draft", json={"cell_id": cell}, headers=B).json()
    assert g["campaignId"] is None and fake.calls[-1]["campaign"] is None and any("일반 문의" in e for e in g["evidence"])
    with connect() as c:
        assert c.execute("SELECT count(*) n FROM cell_messages WHERE cell_id=%s", (cell,)).fetchone()["n"] == before   # 자동 발송 없음
        tid = c.execute("INSERT INTO mail_threads(brand_id,creator_email,subject,last_direction) VALUES('aidraft','r@ex.com','제안','in') RETURNING thread_id").fetchone()["thread_id"]
        c.execute("INSERT INTO mail_messages(thread_id,direction,body,state) VALUES(%s,'in','샘플 받을 수 있나요?','sent')", (tid,))
    rr = client.post("/brands/aidraft/assist/reply-draft", json={"thread_id": str(tid), "campaign_id": cid}, headers=B)
    assert rr.status_code == 200 and rr.json()["sent"] is False, rr.text
    assert client.post("/brands/aidraft2/assist/reply-draft", json={"thread_id": str(tid)}, headers=other).status_code == 404
    with connect() as c:
        assert c.execute("SELECT count(*) n FROM mail_messages WHERE thread_id=%s AND direction='out'", (tid,)).fetchone()["n"] == 0


def test_test_send_only_to_own_connected_mailbox(client, monkeypatch):
    B = _bearer(_approved_brand(client, "testsend", "테스트발송", "own@testsend.kr"))
    other = _bearer(_approved_brand(client, "testsend2", "테스트발송투", "own@testsend2.kr"))
    with connect() as c:
        aid = str(c.execute("INSERT INTO gmail_accounts(brand_id,email) VALUES('testsend','Sender@TestSend.kr') RETURNING account_id").fetchone()["account_id"])
    body = lambda rid, **kw: {"request_id": rid, "subject": "제안 메일", "body": "안녕하세요", "confirmed": True, **kw}
    assert client.post(f"/brands/testsend/gmail/accounts/{aid}/test-send", json=body(str(uuid4()), confirmed=False), headers=B).status_code == 400
    assert client.post(f"/brands/testsend2/gmail/accounts/{aid}/test-send", json=body(str(uuid4())), headers=other).status_code == 404
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    demo = client.post(f"/brands/testsend/gmail/accounts/{aid}/test-send", json=body(str(uuid4())), headers=B)
    assert demo.status_code == 503, demo.text   # 데모 모드에선 보낸 척하지 않는다
    sent = []
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "local-test")
    monkeypatch.setattr(routes_gmail, "send_via_brand_gmail", lambda conn, brand, to, subject, text, **kw: sent.append((brand, to, subject, kw)) or {"messageId": "m-1"})
    rid = str(uuid4())
    r = client.post(f"/brands/testsend/gmail/accounts/{aid}/test-send", json=body(rid), headers=B)
    assert r.status_code == 200 and r.json() == {"state": "sent", "to": "sender@testsend.kr"}, r.text
    assert sent == [("testsend", "sender@testsend.kr", "[TEST] 제안 메일", {"account_id": __import__("uuid").UUID(aid)})]
    # 같은 요청 재시도는 재발송 없이 기록 반환, 내용이 다르면 거부
    assert client.post(f"/brands/testsend/gmail/accounts/{aid}/test-send", json=body(rid), headers=B).json()["replayed"] is True
    assert client.post(f"/brands/testsend/gmail/accounts/{aid}/test-send", json=body(rid, body="다른 본문"), headers=B).status_code == 409
    assert len(sent) == 1
    # 한도·중지로 안전장치가 막으면 보내지 않았다고 알린다
    monkeypatch.setattr(routes_gmail, "send_via_brand_gmail", lambda *a, **kw: None)
    assert client.post(f"/brands/testsend/gmail/accounts/{aid}/test-send", json=body(str(uuid4())), headers=B).json()["state"] == "blocked"
