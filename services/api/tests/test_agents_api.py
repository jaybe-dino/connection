"""에이전트 라우트 — 게이트 접수 · 캠페인 등록 · 인바운드 판정."""


def test_agent_files_outbound_gate(client):
    r = client.post("/gates", json={
        "kind": "OUTBOUND", "summary": "메일 1차 80건",
        "detail": "태국어 · unsub 포함", "requested_by": "ari:glowlab",
    }).json()
    assert r["state"] == "PENDING"
    g = client.get(f"/gates/{r['gateId']}").json()
    assert g["kind"] == "OUTBOUND" and g["state"] == "PENDING"
    # 승인 → 상태 전이 확인 (러너 폴링 시나리오)
    client.post(f"/gates/{r['gateId']}/approve", json={"member_id": "kim"})
    assert client.get(f"/gates/{r['gateId']}").json()["state"] == "APPROVED"


def test_bad_gate_kind(client):
    assert client.post("/gates", json={"kind": "NOPE", "summary": "x"}).status_code == 400


def test_create_campaign_posts_notice(client):
    before = len(client.get("/cells/cell-glowlab-th/messages").json())
    r = client.post("/campaigns", json={
        "name": "9월 진정 앰플 · 태국", "product": "시카 진정 앰플",
        "reward_type": "paid", "reward_amount": 38000,
        "usp": "48시간 진정 테스트 완료",
        "conditions": ["15초 이상", "#ad 표기"], "capacity": 30, "deadline": "2026-10-05",
    }).json()
    assert r["campaignId"].startswith("cmp-")
    assert r["noticePosted"] is True
    msgs = client.get("/cells/cell-glowlab-th/messages").json()
    assert len(msgs) == before + 1
    assert msgs[-1]["channel"] == "notice"
    assert msgs[-1]["campaignCardId"] == r["campaignId"]
    # 크리에이터 캠페인 목록에도 반영
    camps = client.get("/campaigns", params={"creator": "c-mai"}).json()
    assert any(c["id"] == r["campaignId"] for c in camps)
    # 원장 기록
    types = [e["type"] for e in client.get("/ledger?limit=20").json()["entries"]]
    assert "CAMPAIGN_PUBLISHED" in types and "CAMPAIGN_TRANSLATED" in types


def test_inbound_invite(client):
    r = client.post("/inbound", json={
        "handle": "@new.thai.creator", "country": "TH",
        "product_used": "선쿠션 리뷰 자주 해요", "followers": 8000,
        "engagement_rate": 0.07,
    }).json()
    assert r["verdict"] == "invite"
    assert "담당자가 연락" in r["reply"]
    assert len(r["axes"]) == 4


def test_inbound_sponsor_overload_still_invited_no_billing(client):
    r = client.post("/inbound", json={
        "handle": "@heavy.sponsor", "country": "TH",
        "followers": 30000, "engagement_rate": 0.03, "sponsor_ratio_90d": 0.7,
    }).json()
    assert r["verdict"] == "billing_excluded"
    assert "셀에 초대" in r["reply"]          # 차단이 아니라 과금 제외


def test_inbound_reject_polite(client):
    r = client.post("/inbound", json={
        "handle": "@wrong.market", "country": "JP", "followers": 100,
        "engagement_rate": 0.001,
    }).json()
    assert r["verdict"] in ("reject", "hold")
    assert len(r["reply"]) > 5                # 무응답으로 두지 않는다
