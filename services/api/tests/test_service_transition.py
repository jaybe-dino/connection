"""서비스 전환 통합 — 온보딩/TikTok 정직 표시·알림·스레드·고정·검색·XP
멱등·캠페인 라이프사이클·국가 조건·팀 역할·브랜드 정지·격리·전환 이벤트."""

from uuid import uuid4

import pytest

from api import auth
from api.db import connect
from api.routes_community import ensure_default_cell

ADMIN = {"X-Admin-Id": "jay"}


def _h(t):
    return {"Authorization": "Bearer " + t}


def _creator(client, email):
    r = client.post("/auth/magic", json={"email": email}).json()
    tok = r["demoLink"].split("magic=")[1]
    return client.post("/auth/magic/verify",
                       json={"token": tok}).json()["token"]


def _brand_user(client, email, brand):
    inv = client.post("/auth/invite",
                      json={"email": email, "brand_id": brand}).json()
    t = inv["demoLink"].split("invite=")[1]
    return client.post("/auth/accept", json={
        "token": t, "password": "svc-pw-12345"}).json()["token"]


@pytest.fixture
def box(client):
    """독립 브랜드 A/B + 기본 셀 — 다른 테스트와 격리."""
    sfx = uuid4().hex[:8]
    a, b = f"svc-a-{sfx}", f"svc-b-{sfx}"
    with connect() as c:
        for bid, name in [(a, "Svc Brand A"), (b, "Svc Brand B")]:
            c.execute("INSERT INTO brands(brand_id,name) VALUES(%s,%s)",
                      (bid, name))
            ensure_default_cell(c, bid, name)
    return {"a": a, "b": b, "cell_a": f"cell-{a}-main",
            "cell_b": f"cell-{b}-main", "sfx": sfx}


def _onboard(client, ch, country="KR", ships=("KR",)):
    r = client.put("/me/profile", json={
        "country": country, "languages": ["ko"],
        "ship_countries": list(ships), "consent_terms": True,
        "consent_privacy": True}, headers=ch)
    assert r.status_code == 200, r.text
    return r.json()


# ── 온보딩·프로필 ────────────────────────────────────────────────

def test_profile_onboarding_states_and_handle_reset(client, box):
    ch = _h(_creator(client, f"onb-{box['sfx']}@ex.com"))
    p = client.get("/me/profile", headers=ch).json()
    assert p["onboarded"] is False
    assert p["states"] == {"emailLogin": True, "tiktokOwner": "none",
                           "tiktokShop": "none", "opsVerified": False}

    # 미완성 저장은 온보딩 완료가 아니다 — 힌트로 안내
    r = client.put("/me/profile", json={"country": "KR"}, headers=ch).json()
    assert r["onboarded"] is False and r["hint"]

    done = _onboard(client, ch)
    assert done["onboarded"] is True
    p = client.get("/me/profile", headers=ch).json()
    assert p["onboarded"] is True and p["consentedVersion"] == "creator-v1"
    assert p["shipCountries"] == ["KR"]

    # 핸들 저장 후 connected 를 흉내 → 핸들을 바꾸면 소유 상태 리셋
    cid = p["creatorId"]
    client.put("/me/profile", json={
        "country": "KR", "ship_countries": ["KR"], "tiktok_handle": "alpha_k",
        "consent_terms": True, "consent_privacy": True}, headers=ch)
    with connect() as c:
        c.execute("UPDATE creator_profiles SET tiktok_owner_state='connected'"
                  " WHERE creator_id=%s", (cid,))
    client.put("/me/profile", json={
        "country": "KR", "ship_countries": ["KR"], "tiktok_handle": "beta_k",
        "consent_terms": True, "consent_privacy": True}, headers=ch)
    assert client.get("/me/profile", headers=ch).json()["states"][
        "tiktokOwner"] == "none"  # 입력만으로 인증 유지·완료 불가


