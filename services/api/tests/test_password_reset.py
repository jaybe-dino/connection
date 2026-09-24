"""비밀번호 재설정(브랜드·관리자) — 비노출·레이트리밋·토큰 안전성·세션 폐기.

메일은 전부 모사(monkeypatch)로 검증한다 — 실제 발송 없음.
"""

import json
import os
import threading

import psycopg
from psycopg.rows import dict_row

from api import auth as auth_mod


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def _db():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def _capture_mail(monkeypatch, ok=True):
    """routes_auth._send_system_mail 모사 — 보낸 메일을 기록하고 ok를 반환."""
    from api import routes_auth
    sent = []

    def fake(to, subject, body):
        sent.append({"to": to, "subject": subject, "body": body})
        return ok
    monkeypatch.setattr(routes_auth, "_send_system_mail", fake)
    return sent


def _token_from(mail):
    return mail["body"].split("?reset=")[1].split("\n")[0].strip()


def _brand_user(client, email, brand):
    inv = client.post("/auth/invite", json={"email": email,
                                            "brand_id": brand}).json()
    tok = inv["demoLink"].split("invite=")[1]
    return client.post("/auth/accept", json={
        "token": tok, "password": "old-password-123"}).json()


def _make_admin(email, password="admin-pass-1234", totp=False):
    secret = auth_mod.totp_new_secret() if totp else None
    with _db() as conn:
        conn.execute(
            "INSERT INTO users (kind, email, password_hash, totp_secret,"
            " totp_enabled) VALUES ('admin', %s, %s, %s, %s)"
            " ON CONFLICT (email) DO NOTHING",
            (email, auth_mod.hash_password(password), secret, totp))
        conn.commit()
    return secret


def _req(client, email, ip):
    from fastapi.testclient import TestClient
    return TestClient(client.app, client=(ip, 50000)).post(
        "/auth/reset/request", json={"email": email})


def test_request_does_not_reveal_accounts(client, monkeypatch):
    """존재하지 않는 이메일·크리에이터·비활성 계정 모두 같은 응답이며
    메일은 발송되지 않는다. 응답 어디에도 토큰·링크가 없다."""
    sent = _capture_mail(monkeypatch)
    # 크리에이터(매직링크 대상) 준비
    client.post("/auth/magic", json={"email": "reset.creator@ex.com"})
    # 비활성 브랜드 계정 준비
    _brand_user(client, "reset.disabled@ex.com", "glowlab")
    with _db() as conn:
        conn.execute("UPDATE users SET state='disabled'"
                     " WHERE email='reset.disabled@ex.com'")
        conn.commit()

    bodies = []
    for email in ("no-such-user@ex.com", "reset.creator@ex.com",
                  "reset.disabled@ex.com"):
        r = _req(client, email, "10.9.0.1")
        assert r.status_code == 200
        bodies.append(r.json())
        assert "reset=" not in json.dumps(r.json())
        assert "demoLink" not in r.json() and "sent" not in r.json()
    assert bodies[0] == bodies[1] == bodies[2]      # 완전히 동일한 응답
    assert sent == []                               # 발송 0회


def test_reset_flow_preserves_account_and_revokes_sessions(client, monkeypatch):
    """정상 흐름: 메일 링크의 토큰으로만 재설정 — kind/brand_id 보존,
    기존 세션 폐기, 자동 세션 발급 없음, 옛/새 비밀번호 로그인 검증."""
    sent = _capture_mail(monkeypatch)
    u = _brand_user(client, "reset.brand@ex.com", "glowlab")
    old_jwt = u["token"]
    assert client.get("/auth/me", headers=_bearer(old_jwt)).status_code == 200

    r = _req(client, "reset.brand@ex.com", "10.9.0.2")
    assert r.status_code == 200 and len(sent) == 1
    assert '/account.html?reset=' in sent[0]['body']
    assert "reset=" not in json.dumps(r.json())     # 응답에 토큰 없음
    token = _token_from(sent[0])
    with _db() as conn:                              # DB에는 원문 미저장(해시만)
        n = conn.execute("SELECT count(*) n FROM auth_tokens"
                         " WHERE token_hash=%s", (token,)).fetchone()["n"]
        k = conn.execute("SELECT kind FROM auth_tokens ORDER BY created_at"
                         " DESC LIMIT 1").fetchone()["kind"]
    assert n == 0 and k == "reset"                   # 전용 목적 토큰

    c = client.post("/auth/reset/confirm",
                    json={"token": token, "password": "new-password-456"})
    assert c.status_code == 200
    assert "token" not in c.json()                   # 자동 세션 발급 없음
    assert c.json()["kind"] == "brand"

    # 기존 세션 폐기
    assert client.get("/auth/me", headers=_bearer(old_jwt)).status_code == 401
    # 옛 비밀번호 거부, 새 비밀번호 정상 로그인 + 계정 데이터 보존
    assert client.post("/auth/login", json={
        "email": "reset.brand@ex.com",
        "password": "old-password-123"}).status_code == 401
    login = client.post("/auth/login", json={
        "email": "reset.brand@ex.com", "password": "new-password-456"})
    assert login.status_code == 200
    assert login.json()["user"]["kind"] == "brand"
    assert login.json()["user"]["brandId"] == "glowlab"
    # 재사용 거부
    assert client.post("/auth/reset/confirm", json={
        "token": token, "password": "another-pass-789"}).status_code == 400


