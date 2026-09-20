"""내부 커뮤니티(/community/*) — 멤버십 가드·원문 보존 번역·격리."""


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def _creator_token(client, email):
    r = client.post("/auth/magic", json={"email": email}).json()
    tok = r["demoLink"].split("magic=")[1]
    return client.post("/auth/magic/verify", json={"token": tok}).json()["token"]


def _brand_token(client, email, brand):
    inv = client.post("/auth/invite", json={"email": email,
                                            "brand_id": brand}).json()
    t = inv["demoLink"].split("invite=")[1]
    return client.post("/auth/accept", json={
        "token": t, "password": "community-pw-1"}).json()["token"]


def test_membership_gates_community(client, monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    monkeypatch.delenv("AUTH_REQUIRED")
    ctok = _creator_token(client, "comm.creator@ex.com")
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    ch = _bearer(ctok)

    # 무토큰 401, 멤버십 없는 크리에이터 403
    assert client.get("/community/cells/cell-glowlab-th/messages").status_code == 401
    assert client.get("/community/cells/cell-glowlab-th/messages",
                      headers=ch).status_code == 403

    # 가입 후 읽기·쓰기 가능 — 원문 보존 + 번역 동봉
    client.post("/me/join", json={"brand_id": "glowlab"}, headers=ch)
    assert client.get("/community/cells/cell-glowlab-th/messages",
                      headers=ch).status_code == 200
    p = client.post("/community/cells/cell-glowlab-th/messages", json={
        "text": "สวัสดีค่ะ 처음 인사드려요!", "locale": "th"}, headers=ch)
    assert p.status_code == 200
    msgs = client.get("/community/cells/cell-glowlab-th/messages",
                      headers=ch).json()
    mine = [m for m in msgs if m["original"] == "สวัสดีค่ะ 처음 인사드려요!"]
    assert mine and mine[0]["originalLocale"] == "th"
    assert set(mine[0]["translations"]) >= {"ko", "en", "vi"}  # 원문 언어 제외 번역
    # 크리에이터는 공지 채널 게시 불가
    assert client.post("/community/cells/cell-glowlab-th/messages", json={
        "text": "notice?", "channel": "notice"}, headers=ch).status_code == 403


def test_brand_scoped_cells(client, monkeypatch):
    atok = _brand_token(client, "comm-brand-a@ex.com", "glowlab")
    btok = _brand_token(client, "comm-brand-b@ex.com", "aura")
    monkeypatch.setenv("AUTH_REQUIRED", "1")
    # 브랜드는 자기 셀에 공지 게시 가능, 남의 셀 403
    ok = client.post("/community/cells/cell-glowlab-th/messages", json={
        "text": "9월 캠페인 공지입니다", "channel": "notice"},
        headers=_bearer(atok))
    assert ok.status_code == 200
    assert client.get("/community/cells/cell-glowlab-th/messages",
                      headers=_bearer(btok)).status_code == 403
    # my-cells는 자기 브랜드 것만
    cells = client.get("/community/my-cells", headers=_bearer(btok)).json()
    assert cells and all(c["brandId"] == "aura" for c in cells)