def test_onboarding_gate_unit(client, box):
    """신규(멤버십 無)만 403, 기존 회원은 legacy 통과, 완료자는 onboarded."""
    from fastapi import HTTPException

    from api.routes_identity import _ensure_creator_row
    from api.routes_service import require_onboarded
    ch = _h(_creator(client, f"gate-{box['sfx']}@ex.com"))
    claims = auth.decode_jwt(ch["Authorization"].removeprefix("Bearer "))
    with connect() as c:
        cid = _ensure_creator_row(c, claims)
        with pytest.raises(HTTPException) as e:
            require_onboarded(c, cid, "테스트")
        assert e.value.status_code == 403
    client.post("/me/join", json={"brand_id": box["a"]}, headers=ch)
    with connect() as c:
        assert require_onboarded(c, cid, "테스트")["legacy"] is True
    _onboard(client, ch)
    with connect() as c:
        assert require_onboarded(c, cid, "테스트")["onboarded"] is True


# ── TikTok: 성공 가장 금지·정직한 미연결 표시 ────────────────────

def test_tiktok_without_provider_keys_is_honestly_disconnected(
        client, box, monkeypatch):
    monkeypatch.delenv("TIKTOK_CLIENT_KEY", raising=False)
    monkeypatch.delenv("TIKTOK_CLIENT_SECRET", raising=False)
    ch = _h(_creator(client, f"tt0-{box['sfx']}@ex.com"))
    st = client.get("/me/tiktok", headers=ch).json()
    assert st["configured"] is False and st["ownerState"] == "none"
    assert st["hint"]  # 미연결 사유를 정직하게 안내
    assert client.post("/me/tiktok/connect-start",
                       headers=ch).status_code == 503
    assert client.get("/tiktok/callback?code=x&state=y").status_code == 503
    # 어떤 경로로도 connected 가 되지 않았다
    assert client.get("/me/tiktok",
                      headers=ch).json()["ownerState"] == "none"


def test_tiktok_connect_flow_cannot_fake_success(client, box, monkeypatch):
    from urllib.parse import parse_qs, urlparse
    monkeypatch.setenv("TIKTOK_CLIENT_KEY", "test-key")
    monkeypatch.setenv("TIKTOK_CLIENT_SECRET", "test-secret")
    ch = _h(_creator(client, f"tt1-{box['sfx']}@ex.com"))

    start = client.post("/me/tiktok/connect-start", headers=ch).json()
    assert start["ownerState"] == "pending"
    state = parse_qs(urlparse(start["authUrl"]).query)["state"][0]
    assert client.get("/me/tiktok", headers=ch).json()["ownerState"] == "pending"

    # 위조 state → 만료 처리, connected 불가
    assert client.get("/tiktok/callback?code=x&state=forged").status_code == 400

    # 사용자가 취소(error) → failed
    r = client.get(f"/tiktok/callback?state={state}&error=access_denied")
    assert r.status_code == 400
    assert client.get("/me/tiktok", headers=ch).json()["ownerState"] == "failed"

    # provider 토큰 교환 실패(네트워크 불가) → connected 가 될 수 없다
    start2 = client.post("/me/tiktok/connect-start", headers=ch).json()
    state2 = parse_qs(urlparse(start2["authUrl"]).query)["state"][0]

    def _no_network(*a, **k):
        raise RuntimeError("no external calls in tests")
    monkeypatch.setattr("httpx.post", _no_network)
    monkeypatch.setattr("httpx.get", _no_network)
    r = client.get(f"/tiktok/callback?code=fake-code&state={state2}")
    assert r.status_code == 400
    assert client.get("/me/tiktok", headers=ch).json()["ownerState"] == "failed"

    assert client.post("/me/tiktok/disconnect", headers=ch).json()[
        "ownerState"] == "revoked"


# ── 캠페인 라이프사이클·알림·국가 조건 ───────────────────────────

