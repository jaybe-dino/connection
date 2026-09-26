"""지메일 연동 — 데모 연결 → 인바운드 답장 → 아리 분류 → 게이트 답장 발송."""

import os


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


# ── OAuth 콜백 오류 처리 — 신규 브랜드 연결 흐름 (외부 호출 전부 모사) ──

def test_callback_network_failure_returns_friendly_html(client, monkeypatch):
    """토큰 교환 네트워크 실패 — 브라우저에 500 스택/JSON이 아니라
    재시도 안내 HTML(502)이 뜬다."""
    import httpx
    from api import routes_gmail as rg
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid-test")   # 실모드
    state = rg._new_oauth_state("glowlab")

    def down(*a, **k):
        raise httpx.ConnectError("dns fail")
    monkeypatch.setattr(httpx, "post", down)
    r = client.get(f"/gmail/callback?code=abc&state={state}")
    assert r.status_code == 502
    assert "다시" in r.text and "<h3>" in r.text          # 사람이 읽는 안내
    assert "Traceback" not in r.text and "dns fail" not in r.text


def test_callback_non_json_token_response_is_502(client, monkeypatch):
    import httpx
    from api import routes_gmail as rg
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid-test")
    state = rg._new_oauth_state("glowlab")

    class Resp:
        def json(self):
            raise ValueError("not json")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: Resp())
    r = client.get(f"/gmail/callback?code=abc&state={state}")
    assert r.status_code == 502 and "<h3>" in r.text


def test_callback_state_errors_render_html_not_json(client, monkeypatch):
    """만료/위조 state — 콜백 창에 JSON({"detail":…}) 대신 안내 HTML."""
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid-test")
    r = client.get("/gmail/callback?code=abc&state=forged-state")
    assert r.status_code == 400
    assert "연결 실패" in r.text and "다시 연결" in r.text
    assert not r.text.startswith("{")


def test_callback_bad_expires_in_still_connects(client, monkeypatch):
    """구글이 비정상 expires_in을 줘도 연결 자체는 성공한다."""
    import base64 as b64
    import json as js
    import httpx
    from api import routes_gmail as rg
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid-test")
    import psycopg
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("INSERT INTO brands (brand_id, name, is_demo) VALUES"
                     " ('cbtest','CBTEST',false)"
                     " ON CONFLICT (brand_id) DO NOTHING")
        conn.commit()
    state = rg._new_oauth_state("cbtest")
    claims = b64.urlsafe_b64encode(js.dumps(
        {"email": "ops.cb@glowlab.test", "email_verified": True}
    ).encode()).decode().rstrip("=")

    class Resp:
        def json(self):
            return {"access_token": "at", "refresh_token": "rt",
                    "expires_in": "abc",              # 비정상 값
                    "id_token": f"h.{claims}.s",
                    "scope": ("https://www.googleapis.com/auth/gmail.send"
                              " https://www.googleapis.com/auth/gmail.readonly"
                              " openid email")}
    monkeypatch.setattr(httpx, "post", lambda *a, **k: Resp())
    r = client.get(f"/gmail/callback?code=abc&state={state}")
    assert r.status_code == 200 and "연결 완료" in r.text
    import psycopg
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        st = conn.execute("SELECT state FROM gmail_accounts WHERE email="
                          "'ops.cb@glowlab.test'").fetchone()[0]
        conn.execute("DELETE FROM gmail_accounts WHERE email="
                     "'ops.cb@glowlab.test'")
        conn.commit()
    assert st == "connected"
