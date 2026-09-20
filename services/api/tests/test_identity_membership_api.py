"""브랜드 로고 격리 + 크리에이터 가입→검증→5,000원 과금 사슬 전면 검증."""

import os

import psycopg
from psycopg.rows import dict_row


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def _brand_token(client, email, brand):
    inv = client.post("/auth/invite", json={"email": email,
                                            "brand_id": brand}).json()
    tok = inv["demoLink"].split("invite=")[1]
    return client.post("/auth/accept", json={
        "token": tok, "password": "identity-pw-1"}).json()["token"]


def _creator_token(client, email):
    r = client.post("/auth/magic", json={"email": email}).json()
    tok = r["demoLink"].split("magic=")[1]
    return client.post("/auth/magic/verify", json={"token": tok}).json()["token"]


def _db():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


# ── 브랜드 아이덴티티(로고) ─────────────────────────────────────

def test_identity_set_and_isolation(client, monkeypatch):
    a = _brand_token(client, "logo-a@ex.com", "glowlab")
    b = _brand_token(client, "logo-b@ex.com", "aura")

    r = client.put("/brands/glowlab/identity", json={
        "logo_url": "https://cdn.example.com/glowlab.png",
        "tagline": "민감성 선케어"}, headers=_bearer(a))
    assert r.status_code == 200 and r.json()["logoUrl"].endswith("glowlab.png")

    # 형식 검증: http(비보안)·잡문자열 거부, data:image 허용
    bad = client.put("/brands/glowlab/identity",
                     json={"logo_url": "javascript:alert(1)"}, headers=_bearer(a))
    assert bad.status_code == 400
    ok = client.put("/brands/aura/identity", json={
        "logo_url": "data:image/png;base64,iVBORw0KGgo="}, headers=_bearer(b))
    assert ok.status_code == 200

    # 격리: 남의 브랜드 로고 수정 403 (AUTH_REQUIRED에서)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    assert client.put("/brands/aura/identity", json={"logo_url": ""},
                      headers=_bearer(a)).status_code == 403
    monkeypatch.delenv("AUTH_REQUIRED")

    # 공개 조회는 브랜드별로 자기 로고만
    g = client.get("/brands/glowlab/identity").json()
    au = client.get("/brands/aura/identity").json()
    assert g["logoUrl"].endswith("glowlab.png")
    assert au["logoUrl"].startswith("data:image/png")
    assert g["logoUrl"] != au["logoUrl"]


# ── 가입→검증→과금 사슬 ────────────────────────────────────────

def test_join_verify_bill_chain(client):
    with _db() as conn:
        conn.execute("INSERT INTO brands (brand_id, name, category, locale,"
                     " plan, is_demo) VALUES ('realco','REALCO','뷰티','ko',"
                     "'per_signup',false) ON CONFLICT DO NOTHING")
        conn.execute("INSERT INTO brands (brand_id, name, category, locale,"
                     " plan, is_demo) VALUES ('realco2','REALCO2','뷰티','ko',"
                     "'per_signup',false) ON CONFLICT DO NOTHING")
        conn.commit()
    tok = _creator_token(client, "joy.creator@ex.com")

    # ① 가입 — 미검증이므로 아직 과금 없음
    j = client.post("/me/join", json={"brand_id": "realco"},
                    headers=_bearer(tok)).json()
    cid = j["creatorId"]
    assert j["joined"] and not j["verified"] and not j["billable"]

    with _db() as conn:
        n = conn.execute("SELECT count(*) c FROM signup_usage WHERE"
                         " creator_id=%s", (cid,)).fetchone()["c"]
    assert n == 0

    # ② 어드민 검증 → 트리거가 5,000원 사용량 기록
    v = client.post(f"/admin/creators/{cid}/verify",
                    headers={"X-Admin-Id": "jay"}).json()
    assert v["verified"] and v["billed"] == [
        {"brandId": "realco", "unitPrice": 5000}]

    # ③ 같은 브랜드 재가입 → 무과금(사용량 1건 유지)
    j2 = client.post("/me/join", json={"brand_id": "realco"},
                     headers=_bearer(tok)).json()
    assert j2["alreadyMember"] and j2["billable"]
    with _db() as conn:
        rows = conn.execute("SELECT brand_id, unit_price FROM signup_usage"
                            " WHERE creator_id=%s ORDER BY brand_id",
                            (cid,)).fetchall()
    assert rows == [{"brand_id": "realco", "unit_price": 5000}]

    # ④ 다른 브랜드 가입(검증 완료 상태) → 즉시 5,000원 1건 추가
    j3 = client.post("/me/join", json={"brand_id": "realco2"},
                     headers=_bearer(tok)).json()
    assert j3["joined"]
    with _db() as conn:
        rows = conn.execute("SELECT brand_id, unit_price FROM signup_usage"
                            " WHERE creator_id=%s ORDER BY brand_id",
                            (cid,)).fetchall()
    assert rows == [{"brand_id": "realco", "unit_price": 5000},
                    {"brand_id": "realco2", "unit_price": 5000}]

    # ⑤ 데모 브랜드 가입은 과금 대상 아님
    client.post("/me/join", json={"brand_id": "glowlab"}, headers=_bearer(tok))
    with _db() as conn:
        n = conn.execute("SELECT count(*) c FROM signup_usage WHERE"
                         " creator_id=%s AND brand_id='glowlab'",
                         (cid,)).fetchone()["c"]
    assert n == 0

    # ⑥ 월 청구 요약에 반영 (realco 브랜드 시점)
    btok = _brand_token(client, "owner@realco.co", "realco")
    s = client.get("/brands/realco/billing", headers=_bearer(btok)).json()
    assert s["unitPrice"] == 5000 and s["quantity"] >= 1


def test_campaign_apply_uses_jwt_creator(client):
    tok = _creator_token(client, "apply.creator@ex.com")
    r = client.post("/campaigns/cmp-1/apply",
                    json={"creator_id": "c-mai"}, headers=_bearer(tok)).json()
    assert r["creatorId"] != "c-mai"          # 데모 ID가 아닌 본인 계정으로
    with _db() as conn:
        row = conn.execute(
            "SELECT 1 FROM campaign_applications WHERE campaign_id='cmp-1'"
            " AND creator_id=%s", (r["creatorId"],)).fetchone()
    assert row


def test_memberships_listing_shows_brand_identity(client):
    tok = _creator_token(client, "joy.creator@ex.com")
    ms = client.get("/me/memberships", headers=_bearer(tok)).json()
    ids = {m["brandId"] for m in ms}
    assert {"realco", "realco2", "glowlab"} <= ids
    glow = next(m for m in ms if m["brandId"] == "glowlab")
    assert glow["logoUrl"].endswith("glowlab.png")   # 아이덴티티 조인 표시
