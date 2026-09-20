"""멀티테넌시 — AUTH_REQUIRED=1에서 브랜드 간 데이터 격리를 전면 검증."""

import os

import psycopg
import pytest
from psycopg.rows import dict_row


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def two_brands(client):
    """AUTH 강제 전에 두 브랜드 계정을 만들어 둔다 (전환기 경로)."""
    toks = {}
    for email, brand in [("iso-a@ex.com", "glowlab"), ("iso-b@ex.com", "aura")]:
        inv = client.post("/auth/invite",
                          json={"email": email, "brand_id": brand}).json()
        t = inv["demoLink"].split("invite=")[1]
        toks[brand] = client.post("/auth/accept", json={
            "token": t, "password": "isolation-pw-1"}).json()["token"]
    return toks


def test_demo_brands_flagged(client):
    with psycopg.connect(os.environ["DATABASE_URL"],
                         row_factory=dict_row) as conn:
        rows = {r["brand_id"]: r["is_demo"] for r in
                conn.execute("SELECT brand_id, is_demo FROM brands")}
    assert rows["glowlab"] is True and rows["aura"] is True


def test_isolation_enforced(client, two_brands, monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    a, b = two_brands["glowlab"], two_brands["aura"]

    # 토큰 없이는 차단
    assert client.get("/brands/glowlab/senders").status_code == 401
    assert client.get("/brands/glowlab/gmail").status_code == 401
    assert client.get("/brands/glowlab/inbox").status_code == 401

    # 자기 브랜드는 통과
    assert client.get("/brands/glowlab/senders",
                      headers=_bearer(a)).status_code == 200
    assert client.get("/brands/aura/gmail",
                      headers=_bearer(b)).status_code == 200

    # 남의 브랜드는 403 — 읽기·쓰기 모두
    assert client.get("/brands/aura/senders",
                      headers=_bearer(a)).status_code == 403
    assert client.get("/brands/glowlab/inbox",
                      headers=_bearer(b)).status_code == 403
    assert client.post("/brands/glowlab/dispatch-batches", json={
        "product_ref": "x", "commission_pct": 10, "unit_cost": 1000,
        "capacity": 5, "deadline_days": 7,
    }, headers=_bearer(b)).status_code == 403
    assert client.post("/brands/aura/senders", json={"email": "a@b.co"},
                       headers=_bearer(a)).status_code == 403


def test_sender_id_ops_scoped(client, two_brands, monkeypatch):
    # glowlab 발신자 하나 등록해 두고 → aura 계정으로 접근 시 403
    monkeypatch.delenv("AUTH_REQUIRED", raising=False)
    a, b = two_brands["glowlab"], two_brands["aura"]
    r = client.post("/brands/glowlab/senders",
                    json={"email": "iso@glowlab.co"}, headers=_bearer(a))
    sid = r.json()["senderId"]
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    assert client.post(f"/senders/{sid}/verify", json={"code": "000000"},
                       headers=_bearer(b)).status_code == 403
    # 본인 브랜드는 (코드가 틀려도) 권한은 통과 → 400
    assert client.post(f"/senders/{sid}/verify", json={"code": "000000"},
                       headers=_bearer(a)).status_code == 400


def test_admin_sees_all(client, monkeypatch):
    # 어드민 JWT는 모든 브랜드 접근 가능 (2FA 통과 토큰)
    from api import auth as A
    with psycopg.connect(os.environ["DATABASE_URL"],
                         row_factory=dict_row) as conn:
        adm = conn.execute(
            "SELECT * FROM users WHERE kind='admin' LIMIT 1").fetchone()
    step1 = client.post("/auth/login", json={
        "email": adm["email"], "password": "supersecret123"}).json()
    tok = step1["token"]
    if step1.get("needOtp"):
        tok = client.post("/auth/otp/verify",
                          json={"code": A.totp_code(adm["totp_secret"])},
                          headers=_bearer(tok)).json()["token"]
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    assert client.get("/brands/glowlab/senders",
                      headers=_bearer(tok)).status_code == 200
    assert client.get("/brands/aura/senders",
                      headers=_bearer(tok)).status_code == 200


def test_legacy_boundary_allowlist(client, two_brands, monkeypatch):
    """AUTH_REQUIRED=1: 검사 구현된 정확한 경로만 비어드민 허용, 나머지 어드민 전용."""
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    # 크리에이터 토큰 준비 (AUTH 강제 전 경로로)
    monkeypatch.delenv("AUTH_REQUIRED")
    r = client.post("/auth/magic", json={"email": "boundary@ex.com"}).json()
    ctok = client.post("/auth/magic/verify", json={
        "token": r["demoLink"].split("magic=")[1]}).json()["token"]
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = {"Authorization": f"Bearer {ctok}"}

    # 허용 3경로: 핸들러 자체 검사로 통과
    assert client.post("/me/join", json={"brand_id": "glowlab"},
                       headers=ch).status_code == 200
    assert client.get("/me/memberships", headers=ch).status_code == 200
    assert client.post("/campaigns/cmp-1/apply", json={"creator_id": "x"},
                       headers=ch).status_code == 200

    # 검사 없는 경로는 크리에이터·브랜드 토큰으로도 차단 (관리자 전용 복구)
    btok = two_brands["glowlab"]
    bh = {"Authorization": f"Bearer {btok}"}
    for path, method, payload in [
        ("/me/c-mai/fields", "PUT", {"field": "address", "value": "x"}),
        ("/me/c-mai", "GET", None),
        ("/notifications?user=c-mai", "GET", None),
        ("/cells/cell-glowlab-th/messages", "GET", None),
        ("/campaigns", "GET", None),
    ]:
        for h in (ch, bh, {}):
            if method == "GET":
                resp = client.get(path, headers=h)
            else:
                resp = client.put(path, json=payload, headers=h)
            assert resp.status_code == 401, (path, h and "tok", resp.status_code)

    # 캠페인 지원은 운영 모드에서 크리에이터 JWT 없이(브랜드 토큰) 불가
    assert client.post("/campaigns/cmp-1/apply", json={"creator_id": "c-mai"},
                       headers=bh).status_code == 401
