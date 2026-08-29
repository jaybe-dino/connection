"""운영 라우트 통합 테스트 — 신청 승인 · 신고 · 분쟁 · 제출/검수 · 어드민."""

ADMIN = {"X-Admin-Id": "jay"}


# ── 브랜드 신청 → 승인 ───────────────────────────────────────────

def test_application_approve_flow(client):
    r = client.post("/applications", json={
        "slug": "newbrand", "name": "뉴브랜드", "biz_no": "123-45-67890",
        "category": "스킨케어", "countries": ["TH"], "plan": "starter",
        "answers": {"brand_one_liner": "저자극 스킨케어",
                    "banned_words": "미백, 화이트닝"},
        "contact": "ceo@newbrand.kr",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "pending"

    # 같은 슬러그 재신청 차단
    assert client.post("/applications", json={
        "slug": "newbrand", "name": "x"}).status_code == 409
    # 기존 브랜드 슬러그도 차단
    assert client.post("/applications", json={
        "slug": "glowlab", "name": "x"}).status_code == 409

    # 어드민 인증 없이 접근 불가
    assert client.get("/admin/applications").status_code == 401

    apps = client.get("/admin/applications", headers=ADMIN).json()
    app_row = next(a for a in apps if a["slug"] == "newbrand")
    r = client.post(f"/admin/applications/{app_row['appId']}/approve", headers=ADMIN)
    assert r.json()["brandId"] == "newbrand"

    # 승인 → 브랜드 생성 + 프로필 v1 + 원장 기록 + 재결정 차단
    assert client.get("/applications/newbrand/status").json()["status"] == "approved"
    assert client.post(f"/admin/applications/{app_row['appId']}/approve",
                       headers=ADMIN).status_code == 409
    ledger = client.get("/ledger?limit=100").json()
    assert any(e["type"] == "BRAND_APPROVED" and e["subject"] == "newbrand"
               for e in ledger["entries"])


def test_application_reject(client):
    client.post("/applications", json={"slug": "badbrand", "name": "배드"})
    apps = client.get("/admin/applications", headers=ADMIN).json()
    app_row = next(a for a in apps if a["slug"] == "badbrand")
    client.post(f"/admin/applications/{app_row['appId']}/reject",
                headers=ADMIN, json={"reason": "사업자 확인 불가"})
    st = client.get("/applications/badbrand/status").json()
    assert st["status"] == "rejected"
    assert st["reject_reason"] == "사업자 확인 불가"


# ── 신고 ─────────────────────────────────────────────────────────

def test_report_flow(client):
    r = client.post("/reports", json={
        "cell_id": "cell-glowlab-th", "msg_id": "1", "reporter": "c-mai",
        "reason": "harassment", "detail": "공격적인 메시지",
    }).json()
    assert r["slaHours"] == 24                     # 심각 → 24h SLA

    reports = client.get("/admin/reports", headers=ADMIN).json()
    mine = next(x for x in reports if x["reportId"] == r["reportId"])
    assert mine["severity"] == "severe"

    a = client.post(f"/admin/reports/{r['reportId']}/action", headers=ADMIN,
                    json={"action": "warn"})
    assert a.json()["status"] == "actioned"
    assert client.post(f"/admin/reports/{r['reportId']}/action", headers=ADMIN,
                       json={"action": "dismiss"}).status_code == 409  # 재처리 차단


def test_spam_report_normal_sla(client):
    r = client.post("/reports", json={
        "cell_id": "cell-glowlab-th", "reporter": "c-nong", "reason": "spam",
    }).json()
    assert r["slaHours"] == 72


# ── 분쟁 ─────────────────────────────────────────────────────────

def test_dispute_flow(client):
    d = client.post("/disputes", json={
        "kind": "review", "brand_id": "glowlab", "creator_id": "c-mai",
        "campaign_id": "cmp-1", "claim": "조건에 없던 항목으로 보완요청 받음",
    }).json()
    open_list = client.get("/admin/disputes", headers=ADMIN).json()
    assert any(x["disputeId"] == d["disputeId"] for x in open_list)

    client.post(f"/admin/disputes/{d['disputeId']}/resolve", headers=ADMIN,
                json={"verdict": "크리에이터 승 — 원 조건 기준으로 통과 처리"})
    # 판정 → 크리에이터 알림 발송
    notifs = client.get("/notifications", params={"user": "c-mai"}).json()
    assert any("분쟁 판정" in n["title"] for n in notifs)


# ── 제출 · 검수 ──────────────────────────────────────────────────

def test_submission_autocheck_needs_fix_then_pass(client):
    bad = client.post("/submissions", json={
        "campaign_id": "cmp-1", "creator_id": "c-mai",
        "url": "https://tiktok.com/v/1", "caption": "รักษาสิว!",  # 표기 없음+의약품 표현
    }).json()
    assert bad["status"] == "needs_fix"
    labels = {c["label"]: c["pass"] for c in bad["autoChecks"]}
    assert labels["광고 표기(#ad)"] is False
    assert labels["금지 표현 없음"] is False

    good = client.post("/submissions", json={
        "campaign_id": "cmp-1", "creator_id": "c-mai",
        "url": "https://tiktok.com/v/2", "caption": "#ad ครีมกันแดดดีมาก ชอบเลย",
    }).json()
    assert good["status"] == "in_review"

    # 콘솔 검수: 통과 → 알림 + 지원 상태 passed
    r = client.post(f"/submissions/{good['submissionId']}/review",
                    json={"result": "passed", "reviewer": "kim"})
    assert r.json()["ok"]
    notifs = client.get("/notifications", params={"user": "c-mai"}).json()
    assert any("검수를 통과" in n["title"] for n in notifs)
    camps = {c["id"]: c for c in
             client.get("/campaigns", params={"creator": "c-mai"}).json()}
    assert camps["cmp-1"]["myStatus"] == "passed"

    # 반려 결과값은 거부
    assert client.post(f"/submissions/{bad['submissionId']}/review",
                       json={"result": "rejected", "reviewer": "kim"}).status_code == 400


def test_admin_summary(client):
    s = client.get("/admin/summary", headers=ADMIN).json()
    assert s["brands"] >= 2 and s["creators"] >= 3
    assert "pendingApplications" in s and "openReports" in s
