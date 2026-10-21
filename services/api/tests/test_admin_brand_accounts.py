"""어드민 브랜드 직접 등록 + 로그인 계정 관리 — disposable 로컬 DB 전범위.

실메일 발송·실결제 없음. 링크 토큰은 응답으로만 받고 감사 payload에
남지 않는지, epoch/토큰 폐기로 기존 JWT·구 링크가 즉시 죽는지 검증한다.
"""
import json
from uuid import uuid4

import pytest

from api import auth
from api.db import connect


def _h(t):
    return {"Authorization": "Bearer " + t}


@pytest.fixture
def admin(client):
    sfx = uuid4().hex[:8]
    with connect() as c:
        aid = str(c.execute(
            "INSERT INTO users(kind,email) VALUES('admin',%s)"
            " RETURNING user_id",
            (f"ops-{sfx}@example.invalid",)).fetchone()["user_id"])
    yield {"id": aid, "h": _h(auth.issue_jwt({"kind": "admin", "sub": aid})),
           "sfx": sfx}
    # 공유 세션 DB 정리 — 어드민 계정이 남으면 /auth/bootstrap 테스트가
    # 409로 오염된다(브랜드/셀 데이터는 다른 테스트들과 같은 방식으로 유지)
    with connect() as c:
        c.execute("DELETE FROM auth_tokens WHERE user_id=%s::uuid", (aid,))
        c.execute("DELETE FROM users WHERE user_id=%s::uuid", (aid,))


def _register(client, admin, slug=None, email=None, **over):
    body = {"name": "뷰티 브랜드 " + (slug or admin["sfx"]),
            "slug": slug or "brand-" + admin["sfx"],
            "category": "스킨케어", "countries": ["KR", "TH"],
            "manager_email": email or f"owner-{slug or 'brand-' + admin['sfx']}@brand.example"}
    body.update(over)
    return client.post("/admin/brands", json=body, headers=admin["h"])


def _accounts(client, admin, slug):
    r = client.get(f"/admin/brands/{slug}/accounts", headers=admin["h"])
    assert r.status_code == 200, r.text
    return r.json()


