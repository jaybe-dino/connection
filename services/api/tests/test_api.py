"""API 통합 테스트 — 실제 Postgres(connection_test) 위에서 게이트 시맨틱 검증."""


def _pending(client, kind=None):
    gates = [g for g in client.get("/gates").json()
             if g["state"] in ("PENDING", "HELD")]
    return [g for g in gates if kind is None or g["kind"] == kind]


def test_health(client):
    body = client.get("/health").json()
    assert body["ok"] is True


def test_seeded_gates(client):
    assert len(_pending(client)) == 4


def test_operator_cannot_approve(client):
    g = _pending(client, "OUTBOUND")[0]
    r = client.post(f"/gates/{g['id']}/approve", json={"member_id": "lee"})
    assert r.status_code == 403
    assert _pending(client, "OUTBOUND")   # 여전히 대기


def test_stranger_rejected(client):
    g = _pending(client, "OUTBOUND")[0]
    assert client.post(f"/gates/{g['id']}/approve",
                       json={"member_id": "hacker"}).status_code == 403


def test_publish_approval_executes_cell_post(client):
    before = len(client.get("/cells/cell-glowlab-th/messages").json())
    g = _pending(client, "PUBLISH")[0]
    r = client.post(f"/gates/{g['id']}/approve", json={"member_id": "kim"})
    assert r.json()["state"] == "APPROVED"
    after = client.get("/cells/cell-glowlab-th/messages").json()
    assert len(after) == before + 1          # 승인 = 실행: 공지가 실제로 게시됨
    assert after[-1]["channel"] == "notice"

    ledger = client.get("/ledger").json()
    types = [e["type"] for e in ledger["entries"] if e["subject"] == g["id"]]
    assert set(types) >= {"GATE_REQUESTED", "GATE_APPROVED", "GATE_EXECUTED"}
    assert ledger["chain_ok"] is True


def test_payout_approval_notifies_creator(client):
    before = len(client.get("/notifications", params={"user": "c-mai"}).json())
    g = _pending(client, "PAYOUT")[0]
    client.post(f"/gates/{g['id']}/approve", json={"member_id": "kim"})
    notifs = client.get("/notifications", params={"user": "c-mai"}).json()
    assert len(notifs) == before + 1
    assert notifs[0]["type"] == "payout"


def test_hold_then_approve(client):
    g = _pending(client, "OUTBOUND")[0]
    before_msgs = len(client.get("/cells/cell-glowlab-th/messages").json())
    assert client.post(f"/gates/{g['id']}/hold",
                       json={"member_id": "lee", "note": "문구 재검토"}
                       ).json()["state"] == "HELD"
    # 보류는 외부 부수효과 없음
    assert len(client.get("/cells/cell-glowlab-th/messages").json()) == before_msgs
    assert client.post(f"/gates/{g['id']}/approve",
                       json={"member_id": "kim"}).json()["state"] == "APPROVED"


def test_no_double_decision(client):
    g = _pending(client, "PII")[0]
    client.post(f"/gates/{g['id']}/approve", json={"member_id": "kim"})
    assert client.post(f"/gates/{g['id']}/reject",
                       json={"member_id": "kim", "reason": "x"}).status_code == 409


def test_profile_update_hits_ledger(client):
    r = client.put("/me/c-mai/fields",
                   json={"field": "address", "value": "99 New Rd, Bangkok"})
    assert r.json()["ok"]
    me = client.get("/me/c-mai").json()
    assert me["fields"]["address"]["value"] == "99 New Rd, Bangkok"
    ledger = client.get("/ledger").json()
    assert any(e["type"] == "PROFILE_UPDATED" and e["subject"] == "c-mai"
               for e in ledger["entries"])


def test_locale_update(client):
    assert client.put("/me/c-mai/locale", json={"locale": "en"}).json()["ok"]
    assert client.get("/me/c-mai").json()["locale"] == "en"
    assert client.put("/me/c-mai/locale", json={"locale": "xx"}).status_code == 400
    client.put("/me/c-mai/locale", json={"locale": "th"})


def test_campaigns_with_my_status_and_tracking(client):
    camps = {c["id"]: c for c in
             client.get("/campaigns", params={"creator": "c-mai"}).json()}
    assert camps["cmp-1"]["myStatus"] == "selected"
    assert camps["cmp-1"]["tracking"]["trackingNo"] == "TH2026082801"
    assert camps["cmp-2"]["myStatus"] == "none"

    client.post("/campaigns/cmp-2/apply", json={"creator_id": "c-mai"})
    camps = {c["id"]: c for c in
             client.get("/campaigns", params={"creator": "c-mai"}).json()}
    assert camps["cmp-2"]["myStatus"] == "applied"


def test_cell_message_translated_fallback(client):
    r = client.post("/cells/cell-glowlab-th/messages", json={
        "author": "beauty.mai", "author_kind": "creator",
        "original": "สวัสดีค่ะ", "original_locale": "th",
    }).json()
    # 키 미설정 환경에서는 번역대기 폴백, 키 있으면 실번역 — 대상 로케일은 항상 채워짐
    assert set(r["translations"]) == {"ko", "en", "vi"}


def test_notification_read(client):
    n = client.get("/notifications", params={"user": "c-mai"}).json()[0]
    client.post(f"/notifications/{n['id']}/read")
    again = client.get("/notifications", params={"user": "c-mai"}).json()
    assert next(x for x in again if x["id"] == n["id"])["read"] is True


def test_ari_chat_fallback(client):
    r = client.post("/ari/chat", json={"message": "캠페인 상황 어때?"}).json()
    assert isinstance(r["reply"], str) and len(r["reply"]) > 0


def test_db_creators_view(client):
    rows = client.get("/db/creators").json()
    mai = next(r for r in rows if r["id"] == "c-mai")
    assert any(f["field"] == "address" for f in mai["fieldsWithBasis"])