def test_campaign_lifecycle_notifications_and_reject(client, box):
    a = box["a"]
    bh = _h(_brand_user(client, f"owner-{box['sfx']}@br.com", a))
    ch = _h(_creator(client, f"camp-{box['sfx']}@ex.com"))
    client.post("/me/join", json={"brand_id": a}, headers=ch)

    # 초안 생성 — 크리에이터에게 비노출, 신청도 404
    camp = client.post(f"/brands/{a}/campaigns", json={
        "name": "신제품 앰배서더", "product": "세럼", "reward_type": "gifted"},
        headers=bh).json()
    cid = camp["campaignId"]
    assert camp["lifecycle"] == "draft"
    assert cid not in [c["campaignId"] for c in
                       client.get("/me/campaigns", headers=ch).json()]
    assert client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"},
                       headers=ch).status_code == 404

    # 발행 → 멤버 알림(배지+카드), 목록 노출
    pub = client.post(f"/brands/{a}/campaigns/{cid}/publish", headers=bh).json()
    assert pub["lifecycle"] == "published" and pub["notified"] >= 1
    assert client.post(f"/brands/{a}/campaigns/{cid}/publish",
                       headers=bh).status_code == 409  # 재발행 불가
    notif = client.get("/me/notifications", headers=ch).json()
    assert notif["unreadCount"] >= 1
    assert any(n["type"] == "campaign" and "신제품 앰배서더" in n["title"]
               for n in notif["items"])
    client.post("/me/notifications/read", json={"all": True}, headers=ch)
    assert client.get("/me/notifications",
                      headers=ch).json()["unreadCount"] == 0

    mine = [c for c in client.get("/me/campaigns", headers=ch).json()
            if c["campaignId"] == cid]
    assert mine and mine[0]["eligible"] is True  # 국가 조건 없음

    # 신청 → applied, 수정 → 반려(사유) → 재반려 409
    r = client.post(f"/campaigns/{cid}/apply", json={"creator_id": "ignored"},
                    headers=ch).json()
    assert r["myStatus"] == "applied"
    assert client.patch(f"/brands/{a}/campaigns/{cid}",
                        json={"usp": "비건 인증"}, headers=bh).status_code == 200
    rej = client.post(
        f"/brands/{a}/campaigns/{cid}/applicants/{r['creatorId']}/reject",
        json={"reason": "콘텐츠 톤 불일치"}, headers=bh)
    assert rej.status_code == 200 and rej.json()["status"] == "rejected"
    assert client.post(
        f"/brands/{a}/campaigns/{cid}/applicants/{r['creatorId']}/reject",
        json={}, headers=bh).status_code == 409

    # 마감 → 수정·신청 모두 409
    assert client.post(f"/brands/{a}/campaigns/{cid}/close",
                       headers=bh).json()["lifecycle"] == "closed"
    assert client.patch(f"/brands/{a}/campaigns/{cid}",
                        json={"usp": "x"}, headers=bh).status_code == 409
    assert client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"},
                       headers=ch).status_code == 409


def test_campaign_country_eligibility(client, box):
    a = box["a"]
    bh = _h(_brand_user(client, f"geo-{box['sfx']}@br.com", a))
    ch = _h(_creator(client, f"geo-{box['sfx']}@ex.com"))
    client.post("/me/join", json={"brand_id": a}, headers=ch)
    _onboard(client, ch, country="KR", ships=["KR"])

    cid = client.post(f"/brands/{a}/campaigns", json={
        "name": "태국 전용 캠페인", "countries": ["TH"]},
        headers=bh).json()["campaignId"]
    client.post(f"/brands/{a}/campaigns/{cid}/publish", headers=bh)

    mine = next(c for c in client.get("/me/campaigns", headers=ch).json()
                if c["campaignId"] == cid)
    assert mine["eligible"] is False and "TH" in mine["ineligibleReason"]
    r = client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"},
                    headers=ch)
    assert r.status_code == 409 and "TH" in r.json()["detail"]

    _onboard(client, ch, country="KR", ships=["KR", "TH"])  # 배송국 추가
    assert client.post(f"/campaigns/{cid}/apply", json={"creator_id": "x"},
                       headers=ch).status_code == 200


# ── XP 멱등·랭킹 가드·미션 ───────────────────────────────────────

