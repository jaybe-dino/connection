"""실인증 — 부트스트랩→로그인→2FA→초대→매직링크→가드 전면 검증."""

from api import auth as A

ADMIN = {"email": "boss@dinostudio.kr", "password": "supersecret123"}


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def test_bootstrap_once(client):
    r = client.post("/auth/bootstrap", json=ADMIN)
    assert r.status_code == 200 and r.json()["user"]["kind"] == "admin"
    assert client.post("/auth/bootstrap", json=ADMIN).status_code == 409
    assert client.get("/auth/status").json()["hasAdmin"] is True


def test_login_and_me(client):
    bad = client.post("/auth/login", json={**ADMIN, "password": "nope"})
    assert bad.status_code == 401
    tok = client.post("/auth/login", json=ADMIN).json()["token"]
    me = client.get("/auth/me", headers=_bearer(tok)).json()
    assert me["email"] == ADMIN["email"]


def test_admin_jwt_on_admin_routes(client):
    tok = client.post("/auth/login", json=ADMIN).json()["token"]
    r = client.get("/admin/summary", headers=_bearer(tok))
    assert r.status_code == 200


def test_totp_2fa_flow(client):
    tok = client.post("/auth/login", json=ADMIN).json()["token"]
    setup = client.post("/auth/otp/setup", headers=_bearer(tok)).json()
    secret = setup["secret"]
    assert "otpauth://" in setup["otpauthUri"]
    # 잘못된 코드 → 활성화 실패
    assert client.post("/auth/otp/enable", json={"code": "000000"},
                       headers=_bearer(tok)).status_code == 401
    ok = client.post("/auth/otp/enable", json={"code": A.totp_code(secret)},
                     headers=_bearer(tok))
    assert ok.json()["totpEnabled"] is True

    # 이후 로그인은 2단계: pending 토큰은 어드민 라우트에서 거부
    step1 = client.post("/auth/login", json=ADMIN).json()
    assert step1["needOtp"] is True
    pend = step1["token"]
    assert client.get("/admin/summary",
                      headers=_bearer(pend)).status_code == 401
    full = client.post("/auth/otp/verify", json={"code": A.totp_code(secret)},
                       headers=_bearer(pend)).json()["token"]
    assert client.get("/admin/summary",
                      headers=_bearer(full)).status_code == 200


def test_brand_invite_accept_login(client):
    inv = client.post("/auth/invite", json={
        "email": "cmo@glowlab.co", "brand_id": "glowlab"}).json()
    token = inv["demoLink"].split("invite=")[1]
    acc = client.post("/auth/accept", json={
        "token": token, "password": "glowlab-pw-123"}).json()
    assert acc["user"]["brandId"] == "glowlab"
    # 같은 토큰 재사용 불가
    assert client.post("/auth/accept", json={
        "token": token, "password": "glowlab-pw-123"}).status_code == 400
    # 이메일+비밀번호 로그인
    tok = client.post("/auth/login", json={
        "email": "cmo@glowlab.co", "password": "glowlab-pw-123"}).json()["token"]

    # 브랜드 JWT로 자기 브랜드 지메일 연결 가능, 남의 브랜드는 403
    ok = client.post("/brands/glowlab/gmail/connect",
                     json={"email": "ceo@glowlab.co"}, headers=_bearer(tok))
    assert ok.status_code == 200
    other = client.post("/brands/aura/gmail/connect",
                        json={"email": "x@y.co"}, headers=_bearer(tok))
    assert other.status_code == 403


def test_creator_magic_link(client):
    r = client.post("/auth/magic", json={"email": "mai@example.com"}).json()
    token = r["demoLink"].split("magic=")[1]
    out = client.post("/auth/magic/verify", json={"token": token}).json()
    assert out["user"]["kind"] == "creator"
    # 재사용 불가
    assert client.post("/auth/magic/verify",
                       json={"token": token}).status_code == 400


def test_auth_required_blocks_legacy(client, monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    r = client.post("/brands/glowlab/gmail/connect", json={"email": "a@b.co"})
    assert r.status_code == 401              # 키·JWT 없이는 전면 차단
