"""관리자 이식 — D03 협업 제출이 전사 검수 대기열과 같은 기록, D05 신고 조치의 실제 효과·복구, 브랜드 대리운영 1회용 전환."""
from uuid import uuid4

import pytest

from api import auth
from api.db import connect
from test_collab_api import _approved_brand, _bearer, _creator_token


@pytest.fixture
def A():
    """관리자 계정(JWT) — 끝나면 지운다(남으면 /auth/bootstrap 테스트가 409 로 오염)."""
    with connect() as c:
        aid = str(c.execute("INSERT INTO users(kind,email) VALUES('admin',%s) RETURNING user_id",
                            (f"effects-{uuid4().hex[:8]}@example.invalid",)).fetchone()["user_id"])
    yield _bearer(auth.issue_jwt({"kind": "admin", "sub": aid}))
    with connect() as c:
        c.execute("DELETE FROM auth_tokens WHERE user_id=%s::uuid", (aid,))
        c.execute("DELETE FROM users WHERE user_id=%s::uuid", (aid,))


def _collab(client, monkeypatch, slug, email):
    B = _bearer(_approved_brand(client, slug, slug, f"own@{slug}.kr"))
    cid = client.post(f"/brands/{slug}/campaigns", json={"name": "검수 연결", "reward_type": "gifted", "sample_required": False}, headers=B).json()["campaignId"]
    client.post(f"/brands/{slug}/campaigns/{cid}/publish", headers=B)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(_creator_token(client, email))
    client.post("/me/join", json={"brand_id": slug}, headers=ch)
    client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"}, headers=ch)
    creator = client.get(f"/brands/{slug}/campaigns/{cid}/applicants", headers=B).json()[0]["creatorId"]
    client.post(f"/brands/{slug}/campaigns/{cid}/select", json={"creator_id": creator}, headers=B)
    off = next(o for o in client.get("/me/campaign-offers", headers=ch).json() if o["campaignId"] == cid)
    assert client.post(f"/me/campaign-offers/{cid}/agree", json={"accept": True, "handle": "@d03", "terms_fingerprint": off["termsFingerprint"]}, headers=ch).status_code == 200
    return B, ch, cid, creator


def test_collab_submission_is_same_record_in_admin_review(client, monkeypatch, A):
    B, ch, cid, creator = _collab(client, monkeypatch, "d03brand", "d03.creator@ex.com")
    assert client.post(f"/me/campaign-offers/{cid}/content", json={"content_url": "https://www.tiktok.com/@d03/video/1"}, headers=ch).status_code == 200
    rows = [r for r in client.get("/submissions?status=in_review", headers=A).json() if r["campaignId"] == cid]
    assert len(rows) == 1 and rows[0]["source"] == "collab" and rows[0]["version"] == 1 and rows[0]["termsState"] == "content_submitted"
    # 브랜드 수정 요청 → 같은 행이 보완 요청, 재제출 → 새 버전(이전 기록 보존)
    client.post(f"/brands/d03brand/campaigns/{cid}/terms/{creator}/request-revision", json={"note": "제품명을 말해 주세요"}, headers=B)
    allrows = [r for r in client.get("/submissions", headers=A).json() if r["campaignId"] == cid]
    assert [r["status"] for r in allrows] == ["needs_fix"] and allrows[0]["reviewedBy"] == "brand:d03brand"
    assert any(c.get("fix") == "제품명을 말해 주세요" for c in allrows[0]["autoChecks"])
    client.post(f"/me/campaign-offers/{cid}/content", json={"content_url": "https://www.tiktok.com/@d03/video/2"}, headers=ch)
    v2 = [r for r in client.get("/submissions", headers=A).json() if r["campaignId"] == cid]
    assert sorted((r["version"], r["status"], r["url"][-1]) for r in v2) == [(1, "needs_fix", "1"), (2, "in_review", "2")]
    # 관리자 검수는 기록만 — 브랜드 확인 상태(content_submitted)·지급을 바꾸지 않는다
    sid = next(r["submissionId"] for r in v2 if r["version"] == 2)
    assert client.post(f"/submissions/{sid}/review", json={"result": "passed", "reviewer": "ops"}, headers=A).status_code == 200
    off = next(o for o in client.get("/me/campaign-offers", headers=ch).json() if o["campaignId"] == cid)
    assert off["state"] == "content_submitted"