def test_xp_awarded_once_and_ranking_guarded(client, box):
    a, b = box["a"], box["b"]
    ch = _h(_creator(client, f"xp-{box['sfx']}@ex.com"))
    client.post("/me/join", json={"brand_id": a}, headers=ch)
    client.post("/me/join", json={"brand_id": a}, headers=ch)  # 중복 join
    for text in ["안녕하세요!", "두 번째 글"]:
        assert client.post(f"/community/cells/{box['cell_a']}/messages",
                           json={"text": text}, headers=ch).status_code == 200
    xp = client.get("/me/xp", headers=ch).json()
    assert xp["total"] == 50 + 20  # join 1회 + first_message 1회만
    kinds = sorted(e["kind"] for e in xp["events"])
    assert kinds == ["first_message", "join"]

    missions = client.get(f"/me/missions?brand={a}", headers=ch).json()
    done = {m["kind"] for m in missions if m["done"]}
    assert done == {"join", "first_message"}

    # 랭킹: 멤버·자기 브랜드·운영만
    rank = client.get(f"/brands/{a}/ranking", headers=ch).json()
    assert rank and rank[0]["total"] == 70
    stranger = _h(_creator(client, f"xp2-{box['sfx']}@ex.com"))
    assert client.get(f"/brands/{a}/ranking",
                      headers=stranger).status_code == 403
    bh_b = _h(_brand_user(client, f"rank-{box['sfx']}@br.com", b))
    assert client.get(f"/brands/{a}/ranking", headers=bh_b).status_code == 403


# ── 스레드·고정·읽음·검색·공지 알림 ──────────────────────────────

def test_threads_pins_unread_search_and_notice(client, box):
    a = box["a"]
    cell = box["cell_a"]
    bh = _h(_brand_user(client, f"comm-{box['sfx']}@br.com", a))
    ch = _h(_creator(client, f"comm-{box['sfx']}@ex.com"))
    client.post("/me/join", json={"brand_id": a}, headers=ch)

    root = client.post(f"/community/cells/{cell}/messages", json={
        "text": "다음 주 라이브 일정 공유합니다"}, headers=ch).json()
    rid = root["msgId"]
    reply = client.post(f"/community/cells/{cell}/messages", json={
        "text": "참여할게요!", "thread_parent": rid}, headers=ch).json()
    # 1단계 스레드만 — 답글의 답글은 거부
    assert client.post(f"/community/cells/{cell}/messages", json={
        "text": "저도요", "thread_parent": reply["msgId"]},
        headers=ch).status_code == 400
    assert client.post(f"/community/cells/{cell}/messages", json={
        "text": "?", "thread_parent": 99999999},
        headers=ch).status_code == 404

    msgs = client.get(f"/community/cells/{cell}/messages", headers=ch).json()
    mine = next(m for m in msgs if m["msgId"] == rid)
    assert mine["replyCount"] == 1
    assert all(m["msgId"] != reply["msgId"] for m in msgs)  # 답글은 목록 제외
    th = client.get(f"/community/cells/{cell}/messages/{rid}/thread",
                    headers=ch).json()
    assert [m["msgId"] for m in th] == [rid, reply["msgId"]]

    # 고정: 크리에이터 403, 브랜드 OK
    assert client.post(f"/community/cells/{cell}/messages/{rid}/pin",
                       headers=ch).status_code == 403
    assert client.post(f"/community/cells/{cell}/messages/{rid}/pin",
                       headers=bh).json()["pinned"] is True
    msgs = client.get(f"/community/cells/{cell}/messages", headers=ch).json()
    assert next(m for m in msgs if m["msgId"] == rid)["pinnedAt"]
    client.post(f"/community/cells/{cell}/messages/{rid}/unpin", headers=bh)

    # 읽음 커서: 커서 이후만 미읽음 — 스레드 답글은 배지 계산 제외
    unread = {u["cellId"]: u for u in
              client.get("/me/unread", headers=ch).json()}
    assert unread[cell]["unread"] >= 1
    client.post(f"/community/cells/{cell}/read",
                json={"last_msg_id": unread[cell]["lastMsgId"]}, headers=ch)
    assert cell not in {u["cellId"] for u in
                        client.get("/me/unread", headers=ch).json()}

    # 검색: 2자 미만 400, 멤버만, 원문 매치
    assert client.get(f"/community/cells/{cell}/search?q=라",
                      headers=ch).status_code == 400
    found = client.get(f"/community/cells/{cell}/search?q=라이브",
                       headers=ch).json()
    assert any(m["msgId"] == rid for m in found)
    stranger = _h(_creator(client, f"comm2-{box['sfx']}@ex.com"))
    assert client.get(f"/community/cells/{cell}/search?q=라이브",
                      headers=stranger).status_code == 403

    # 공지(notice) → 멤버 알림 팬아웃, 크리에이터는 공지 게시 불가
    assert client.post(f"/community/cells/{cell}/messages", json={
        "text": "notice!", "channel": "notice"}, headers=ch).status_code == 403
    client.post("/me/notifications/read", json={"all": True}, headers=ch)
    client.post(f"/community/cells/{cell}/messages", json={
        "text": "이번 주 금요일 발송 안내", "channel": "notice"}, headers=bh)
    notif = client.get("/me/notifications", headers=ch).json()
    assert any(n["type"] == "notice" and "발송 안내" in n["title"]
               for n in notif["items"])


