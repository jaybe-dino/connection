"""매직링크 P0 — 링크는 크리에이터 앱 고정 origin으로만 발급된다.

실메일 링크가 소개 사이트(account.html)로 랜딩해 앱 로그인이 안 되던 문제의
서버측 회귀: APP_SITE 고정, brand는 slug 형식+실존 브랜드일 때만 보존
(open redirect 불가), invite/reset 링크는 기존 SITE 경로 유지.
"""

APP = "https://app.theprlist.net"


def _magic(client, email, brand=""):
    r = client.post("/auth/magic", json={"email": email, "brand": brand})
    assert r.status_code == 200
    return r.json()["demoLink"]


def test_magic_link_uses_fixed_creator_app_origin(client):
    link = _magic(client, "magic.origin@ex.com")
    assert link.startswith(f"{APP}/?magic=")


def test_magic_link_preserves_valid_existing_brand(client):
    link = _magic(client, "magic.brand@ex.com", brand="glowlab")
    assert link.startswith(f"{APP}/?brand=glowlab&magic=")
    # 보존된 링크의 토큰은 정상 소비(로그인)된다
    tok = link.split("magic=")[1]
    v = client.post("/auth/magic/verify", json={"token": tok})
    assert v.status_code == 200 and v.json()["user"]["kind"] == "creator"


def test_magic_link_drops_non_slug_brand(client):
    for bad in ["../evil.example", "https://evil.example", "a b", "ab",
                "UPPER..", "x" * 41]:
        link = _magic(client, "magic.badslug@ex.com", brand=bad)
        assert link.startswith(f"{APP}/?magic="), bad
        assert "brand=" not in link, bad


def test_magic_link_drops_nonexistent_brand(client):
    link = _magic(client, "magic.ghost@ex.com", brand="no-such-brand-xyz")
    assert link.startswith(f"{APP}/?magic=")
    assert "brand=" not in link


def test_invite_and_reset_links_keep_site_origin(client, monkeypatch):
    from api import routes_auth
    inv = client.post("/auth/invite", json={"email": "magic.inv@newbrand.com",
                                            "brand_id": "glowlab"})
    assert inv.status_code == 200
    assert inv.json()["demoLink"].startswith("https://theprlist.net/?invite=")
    tok = inv.json()["demoLink"].split("invite=")[1]
    acc = client.post("/auth/accept", json={"token": tok,
                                            "password": "old-password-123"})
    assert acc.status_code == 200
    sent = []
    monkeypatch.setattr(routes_auth, "_send_system_mail",
                        lambda to, sub, body: sent.append(body) or True)
    rr = client.post("/auth/reset/request",
                     json={"email": "magic.inv@newbrand.com"},
                     headers={"X-Forwarded-For": "10.9.9.9"})
    assert rr.status_code == 200 and "demoLink" not in rr.json()
    assert "https://theprlist.net/account.html?reset=" in sent[0]