def test_admin_reset_keeps_otp_gate(client, monkeypatch):
    """관리자 재설정 후에도 2FA는 그대로 — confirm이 OTP를 우회하는 세션을
    만들지 않고, 로그인은 needOtp를 거친다."""
    sent = _capture_mail(monkeypatch)
    secret = _make_admin("reset.admin@ex.com", totp=True)
    _req(client, "reset.admin@ex.com", "10.9.0.3")
    token = _token_from(sent[-1])
    c = client.post("/auth/reset/confirm",
                    json={"token": token, "password": "new-admin-pass-77"})
    assert c.status_code == 200 and "token" not in c.json()
    with _db() as conn:                              # OTP 설정 불변
        row = conn.execute("SELECT kind, totp_enabled FROM users"
                           " WHERE email='reset.admin@ex.com'").fetchone()
    assert row == {"kind": "admin", "totp_enabled": True}
    login = client.post("/auth/login", json={
        "email": "reset.admin@ex.com", "password": "new-admin-pass-77"}).json()
    assert login.get("needOtp") is True              # OTP 관문 유지
    assert client.post('/auth/otp/setup', headers=_bearer(login['token'])).status_code == 401
    assert client.post('/auth/otp/enable', json={'code':auth_mod.totp_code(secret)},
                       headers=_bearer(login['token'])).status_code == 401
    otp = client.post("/auth/otp/verify",
                      json={"code": auth_mod.totp_code(secret)},
                      headers=_bearer(login["token"]))
    assert otp.status_code == 200


def test_token_purpose_expiry_and_concurrency(client, monkeypatch):
    """다른 목적 토큰 거부(invite/magic↔reset 양방향)·만료 거부·
    동시 소비는 정확히 1회만 성공."""
    sent = _capture_mail(monkeypatch)
    _brand_user(client, "reset.mix@ex.com", "glowlab")

    # invite 토큰으로 reset/confirm 불가
    inv = client.post("/auth/invite", json={
        "email": "reset.mix@ex.com", "brand_id": "glowlab"}).json()
    invite_tok = inv["demoLink"].split("invite=")[1]
    assert client.post("/auth/reset/confirm", json={
        "token": invite_tok, "password": "x" * 12}).status_code == 400
    # magic 토큰으로도 불가
    magic = client.post("/auth/magic",
                        json={"email": "reset.magic@ex.com"}).json()
    magic_tok = magic["demoLink"].split("magic=")[1]
    assert client.post("/auth/reset/confirm", json={
        "token": magic_tok, "password": "x" * 12}).status_code == 400

    # reset 토큰으로 invite accept 불가 (역방향)
    _req(client, "reset.mix@ex.com", "10.9.0.4")
    reset_tok = _token_from(sent[-1])
    assert client.post("/auth/accept", json={
        "token": reset_tok, "password": "x" * 12}).status_code == 400

    # 만료 거부
    _req(client, "reset.mix@ex.com", "10.9.0.4")
    expired = _token_from(sent[-1])
    import hashlib
    with _db() as conn:
        conn.execute("UPDATE auth_tokens SET expires_at=now()-interval '1 min'"
                     " WHERE token_hash=%s",
                     (hashlib.sha256(expired.encode()).hexdigest(),))
        conn.commit()
    assert client.post("/auth/reset/confirm", json={
        "token": expired, "password": "x" * 12}).status_code == 400

    # 동시 소비 — 두 스레드 중 정확히 1회만 성공
    _req(client, "reset.mix@ex.com", "10.9.0.4")
    race_tok = _token_from(sent[-1])
    codes = []
    def hit():
        codes.append(client.post("/auth/reset/confirm", json={
            "token": race_tok, "password": "race-pass-1234"}).status_code)
    ts = [threading.Thread(target=hit) for _ in range(2)]
    for t in ts:
        t.start()
    for t in ts:
        t.join(10)
    assert sorted(codes) == [200, 400]


def test_rate_limits(client, monkeypatch):
    """이메일당 15분 3회 초과 시 발송 중단(응답은 동일), IP당 10회 초과 429."""
    sent = _capture_mail(monkeypatch)
    _brand_user(client, "reset.limit@ex.com", "glowlab")
    for _ in range(5):
        r = _req(client, "reset.limit@ex.com", "10.9.0.5")
        assert r.status_code == 200                  # 응답은 항상 동일
    assert len(sent) == 3                            # 발송은 3회에서 멈춤

    for i in range(10):
        assert _req(client, f"who-{i}@ex.com", "10.9.0.66").status_code == 200
    assert _req(client, "who-x@ex.com", "10.9.0.66").status_code == 429