# ── 브랜드 팀 역할 ───────────────────────────────────────────────

def test_team_roles_owner_only(client, box):
    a = box["a"]
    t_owner = _h(_brand_user(client, f"own-{box['sfx']}@br.com", a))
    t_mgr = _h(_brand_user(client, f"mgr-{box['sfx']}@br.com", a))
    team = client.get(f"/brands/{a}/team", headers=t_owner).json()
    assert [m["role"] for m in team] == ["owner", "manager"]
    mgr_id = team[1]["userId"]

    # manager 는 역할 변경 불가, owner 만 가능
    assert client.post(f"/brands/{a}/team/role", json={
        "user_id": team[0]["userId"], "role": "manager"},
        headers=t_mgr).status_code == 403
    assert client.post(f"/brands/{a}/team/role", json={
        "user_id": mgr_id, "role": "owner"},
        headers=t_owner).status_code == 200
    team = client.get(f"/brands/{a}/team", headers=t_owner).json()
    assert next(m for m in team if m["userId"] == mgr_id)["role"] == "owner"


# ── 어드민: 정지·감사 로그 ───────────────────────────────────────

def test_admin_suspend_resume_and_audit(client, box):
    a = box["a"]
    bh = _h(_brand_user(client, f"susp-{box['sfx']}@br.com", a))
    assert client.get(f"/brands/{a}/team", headers=bh).status_code == 200

    assert client.post(f"/admin/brands/{a}/suspend",
                       json={"reason": "약관 위반 신고"},
                       headers=ADMIN).json()["suspended"] is True
    # 정지 브랜드의 JWT 접근 차단 (멱등 재정지는 already)
    assert client.get(f"/brands/{a}/team", headers=bh).status_code == 403
    assert client.post(f"/brands/{a}/campaigns", json={"name": "새 캠페인"},
                       headers=bh).status_code == 403
    assert client.post(f"/admin/brands/{a}/suspend", json={},
                       headers=ADMIN).json().get("already") is True
    listed = {b["brandId"]: b for b in
              client.get("/admin/brands", headers=ADMIN).json()}
    assert listed[a]["suspendedAt"]

    assert client.post(f"/admin/brands/{a}/resume",
                       headers=ADMIN).json()["suspended"] is False
    assert client.get(f"/brands/{a}/team", headers=bh).status_code == 200

    audit = client.get("/admin/audit?event=BRAND_SUSPENDED", headers=ADMIN).json()
    assert any(e["subject"] == a and
               e["payload"].get("reason") == "약관 위반 신고" for e in audit)
    assert client.get("/admin/audit", headers=bh).status_code in (401, 403)


def test_suspended_check_fails_closed_on_db_error(client, box, monkeypatch):
    """정지 조회가 실패하면 그 요청은 통과가 아니라 오류 — fail-closed."""
    bh = _h(_brand_user(client, f"fc-{box['sfx']}@br.com", box["a"]))
    assert client.get(f"/brands/{box['a']}/team", headers=bh).status_code == 200
    from api import db as dbmod

    def _down():
        raise RuntimeError("db down")
    monkeypatch.setattr(dbmod, "connect", _down)
    with pytest.raises(RuntimeError):  # 'DB 오류 → 정상 브랜드 허용' 금지
        client.get(f"/brands/{box['a']}/team", headers=bh)


# ── 5번 시나리오: 브랜드 격리 매트릭스 ───────────────────────────

