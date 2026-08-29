def test_compliance_endpoint(client):
    r = client.post("/compliance/check", json={
        "text": "여드름 치료에 100% 효과", "country": "KR",
    }).json()
    assert r["ok"] is False
    kinds = {v["kind"] for v in r["violations"]}
    assert {"missing_disclosure", "medical_claim"} <= kinds


def test_brief_endpoint_generates_and_ledgers(client):
    r = client.post("/campaigns/cmp-1/briefs", json={"creator_id": "c-mai"})
    assert r.status_code == 200
    brief = r.json()
    assert brief["creator_handle"] == "beauty.mai"
    assert len(brief["hooks"]) == 3
    assert brief["required_disclosure"].startswith("#")
    ledger = client.get("/ledger").json()
    assert any(e["type"] == "BRIEF_GENERATED" and e["subject"] == "c-mai"
               for e in ledger["entries"])
    assert ledger["chain_ok"] is True


def test_brief_404s(client):
    assert client.post("/campaigns/nope/briefs",
                       json={"creator_id": "c-mai"}).status_code == 404
    assert client.post("/campaigns/cmp-1/briefs",
                       json={"creator_id": "nobody"}).status_code == 404