def test_report_actions_have_real_effects_and_restore(client, monkeypatch, A):
    B, ch, cid, creator = _collab(client, monkeypatch, "d05brand", "d05.creator@ex.com")
    cell = next(c["cellId"] for c in client.get("/community/my-cells", headers=B).json() if c.get("brandId") == "d05brand" and c.get("kind") != "dm")
    m = client.post(f"/community/cells/{cell}/messages", json={"text": "스팸 링크 도배", "channel": "chat"}, headers=ch).json()
    with connect() as c:
        assert c.execute("SELECT author_id FROM cell_messages WHERE msg_id=%s", (m["msgId"],)).fetchone()["author_id"] == creator
    rep = client.post("/reports", json={"cell_id": cell, "msg_id": str(m["msgId"]), "reporter": "u1", "reason": "spam"}, headers=A).json()
    r = client.post(f"/admin/reports/{rep['reportId']}/action", json={"action": "suspend_7d"}, headers=A)
    assert r.status_code == 200, r.text
    eff = r.json()["effect"]
    assert eff["hiddenMsgId"] == m["msgId"] and eff["creatorId"] == creator and eff["until"]
    # 실제 효과: 멤버 화면에서 숨김, 작성자 쓰기 제한(7일), 운영은 숨김 표시와 함께 본다
    assert all(x["msgId"] != m["msgId"] for x in client.get(f"/community/cells/{cell}/messages", headers=B).json())
    blocked = client.post(f"/community/cells/{cell}/messages", json={"text": "다시 씀", "channel": "chat"}, headers=ch)
    assert blocked.status_code == 403 and "제한" in blocked.json()["detail"]
    assert any(x["msgId"] == m["msgId"] and x["hidden"] for x in client.get(f"/community/cells/{cell}/messages", headers=A).json())
    h = next(x for x in client.get("/admin/reports/handled", headers=A).json() if x["reportId"] == rep["reportId"])
    assert h["hidden"] and h["until"] and not h["lifted"]
    # 기간 만료 → 자동 해제
    with connect() as c:
        c.execute("UPDATE creator_sanctions SET until=now() - interval '1 minute' WHERE sanction_id=%s", (eff["sanctionId"],))
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "만료 후 글", "channel": "chat"}, headers=ch).status_code == 200
    # 복구: 숨김 해제·제한 해제, 두 번 복구 불가
    assert client.post(f"/admin/reports/{rep['reportId']}/restore", headers=A).status_code == 200
    assert any(x["msgId"] == m["msgId"] for x in client.get(f"/community/cells/{cell}/messages", headers=B).json())
    assert client.post(f"/admin/reports/{rep['reportId']}/restore", headers=A).status_code == 409
    # 무기한 제한 + 대상 없는 조치는 기록만 남기지 않고 거부
    m2 = client.post(f"/community/cells/{cell}/messages", json={"text": "또 스팸", "channel": "chat"}, headers=ch).json()
    rep2 = client.post("/reports", json={"cell_id": cell, "msg_id": str(m2["msgId"]), "reporter": "u1", "reason": "spam"}, headers=A).json()
    assert client.post(f"/admin/reports/{rep2['reportId']}/action", json={"action": "suspend"}, headers=A).json()["effect"]["until"] is None
    assert client.post(f"/community/cells/{cell}/messages", json={"text": "무기한 중", "channel": "chat"}, headers=ch).status_code == 403
    rep3 = client.post("/reports", json={"cell_id": cell, "msg_id": "999999999", "reporter": "u1", "reason": "spam"}, headers=A).json()
    assert client.post(f"/admin/reports/{rep3['reportId']}/action", json={"action": "hide"}, headers=A).status_code == 409
    assert client.post(f"/admin/reports/{rep3['reportId']}/action", json={"action": "nuke"}, headers=A).status_code == 422