def test_brand_isolation_matrix(client, box):
    a, b = box["a"], box["b"]
    bh_a = _h(_brand_user(client, f"iso-{box['sfx']}@br.com", a))
    ch_a = _h(_creator(client, f"iso-{box['sfx']}@ex.com"))
    client.post("/me/join", json={"brand_id": a}, headers=ch_a)
    cid_b = client.post(f"/brands/{b}/campaigns", json={"name": "B 전용"},
                        headers=_h(_brand_user(
                            client, f"isob-{box['sfx']}@br.com", b))
                        ).json()["campaignId"]

    # 브랜드 A 계정으로 B 자원 접근 — 전부 403
    for status, resp in [
        ("campaign-create", client.post(f"/brands/{b}/campaigns",
                                        json={"name": "탈취 시도"}, headers=bh_a)),
        ("campaign-edit", client.patch(f"/brands/{b}/campaigns/{cid_b}",
                                       json={"name": "변조 시도"}, headers=bh_a)),
        ("team", client.get(f"/brands/{b}/team", headers=bh_a)),
        ("ranking", client.get(f"/brands/{b}/ranking", headers=bh_a)),
        ("cell", client.get(f"/community/cells/{box['cell_b']}/messages",
                            headers=bh_a)),
        ("search", client.get(f"/community/cells/{box['cell_b']}/search?q=테스트",
                              headers=bh_a)),
        ("recruit", client.get(f"/recruitment-links/brands/{b}/applications",
                               headers=bh_a)),
    ]:
        assert resp.status_code == 403, (status, resp.text)

    # A 멤버 크리에이터도 B 자원 접근 불가
    for resp in [
        client.get(f"/community/cells/{box['cell_b']}/messages", headers=ch_a),
        client.get(f"/community/cells/{box['cell_b']}/search?q=테스트",
                   headers=ch_a),
        client.get(f"/brands/{b}/ranking", headers=ch_a),
    ]:
        assert resp.status_code == 403

    # 브랜드 계정은 어드민 정지 권한 없음
    assert client.post(f"/admin/brands/{b}/suspend", json={},
                       headers={**bh_a, "X-Admin-Id": ""}).status_code in (401, 403)


# ── 중앙 모집 전환 이벤트 (OUTREACH_CONTRACT §3) ─────────────────

@pytest.fixture
def outreach(client, monkeypatch):
    """중앙 workspace + 고객 브랜드 1개의 모집 링크(미발송·외부 메일 금지)."""
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    from api import routes_auth, routes_gmail
    monkeypatch.setattr(routes_auth, "_send_system_mail",
                        lambda *a, **k: pytest.fail("external mail forbidden"))
    monkeypatch.setattr(routes_gmail, "send_via_brand_gmail",
                        lambda *a, **k: pytest.fail("external mail forbidden"))
    sfx = uuid4().hex[:8]
    ws, bid = f"evt-ws-{sfx}", f"evt-brand-{sfx}"
    cid = f"campaign-{bid}"
    email = f"evt-{sfx}@example.invalid"
    with connect() as c:
        admin_id = str(c.execute(
            "INSERT INTO users(kind,email) VALUES('admin',%s)"
            " RETURNING user_id",
            (f"evt-admin-{sfx}@example.invalid",)).fetchone()["user_id"])
        c.execute("INSERT INTO brands(brand_id,name,is_internal)"
                  " VALUES(%s,%s,true)", (ws, "Evt workspace"))
        account = str(c.execute(
            "INSERT INTO gmail_accounts(brand_id,email) VALUES(%s,%s)"
            " RETURNING account_id",
            (ws, f"evt-sender-{sfx}@example.invalid")).fetchone()["account_id"])
        c.execute("INSERT INTO brands(brand_id,name,plan)"
                  " VALUES(%s,%s,'per_signup')", (bid, "Evt brand"))
        ensure_default_cell(c, bid, "Evt brand")
        pid = str(c.execute(
            "INSERT INTO brand_products(brand_id,name) VALUES(%s,%s)"
            " RETURNING product_id", (bid, "evt product")).fetchone()["product_id"])
        c.execute("INSERT INTO campaigns(campaign_id,brand_id,name,product,"
                  "product_id,reward_type,deadline) VALUES(%s,%s,%s,%s,%s,"
                  "'gifted',CURRENT_DATE+30)",
                  (cid, bid, "evt campaign", "evt product", pid))
    admin = _h(auth.issue_jwt({"kind": "admin", "sub": admin_id}))
    plan = {"mappings": [{"key": "k1", "target_brand_id": bid,
                          "product_id": pid, "campaign_id": cid,
                          "gmail_account_id": account,
                          "subject": "Invitation", "body": "Review please."}],
            "rows": [{"mapping_key": "k1", "email": email}]}
    p = client.post(f"/brands/{ws}/outreach/bulk/preview", json=plan,
                    headers=admin)
    assert p.status_code == 200, p.text
    r = client.post(f"/brands/{ws}/outreach/bulk/drafts", json={
        **plan, "request_id": str(uuid4()),
        "review_hash": p.json()["reviewHash"]}, headers=admin)
    assert r.status_code == 200, r.text
    batch = r.json()["batchIds"][0]
    body = client.get(f"/brands/{ws}/outreach/{batch}/review",
                      headers=admin).json()["messages"][0]["body"]
    token = body.split("&application=")[1].split()[0]
    yield {"ws": ws, "brand": bid, "campaign": cid, "email": email,
           "batch": batch, "token": token, "admin": admin}
    with connect() as c:
        c.execute("UPDATE outreach_batches SET state='cancelled'"
                  " WHERE brand_id=%s", (ws,))


