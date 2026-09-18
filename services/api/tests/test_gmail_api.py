"""지메일 연동 — 데모 연결 → 인바운드 답장 → 아리 분류 → 게이트 답장 발송."""


def test_demo_connect_and_list(client):
    r = client.post("/brands/glowlab/gmail/connect",
                    json={"email": "hello@glowlab.co"})
    assert r.status_code == 200, r.text
    assert r.json()["demo"] is True
    acct = r.json()["account"]
    assert acct["email"] == "hello@glowlab.co"
    # 인바운드 파서(SendGrid) 설정 전엔 답장이 브랜드 지메일로 직행한다
    assert acct["replyTo"] == "hello@glowlab.co"
    assert acct["todayCap"] == 2            # 워밍업 첫날 한도

    ls = client.get("/brands/glowlab/gmail").json()
    assert any(a["email"] == "hello@glowlab.co" for a in ls["accounts"])


def test_inbound_reply_gate_send(client, monkeypatch):
    monkeypatch.setenv("INBOUND_REPLY_KEY","test-inbound-secret")
    # 크리에이터 답장 수신 (Reply-To 인바운드) → 아리 분류
    r = client.post("/inbound/reply", headers={"X-Inbound-Key":"test-inbound-secret"}, json={
        "to": "reply+glowlab@reply.connection.app",
        "from_email": "mai@example.com", "handle": "mai.beauty",
        "subject": "Re: GLOWLAB", "text": "สนใจค่ะ! I'm interested :)"})
    assert r.status_code == 200
    assert r.json()["ariLabel"] == "interested"
    tid = r.json()["threadId"]

    inbox = client.get("/brands/glowlab/inbox").json()
    assert any(t["threadId"] == tid and t["lastDirection"] == "in" for t in inbox)

    # 답장 작성 → OUTBOUND 게이트 → 승인 → 발송(sent)
    rep = client.post(f"/inbox/threads/{tid}/reply",
                      json={"body": "Hi Mai! 조건 안내드릴게요."}).json()
    assert rep["state"] == "pending_gate"
    client.post(f"/gates/{rep['gateId']}/approve", json={"member_id": "kim"})

    th = client.get(f"/inbox/threads/{tid}").json()
    out = [m for m in th["messages"] if m["direction"] == "out"]
    assert out and out[-1]["state"] == "pending_gate"  # Reads must never trigger delivery.
    types = [e["type"] for e in client.get("/ledger?limit=30").json()["entries"]]
    assert "MAIL_RECEIVED" in types and "MAIL_SENT" not in types


def test_reply_held_never_sends(client, monkeypatch):
    monkeypatch.setenv("INBOUND_REPLY_KEY","test-inbound-secret")
    r = client.post("/inbound/reply", headers={"X-Inbound-Key":"test-inbound-secret"}, json={
        "brand_id": "glowlab", "from_email": "nok@example.com",
        "text": "ไม่สนใจ not interested"})
    assert r.json()["ariLabel"] == "declined"
    tid = r.json()["threadId"]
    rep = client.post(f"/inbox/threads/{tid}/reply", json={"body": "ok"}).json()
    client.post(f"/gates/{rep['gateId']}/hold", json={"member_id": "kim"})
    th = client.get(f"/inbox/threads/{tid}").json()
    out = [m for m in th["messages"] if m["direction"] == "out"]
    assert out[-1]["state"] == "pending_gate"        # 보류 = 외부 무통지


def test_disconnect(client):
    ls = client.get("/brands/glowlab/gmail").json()
    aid = ls["accounts"][0]["accountId"]
    assert client.delete(f"/gmail/accounts/{aid}").json()["ok"] is True
    ls2 = client.get("/brands/glowlab/gmail").json()
    assert all(a["accountId"] != aid for a in ls2["accounts"])


def test_admin_key_guards_connect(client, monkeypatch):
    monkeypatch.setenv("ADMIN_KEY", "sekrit")
    r = client.post("/brands/glowlab/gmail/connect", json={"email": "x@y.co"})
    assert r.status_code == 401                     # 키 없이 → 거부
    r = client.post("/brands/glowlab/gmail/connect",
                    json={"email": "x@y.co"}, headers={"X-Admin-Key": "sekrit"})
    assert r.status_code == 200                     # 키 있으면 통과


def test_oauth_state_signing(monkeypatch):
    from api import routes_gmail as g
    monkeypatch.setenv("ADMIN_KEY", "sekrit")
    s = g._sign_state("glowlab")
    assert g._verify_state(s) == "glowlab"
    import pytest as _pytest
    from fastapi import HTTPException
    with _pytest.raises(HTTPException):             # 위조된 brand → 거부
        g._verify_state(s.replace("glowlab", "evil"))