def test_console_handoff_is_one_time_admin_only(client, monkeypatch, A):
    B = _bearer(_approved_brand(client, "handoffb", "핸드오프", "own@handoffb.kr"))
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    assert client.post("/auth/console-handoff", json={"brand_id": "handoffb"}, headers=B).status_code == 401   # 브랜드 계정 불가
    assert client.post("/auth/console-handoff", json={"brand_id": "nope-brand"}, headers=A).status_code == 404
    r = client.post("/auth/console-handoff", json={"brand_id": "handoffb"}, headers=A).json()
    assert "/?handoff=" in r["url"] and r["url"].endswith("&brand=handoffb") and r["expiresMin"] == 2
    tok = r["url"].split("handoff=")[1].split("&")[0]
    got = client.post("/auth/console-handoff/redeem", json={"token": tok})
    assert got.status_code == 200 and got.json()["user"]["kind"] == "admin"
    assert client.get("/brands/handoffb/campaigns", headers=_bearer(got.json()["token"])).status_code == 200   # 관리자 권한으로 대리운영
    assert client.post("/auth/console-handoff/redeem", json={"token": tok}).status_code == 401              # 1회용
    with connect() as c:
        raw = c.execute("SELECT token_hash FROM auth_tokens WHERE kind='console_handoff' ORDER BY created_at DESC LIMIT 1").fetchone()
        assert raw and tok not in raw["token_hash"]                                                         # 원문 미저장


def test_brand_decision_after_admin_review_is_kept_on_latest_version(client, monkeypatch, A):
    """관리자가 먼저 검수(통과)한 버전에도 브랜드 수정 요청이 기록되고, 재제출 뒤 이전 링크·메모·관리자 검수 기록이 이력에 남는다.
    관리자 검수는 브랜드 상태(content_submitted)를 바꾸지 않는다."""
    B, ch, cid, creator = _collab(client, monkeypatch, "d10order", "d10order.creator@ex.com")
    client.post(f"/me/campaign-offers/{cid}/content", json={"content_url": "https://www.tiktok.com/@d10/video/1"}, headers=ch)
    v1 = next(r for r in client.get("/submissions?status=in_review", headers=A).json() if r["campaignId"] == cid)
    assert client.post(f"/submissions/{v1['submissionId']}/review", json={"result": "passed", "reviewer": "ops"}, headers=A).status_code == 200
    assert next(o for o in client.get("/me/campaign-offers", headers=ch).json() if o["campaignId"] == cid)["state"] == "content_submitted"
    # 관리자 검수 뒤 브랜드 수정 요청 → 같은 v1 에 브랜드 결정·메모 기록, 관리자 기록도 유지
    assert client.post(f"/brands/d10order/campaigns/{cid}/terms/{creator}/request-revision", json={"note": "로고를 보여 주세요"}, headers=B).status_code == 200
    rows = {r["version"]: r for r in client.get("/submissions", headers=A).json() if r["campaignId"] == cid}
    assert rows[1]["status"] == "needs_fix" and rows[1]["reviewedBy"] == "brand:d10order"
    labels = [(c["label"], c.get("fix")) for c in rows[1]["autoChecks"]]
    assert ("브랜드 수정 요청", "로고를 보여 주세요") in labels and any(l == "전사 검수" for l, _ in labels)
    # 재제출 → v2 대기, v1 링크·메모 보존. v2 를 관리자가 보완 요청해도 브랜드 완료가 v2 에 남는다
    client.post(f"/me/campaign-offers/{cid}/content", json={"content_url": "https://www.tiktok.com/@d10/video/2"}, headers=ch)
    rows = {r["version"]: r for r in client.get("/submissions", headers=A).json() if r["campaignId"] == cid}
    assert rows[1]["url"].endswith("/1") and rows[1]["status"] == "needs_fix" and rows[2]["status"] == "in_review"
    assert client.post(f"/submissions/{rows[2]['submissionId']}/review", json={"result": "needs_fix", "reviewer": "ops", "note": "자막"}, headers=A).status_code == 200
    assert client.post(f"/brands/d10order/campaigns/{cid}/terms/{creator}/complete", headers=B).status_code == 200
    rows = {r["version"]: r for r in client.get("/submissions", headers=A).json() if r["campaignId"] == cid}
    assert rows[2]["status"] == "passed" and rows[2]["reviewedBy"] == "brand:d10order"
    assert any(c["label"] == "전사 검수" and c.get("fix") == "보완 요청 · 자막" for c in rows[2]["autoChecks"])
    assert rows[1]["status"] == "needs_fix"                                   # 이전 버전은 그대로