def _events(token):
    with connect() as c:
        return {r["kind"] for r in c.execute(
            "SELECT e.kind FROM recruitment_link_events e"
            " JOIN recruitment_application_links l USING(link_id)"
            " WHERE l.token_hash=encode(sha256(%s::bytea),'hex')",
            (token,)).fetchall()}


def test_recruitment_conversion_events_idempotent(client, outreach):
    tok = outreach["token"]
    # click — 재조회해도 1종 1회(멱등)
    assert client.get("/recruitment-links/" + tok).status_code == 200
    assert client.get("/recruitment-links/" + tok).status_code == 200
    assert _events(tok) == {"click"}
    with connect() as c:
        assert c.execute(
            "SELECT count(*) n FROM recruitment_link_events e JOIN"
            " recruitment_application_links l USING(link_id) WHERE"
            " l.token_hash=encode(sha256(%s::bytea),'hex')"
            " AND e.kind='click'", (tok,)).fetchone()["n"] == 1

    # 수신 이메일로 로그인 → 승인 후 신청 → join+apply (재신청은 추가 없음)
    r = client.post("/auth/magic", json={
        "email": outreach["email"], "brand": outreach["brand"],
        "application": tok}).json()
    from urllib.parse import parse_qs, urlparse
    magic = parse_qs(urlparse(r["demoLink"]).query)["magic"][0]
    ch = _h(client.post("/auth/magic/verify",
                        json={"token": magic}).json()["token"])
    with connect() as c:
        c.execute("UPDATE outreach_batches SET state='approved'"
                  " WHERE batch_id=%s", (outreach["batch"],))
    a = client.post(f"/recruitment-links/{tok}/apply", headers=ch)
    assert a.status_code == 200, a.text
    client.post(f"/recruitment-links/{tok}/apply", headers=ch)
    assert _events(tok) == {"click", "join", "apply"}

    # 운영 검증 → verify 귀속 (재검증도 멱등)
    with connect() as c:
        creator = c.execute(
            "SELECT creator_id FROM recruitment_applications a JOIN"
            " recruitment_application_links l USING(link_id) WHERE"
            " l.token_hash=encode(sha256(%s::bytea),'hex')",
            (tok,)).fetchone()["creator_id"]
    assert client.post(f"/admin/creators/{creator}/verify",
                       headers=outreach["admin"]).status_code == 200
    client.post(f"/admin/creators/{creator}/verify", headers=outreach["admin"])
    assert _events(tok) == {"click", "join", "verify", "apply"}

    # 만료 → 조회는 410 + blocked 기록
    with connect() as c:
        c.execute("UPDATE recruitment_application_links SET"
                  " expires_at=now()-interval '1 day' WHERE"
                  " token_hash=encode(sha256(%s::bytea),'hex')", (tok,))
    assert client.get("/recruitment-links/" + tok).status_code == 410
    assert "blocked" in _events(tok)
