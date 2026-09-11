"""지메일 연동 — 데모 연결 → 인바운드 답장 → 아리 분류 → 게이트 답장 발송."""


def test_demo_connect_and_list(client):
    r = client.post("/brands/glowlab/gmail/connect",
                    json={"email": "hello@glowlab.co"})
    assert r.status_code == 200, r.text
    assert r.json()["demo"] is True
    acct = r.json()["account"]
    assert acct["email"] == "hello@glowlab.co"
    assert acct["replyTo"].startswith("reply+glowlab@")
    assert acct["todayCap"] >= 20            # 워밍업 첫날 한도

    ls = client.get("/brands/glowlab/gmail").json()
    assert any(a["email"] == "hello@glowlab.co" for a in ls["accounts"])


def test_inbound_reply_gate_send(client):
    # 크리에이터 답장 수신 (Reply-To 인바운드) → 아리 분류
    r = client.post("/inbound/reply", json={
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
    assert out and out[-1]["state"] == "sent" and out[-1]["sentVia"] == "demo"
    types = [e["type"] for e in client.get("/ledger?limit=30").json()["entries"]]
    assert "MAIL_RECEIVED" in types and "MAIL_SENT" in types


def test_reply_held_never_sends(client):
    r = client.post("/inbound/reply", json={
        "brand_id": "glowlab", "from_email": "nok@example.com",
        "text": "ไม่สนใจ not interested"})
    assert r.json()["ariLabel"] == "declined"
    tid = r.json()["threadId"]
    rep = client.post(f"/inbox/threads/{tid}/reply", json={"body": "ok"}).json()
    client.post(f"/gates/{rep['gateId']}/hold", json={"member_id": "kim"})
    th = client.get(f"/inbox/threads/{tid}").json()
    out = [m for m in th["messages"] if m["direction"] == "out"]
    assert out[-1]["state"] == "held"        # 보류 = 외부 무통지


def test_disconnect(client):
    ls = client.get("/brands/glowlab/gmail").json()
    aid = ls["accounts"][0]["accountId"]
    assert client.delete(f"/gmail/accounts/{aid}").json()["ok"] is True
    ls2 = client.get("/brands/glowlab/gmail").json()
    assert all(a["accountId"] != aid for a in ls2["accounts"])