def _setup_password(client, admin, slug, user_id, pw="brandpass-123"):
    link = client.post(f"/admin/brands/{slug}/accounts/{user_id}/setup-link",
                       headers=admin["h"]).json()["link"]
    tok = link.split("invite=")[1]
    r = client.post("/auth/accept", json={"token": tok, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ── 등록 ─────────────────────────────────────────────────────────

def test_register_creates_brand_atomically(client, admin):
    slug = "brand-" + admin["sfx"]
    r = _register(client, admin)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["brandId"] == slug and out["plan"] == "per_signup"
    with connect() as c:
        b = c.execute("SELECT name,category,plan FROM brands WHERE brand_id=%s",
                      (slug,)).fetchone()
        assert b["plan"] == "per_signup" and b["category"] == "스킨케어"
        assert c.execute("SELECT 1 FROM cells WHERE brand_id=%s",
                         (slug,)).fetchone()          # 기본 커뮤니티
        prof = c.execute(
            "SELECT fields,note FROM brand_profile_versions WHERE brand_id=%s",
            (slug,)).fetchone()
        assert prof["note"] == "admin_registered"
        # 실제 사용자가 확인/동의한 것처럼 기록하지 않는다
        assert all(not v.get("confirmed") for v in prof["fields"].values())
        led = c.execute(
            "SELECT payload FROM ledger WHERE event_type='ADMIN_BRAND_REGISTERED'"
            " AND subject=%s", (slug,)).fetchone()
        assert led["payload"]["termsConfirmed"] is False
    accs = _accounts(client, admin, slug)
    assert len(accs) == 1 and accs[0]["role"] == "owner"
    assert accs[0]["passwordSet"] is False and accs[0]["lastLoginAt"] is None
    assert accs[0]["state"] == "active"


def test_register_conflicts_and_atomic_rollback(client, admin):
    slug = "brand-" + admin["sfx"]
    assert _register(client, admin).status_code == 200
    # 중복 slug(기존 브랜드) 409
    assert _register(client, admin, email=f"x-{admin['sfx']}@b.example"
                     ).status_code == 409
    # 가입 신청 pending slug 409
    pend = "pend-" + admin["sfx"]
    with connect() as c:
        c.execute("INSERT INTO brand_applications(slug,name,contact)"
                  " VALUES(%s,'Pending Brand','p@b.example')", (pend,))
    assert _register(client, admin, slug=pend).status_code == 409
    # 예약어/형식 400
    assert _register(client, admin, slug="admin").status_code == 400
    assert _register(client, admin, slug="Bad_Slug!").status_code == 400
    # 담당자 이메일 전환 금지: 크리에이터/어드민/타 브랜드 계정 각각 409
    with connect() as c:
        c.execute("INSERT INTO users(kind,email) VALUES('creator',%s)",
                  (f"cr-{admin['sfx']}@ex.invalid",))
    for taken in [f"cr-{admin['sfx']}@ex.invalid",          # 크리에이터
                  f"ops-{admin['sfx']}@example.invalid",     # 어드민(본인)
                  f"owner-brand-{admin['sfx']}@brand.example"]:  # 타 브랜드
        r = _register(client, admin, slug="new-" + uuid4().hex[:6], email=taken)
        assert r.status_code == 409, (taken, r.text)
    # 원자성: 409로 거부된 등록은 브랜드 행도 남기지 않는다
    bad = "atomic-" + admin["sfx"]
    _register(client, admin, slug=bad,
              email=f"owner-brand-{admin['sfx']}@brand.example")
    with connect() as c:
        assert not c.execute("SELECT 1 FROM brands WHERE brand_id=%s",
                             (bad,)).fetchone()


def test_requires_admin_jwt_not_legacy_key(client, admin):
    body = {"name": "차단 확인", "slug": "deny-" + admin["sfx"],
            "manager_email": "deny@b.example"}
    # 무인증 / 간이 키 헤더만 → 401 (legacy 키 대체 불가)
    assert client.post("/admin/brands", json=body).status_code == 401
    assert client.post("/admin/brands", json=body,
                       headers={"X-Admin-Id": "jay"}).status_code == 401
    # 비어드민(브랜드 JWT) 401
    _register(client, admin)
    accs = _accounts(client, admin, "brand-" + admin["sfx"])
    btok = _setup_password(client, admin, "brand-" + admin["sfx"],
                           accs[0]["userId"])
    assert client.post("/admin/brands", json=body,
                       headers=_h(btok)).status_code == 401
    # OTP 미완료 어드민 401
    pend = _h(auth.issue_jwt({"kind": "admin", "sub": admin["id"],
                              "otp": "pending"}))
    assert client.post("/admin/brands", json=body, headers=pend
                       ).status_code == 401
    assert client.get(f"/admin/brands/brand-{admin['sfx']}/accounts",
                      headers=pend).status_code == 401


def test_register_rejects_blank_name_and_trims(client, admin):
    slug = "brand-" + admin["sfx"]
    # 공백만 있는 이름은 pydantic 길이 검사를 통과해도 서버에서 400
    assert _register(client, admin, name="   ").status_code == 400
    assert _register(client, admin, name=" a ").status_code == 400
    r = _register(client, admin, name="  뷰티 브랜드  ")
    assert r.status_code == 200, r.text
    with connect() as c:
        row = c.execute("SELECT name FROM brands WHERE brand_id=%s",
                        (slug,)).fetchone()
        assert row["name"] == "뷰티 브랜드"           # trim 후 저장


# ── 초기 설정 링크 → 비밀번호 설정 → 로그인 → 자기 브랜드만 ──────

def test_setup_link_flow_and_isolation(client, admin):
    slug = "brand-" + admin["sfx"]
    other = "other-" + admin["sfx"]
    _register(client, admin)
    _register(client, admin, slug=other, email=f"owner-{other}@brand.example")
    uid = _accounts(client, admin, slug)[0]["userId"]

    l1 = client.post(f"/admin/brands/{slug}/accounts/{uid}/setup-link",
                     headers=admin["h"]).json()
    assert "invite=" in l1["link"] and l1["ttlHours"] == 72
    tok1 = l1["link"].split("invite=")[1]
    # 새 발급 → 이전 같은 종류 토큰 폐기
    l2 = client.post(f"/admin/brands/{slug}/accounts/{uid}/setup-link",
                     headers=admin["h"]).json()
    tok2 = l2["link"].split("invite=")[1]
    assert client.post("/auth/accept", json={
        "token": tok1, "password": "brandpass-123"}).status_code >= 400
    # 감사 payload·원장에 토큰 원문이 없다
    with connect() as c:
        rows = c.execute("SELECT payload::text t FROM ledger WHERE"
                         " event_type LIKE 'BRAND_ACCOUNT_%%'").fetchall()
        assert rows and all(tok1 not in r["t"] and tok2 not in r["t"]
                            for r in rows)
    # 유효 링크로 사용자가 직접 비밀번호 설정 → 로그인
    r = client.post("/auth/accept", json={"token": tok2,
                                          "password": "brandpass-123"})
    assert r.status_code == 200, r.text
    login = client.post("/auth/login", json={
        "email": f"owner-{slug}@brand.example", "password": "brandpass-123"})
    assert login.status_code == 200, login.text
    btok = login.json()["token"]
    # 자기 브랜드만 접근, 타 브랜드 403
    assert client.get(f"/brands/{slug}/team", headers=_h(btok)).status_code == 200
    assert client.get(f"/brands/{other}/team", headers=_h(btok)).status_code == 403
    # 비밀번호 설정 후 초기 설정 링크 재발급 금지(기존 비밀번호 보호)
    assert client.post(f"/admin/brands/{slug}/accounts/{uid}/setup-link",
                       headers=admin["h"]).status_code == 409
    # 계정 현황 반영: passwordSet/lastLoginAt
    acc = _accounts(client, admin, slug)[0]
    assert acc["passwordSet"] is True and acc["lastLoginAt"]
    # 타 브랜드 계정/어드민 계정은 이 경로로 조작 불가
    other_uid = _accounts(client, admin, other)[0]["userId"]
    assert client.post(f"/admin/brands/{slug}/accounts/{other_uid}/setup-link",
                       headers=admin["h"]).status_code == 404
    assert client.post(f"/admin/brands/{slug}/accounts/{admin['id']}/state",
                       json={"active": False}, headers=admin["h"]
                       ).status_code == 404


# ── 재설정 링크: 만료/재사용/구 링크 폐기/epoch ──────────────────

def test_reset_link_expiry_reuse_and_revocation(client, admin):
    slug = "brand-" + admin["sfx"]
    _register(client, admin)
    uid = _accounts(client, admin, slug)[0]["userId"]
    # 비밀번호 없는 계정엔 reset 금지(초기 설정 링크 사용)
    assert client.post(f"/admin/brands/{slug}/accounts/{uid}/reset-link",
                       headers=admin["h"]).status_code == 409
    btok = _setup_password(client, admin, slug, uid)

    r1 = client.post(f"/admin/brands/{slug}/accounts/{uid}/reset-link",
                     headers=admin["h"]).json()
    assert r1["ttlMinutes"] == 30
    t1 = r1["link"].split("reset=")[1]
    t2 = client.post(f"/admin/brands/{slug}/accounts/{uid}/reset-link",
                     headers=admin["h"]).json()["link"].split("reset=")[1]
    # 구 링크 폐기
    assert client.post("/auth/reset/confirm", json={
        "token": t1, "password": "newpassword-45"}).status_code >= 400
    # 새 링크로 재설정 → 기존 JWT 즉시 무효(epoch)
    ok = client.post("/auth/reset/confirm", json={
        "token": t2, "password": "newpassword-45"})
    assert ok.status_code == 200, ok.text
    assert client.get(f"/brands/{slug}/team", headers=_h(btok)).status_code == 401
    # 재사용 차단
    assert client.post("/auth/reset/confirm", json={
        "token": t2, "password": "newpassword-67"}).status_code >= 400
    # 만료 차단
    t3 = client.post(f"/admin/brands/{slug}/accounts/{uid}/reset-link",
                     headers=admin["h"]).json()["link"].split("reset=")[1]
    with connect() as c:
        c.execute("UPDATE auth_tokens SET expires_at=now()-interval '1 min'"
                  " WHERE used_at IS NULL AND kind='reset'")
    assert client.post("/auth/reset/confirm", json={
        "token": t3, "password": "newpassword-89"}).status_code >= 400


# ── 역할 변경·중지·세션 철회·마지막 owner 보호 ──────────────────

def test_role_change_bumps_epoch_and_last_owner_guard(client, admin):
    slug = "brand-" + admin["sfx"]
    _register(client, admin)
    uid = _accounts(client, admin, slug)[0]["userId"]
    # 마지막 활성 owner: 중지/강등 모두 409 (어드민 경로)
    assert client.post(f"/admin/brands/{slug}/accounts/{uid}/state",
                       json={"active": False}, headers=admin["h"]
                       ).status_code == 409
    assert client.post(f"/admin/brands/{slug}/accounts/{uid}/role",
                       json={"role": "manager"}, headers=admin["h"]
                       ).status_code == 409
    owner_tok = _setup_password(client, admin, slug, uid)
    # 콘솔 기존 경로에서도 마지막 owner 자기 강등 409 (독립 QA 불변식)
    assert client.post(f"/brands/{slug}/team/role",
                       json={"user_id": uid, "role": "manager"},
                       headers=_h(owner_tok)).status_code == 409
    # 두 번째 계정 추가 → owner 승격(콘솔 경로) → 기존 JWT 무효화 확인
    second = client.post(f"/admin/brands/{slug}/accounts",
                         json={"email": f"mgr-{admin['sfx']}@brand.example",
                               "role": "manager"}, headers=admin["h"]).json()
    mgr_tok = _setup_password(client, admin, slug, second["userId"],
                              pw="managerpass-12")
    assert client.post(f"/brands/{slug}/team/role",
                       json={"user_id": second["userId"], "role": "owner"},
                       headers=_h(owner_tok)).status_code == 200
    # 역할이 바뀐 당사자의 기존 JWT는 즉시 차단(낡은 역할 유지 금지)
    assert client.get(f"/brands/{slug}/team",
                      headers=_h(mgr_tok)).status_code == 401
    # 이제 owner 2명 → 첫 owner 강등 가능(어드민 경로) + epoch 상승
    assert client.post(f"/admin/brands/{slug}/accounts/{uid}/role",
                       json={"role": "manager"}, headers=admin["h"]
                       ).status_code == 200
    assert client.get(f"/brands/{slug}/team",
                      headers=_h(owner_tok)).status_code == 401
    accs = {a["userId"]: a["role"] for a in _accounts(client, admin, slug)}
    assert accs[uid] == "manager" and accs[second["userId"]] == "owner"
    # 마지막 owner 보호는 상태와 무관히 유지: 남은 owner 중지 409
    assert client.post(
        f"/admin/brands/{slug}/accounts/{second['userId']}/state",
        json={"active": False}, headers=admin["h"]).status_code == 409


def test_role_change_revokes_open_links_both_paths(client, admin):
    """역할 변경은 epoch 상승뿐 아니라 떠 있는 초기 설정/재설정 링크도
    폐기해야 한다 — 어드민 경로와 콘솔 team/role 경로 모두."""
    slug = "brand-" + admin["sfx"]
    _register(client, admin)
    uid = _accounts(client, admin, slug)[0]["userId"]
    owner_tok = _setup_password(client, admin, slug, uid)
    second = client.post(f"/admin/brands/{slug}/accounts",
                         json={"email": f"mgr-{admin['sfx']}@brand.example",
                               "role": "manager"}, headers=admin["h"]).json()
    # (어드민 경로) 미설정 계정의 열린 초기 설정 링크 → 역할 변경 시 폐기
    inv = client.post(
        f"/admin/brands/{slug}/accounts/{second['userId']}/setup-link",
        headers=admin["h"]).json()["link"].split("invite=")[1]
    assert client.post(
        f"/admin/brands/{slug}/accounts/{second['userId']}/role",
        json={"role": "owner"}, headers=admin["h"]).status_code == 200
    assert client.post("/auth/accept", json={
        "token": inv, "password": "brandpass-456"}).status_code >= 400
    # (콘솔 기존 경로) 열린 재설정 링크 → 역할 변경 시 폐기 (owner 2명 상태)
    rst = client.post(f"/admin/brands/{slug}/accounts/{uid}/reset-link",
                      headers=admin["h"]).json()["link"].split("reset=")[1]
    assert client.post(f"/brands/{slug}/team/role",
                       json={"user_id": uid, "role": "manager"},
                       headers=_h(owner_tok)).status_code == 200
    assert client.post("/auth/reset/confirm", json={
        "token": rst, "password": "newpassword-45"}).status_code >= 400


def test_suspend_resume_and_session_revoke(client, admin):
    slug = "brand-" + admin["sfx"]
    _register(client, admin)
    uid = _accounts(client, admin, slug)[0]["userId"]
    second = client.post(f"/admin/brands/{slug}/accounts",
                         json={"email": f"mgr-{admin['sfx']}@brand.example",
                               "role": "owner"}, headers=admin["h"]).json()
    tok = _setup_password(client, admin, slug, uid)
    assert client.get(f"/brands/{slug}/team", headers=_h(tok)).status_code == 200
    # 중지 전 발급해 둔 재설정 링크는 중지 시 함께 폐기된다
    open_reset = client.post(
        f"/admin/brands/{slug}/accounts/{uid}/reset-link",
        headers=admin["h"]).json()["link"].split("reset=")[1]
    assert client.post(f"/admin/brands/{slug}/accounts/{uid}/state",
                       json={"active": False}, headers=admin["h"]
                       ).status_code == 200
    assert client.get(f"/brands/{slug}/team", headers=_h(tok)).status_code == 401
    assert client.post("/auth/reset/confirm", json={
        "token": open_reset, "password": "newpassword-77"}).status_code >= 400
    # 중지 계정엔 링크 발급 불가
    assert client.post(f"/admin/brands/{slug}/accounts/{uid}/reset-link",
                       headers=admin["h"]).status_code == 409
    # 재개 — 이전 JWT는 여전히 무효, 재로그인은 가능
    assert client.post(f"/admin/brands/{slug}/accounts/{uid}/state",
                       json={"active": True}, headers=admin["h"]
                       ).status_code == 200
    assert client.get(f"/brands/{slug}/team", headers=_h(tok)).status_code == 401
    relogin = client.post("/auth/login", json={
        "email": f"owner-{slug}@brand.example", "password": "brandpass-123"})
    assert relogin.status_code == 200
    tok2 = relogin.json()["token"]
    # 세션 철회 → 기존 JWT 즉시 차단
    assert client.post(
        f"/admin/brands/{slug}/accounts/{uid}/revoke-sessions",
        headers=admin["h"]).status_code == 200
    assert client.get(f"/brands/{slug}/team", headers=_h(tok2)).status_code == 401


def test_account_add_email_conflicts(client, admin):
    slug = "brand-" + admin["sfx"]
    _register(client, admin)
    # 같은 브랜드/타 브랜드/크리에이터/어드민 이메일 전부 409
    other = "other-" + admin["sfx"]
    _register(client, admin, slug=other, email=f"owner-{other}@brand.example")
    with connect() as c:
        c.execute("INSERT INTO users(kind,email) VALUES('creator',%s)",
                  (f"cr2-{admin['sfx']}@ex.invalid",))
    for taken in [f"owner-{slug}@brand.example",
                  f"owner-{other}@brand.example",
                  f"cr2-{admin['sfx']}@ex.invalid",
                  f"ops-{admin['sfx']}@example.invalid"]:
        r = client.post(f"/admin/brands/{slug}/accounts",
                        json={"email": taken}, headers=admin["h"])
        assert r.status_code == 409, (taken, r.text)
