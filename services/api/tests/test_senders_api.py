"""브랜드 발신 이메일 — 등록→코드 인증→DNS→활성화, 워밍업 상한, 자동 정지."""


def _register(client, email="marketing@glowlab.kr"):
    return client.post("/brands/glowlab/senders", json={"email": email}).json()


def test_full_onboarding_flow(client):
    r = _register(client, "hana@glowlab.kr")
    assert r["state"] == "unverified"
    assert "demoCode" in r                       # 데모 모드: 코드 즉시 제공
    sid = r["senderId"]

    # 틀린 코드 거절
    bad = client.post(f"/senders/{sid}/verify", json={"code": "000000"})
    assert bad.status_code == 400 or r["demoCode"] == "000000"

    v = client.post(f"/senders/{sid}/verify", json={"code": r["demoCode"]}).json()
    assert v["state"] == "dns_pending"
    assert len(v["dnsRecords"]) == 3             # SPF·DKIM·DMARC
    kinds = " ".join(rec["why"] for rec in v["dnsRecords"])
    assert "SPF" in kinds and "DKIM" in kinds and "DMARC" in kinds

    d = client.post(f"/senders/{sid}/check-dns").json()
    assert d["state"] == "active" and d["dnsOk"] is True
    assert d["todayCap"] == 20                   # 워밍업 첫날 20통

    p = client.put(f"/senders/{sid}/profile", json={
        "from_name": "GLOWLAB 파트너십팀", "reply_to": "hana@glowlab.kr",
        "signature": "GLOWLAB 드림"}).json()
    assert p["fromName"] == "GLOWLAB 파트너십팀"

    listed = client.get("/brands/glowlab/senders").json()
    assert any(s["senderId"] == sid for s in listed)


def test_duplicate_and_bad_email(client):
    _register(client, "dup@glowlab.kr")
    assert client.post("/brands/glowlab/senders",
                       json={"email": "dup@glowlab.kr"}).status_code == 409
    assert client.post("/brands/glowlab/senders",
                       json={"email": "not-an-email"}).status_code == 400


def test_reputation_auto_pause_and_human_resume(client):
    r = _register(client, "risky@glowlab.kr")
    sid = r["senderId"]
    client.post(f"/senders/{sid}/verify", json={"code": r["demoCode"]})
    client.post(f"/senders/{sid}/check-dns")

    # 반송률 5% → 자동 정지
    s = client.post(f"/senders/{sid}/stats", json={
        "bounce_rate": 0.06, "complaint_rate": 0.0}).json()
    assert s["state"] == "paused"
    # 원장에 SENDER_PAUSED
    types = [e["type"] for e in client.get("/ledger?limit=10").json()["entries"]]
    assert "SENDER_PAUSED" in types
    # 재개는 사람이 명시적으로
    resumed = client.post(f"/senders/{sid}/resume").json()
    assert resumed["state"] == "active"


def test_dns_check_requires_verify_first(client):
    r = _register(client, "early@glowlab.kr")
    assert client.post(f"/senders/{r['senderId']}/check-dns").status_code == 400