def test_mail_failure_not_reported_as_success(client, monkeypatch):
    """발송 실패여도 응답은 동일(성공 위장 없음·demoLink 없음)하고,
    실패 사실은 원장에 남는다."""
    _capture_mail(monkeypatch, ok=False)
    _brand_user(client, "reset.fail@ex.com", "glowlab")
    r = _req(client, "reset.fail@ex.com", "10.9.0.7")
    assert r.status_code == 200
    assert '보냈' not in r.json()['message']
    assert "demoLink" not in r.json() and "reset=" not in json.dumps(r.json())
    with _db() as conn:
        n = conn.execute(
            "SELECT count(*) n FROM ledger WHERE event_type='PASSWORD_RESET_MAIL_FAILED'"
        ).fetchone()["n"]
    assert n >= 1


def test_invite_hardening_regression(client, monkeypatch):
    """검수 반영: 초대는 브랜드 계정 전용 — 관리자 이메일 초대 409,
    타 브랜드 연결 이메일 409, otp=pending 어드민 토큰 401,
    관리자에 발급된 invite 토큰의 accept 400. 정상 브랜드 재초대는 유지."""
    _make_admin("reset.admin2@ex.com")
    # 관리자 이메일로 초대 발급 시도 → 409
    r = client.post("/auth/invite", json={
        "email": "reset.admin2@ex.com", "brand_id": "glowlab"})
    assert r.status_code == 409
    # 기존 브랜드 계정을 다른 브랜드로 초대 → 409
    _brand_user(client, "reset.owned@ex.com", "glowlab")
    assert client.post("/auth/invite", json={
        "email": "reset.owned@ex.com", "brand_id": "aura"}).status_code == 409
    # 같은 브랜드 재초대(정상 재설정 경로)는 유지
    assert client.post("/auth/invite", json={
        "email": "reset.owned@ex.com", "brand_id": "glowlab"}).status_code == 200
    # otp=pending 어드민 토큰으로 초대 불가 (AUTH_REQUIRED에서)
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    with _db() as conn:
        admin_row = conn.execute("SELECT * FROM users WHERE email="
                                 "'reset.admin2@ex.com'").fetchone()
    pending = auth_mod.issue_jwt({"sub": str(admin_row["user_id"]),
                                  "kind": "admin", "brand_id": None,
                                  "creator_id": None, "otp": "pending"})
    assert client.post("/auth/invite", json={
        "email": "brandnew@ex.com", "brand_id": "glowlab"},
        headers=_bearer(pending)).status_code == 401
    monkeypatch.delenv("AUTH_REQUIRED")
    # 어떤 경로로든 관리자에 발급된 invite 토큰은 accept가 거부한다
    with _db() as conn:
        raw = auth_mod.one_time_token(conn, admin_row["user_id"], "invite", 30)
        conn.commit()
    assert client.post("/auth/accept", json={
        "token": raw, "password": "x" * 12}).status_code == 400


def test_session_validation_fails_closed_in_production(monkeypatch):
    import uuid
    import pytest
    from fastapi import HTTPException
    monkeypatch.setenv('AUTH_REQUIRED', '1')
    def unavailable():
        raise RuntimeError('database unavailable')
    monkeypatch.setattr(auth_mod, 'connect', unavailable)
    jwt = auth_mod.issue_jwt({'sub':str(uuid.uuid4()), 'kind':'admin'})
    with pytest.raises(HTTPException) as error:
        auth_mod.current_user('Bearer '+jwt)
    assert error.value.status_code == 503


def test_forged_forwarding_header_cannot_evade_reset_limit(client, monkeypatch):
    from fastapi.testclient import TestClient
    _capture_mail(monkeypatch)
    peer = TestClient(client.app, client=('10.9.88.1', 50000))
    for i in range(10):
        assert peer.post('/auth/reset/request', json={'email':f'unknown-{i}@ex.com'},
                         headers={'X-Forwarded-For':f'1.2.3.{i}'}).status_code == 200
    assert peer.post('/auth/reset/request', json={'email':'unknown-more@ex.com'},
                     headers={'X-Forwarded-For':'2.2.2.2'}).status_code == 429


def test_concurrent_requests_respect_email_limit(client, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from api import routes_auth
    sent = _capture_mail(monkeypatch)
    _brand_user(client, 'reset.concurrent@ex.com', 'glowlab')
    monkeypatch.setattr(routes_auth, 'RESET_EMAIL_LIMIT', 1)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda i:_req(client,'reset.concurrent@ex.com',f'10.9.89.{i}'),range(4)))
    assert all(r.status_code == 200 for r in results)
    assert len(sent) == 1
