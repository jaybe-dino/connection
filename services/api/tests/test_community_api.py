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


ADMIN = {"X-Admin-Id": "jay"}


def _approved_brand(client, slug, name, email):
    """신청 → 승인 → 초대 수락까지 마친 새 브랜드의 JWT를 돌려준다."""
    r = client.post("/applications", json={
        "slug": slug, "name": name, "biz_no": "123-45-67890",
        "category": "스킨케어", "countries": ["TH"], "contact": email})
    assert r.status_code == 200, r.text
    apps = client.get("/admin/applications", headers=ADMIN).json()
    app_id = next(a["appId"] for a in apps if a["slug"] == slug)
    ap = client.post(f"/admin/applications/{app_id}/approve",
                     headers=ADMIN).json()
    tok = ap["inviteLink"].split("invite=")[1]
    return client.post("/auth/accept", json={
        "token": tok, "password": "approved-brand-pw-1"}).json()["token"]


def test_new_brand_default_cell_and_isolation(client, monkeypatch):
    """검수 지적 1: 신규 브랜드 승인 즉시 기본 셀이 생기고, 두 신규 브랜드의
    커뮤니티는 서로 격리돼야 한다."""
    t1 = _approved_brand(client, "commnew1", "커뮤뉴원", "own1@commnew1.kr")
    t2 = _approved_brand(client, "commnew2", "커뮤뉴투", "own2@commnew2.kr")
    monkeypatch.setenv("AUTH_REQUIRED", "1")

    # 승인 직후 my-cells가 비지 않는다 — 기본 라운지 자동 생성
    c1 = client.get("/community/my-cells", headers=_bearer(t1)).json()
    assert [c["cellId"] for c in c1] == ["cell-commnew1-main"]
    assert c1[0]["name"] == "커뮤뉴원 라운지"
    c2 = client.get("/community/my-cells", headers=_bearer(t2)).json()
    assert [c["cellId"] for c in c2] == ["cell-commnew2-main"]

    # 브랜드 간 격리: 서로의 기본 셀 접근 403
    assert client.get("/community/cells/cell-commnew2-main/messages",
                      headers=_bearer(t1)).status_code == 403
    assert client.post("/community/cells/cell-commnew1-main/messages",
                       json={"text": "invade"},
                       headers=_bearer(t2)).status_code == 403

    # 새 크리에이터: 합류한 브랜드 셀만 보이고 글도 그 셀에만 써진다
    ctok = _creator_token(client, "comm.new.creator@ex.com")
    ch = _bearer(ctok)
    client.post("/me/join", json={"brand_id": "commnew1"}, headers=ch)
    mine = client.get("/community/my-cells", headers=ch).json()
    assert [c["cellId"] for c in mine] == ["cell-commnew1-main"]
    assert client.post("/community/cells/cell-commnew1-main/messages",
                       json={"text": "첫 인사!"}, headers=ch).status_code == 200
    assert client.get("/community/cells/cell-commnew2-main/messages",
                      headers=ch).status_code == 403


def test_translate_failure_preserves_original(client, monkeypatch):
    """검수 지적 2: ai.translate 장애(TimeoutError)에도 원문은 저장되고,
    러너 재시도가 성공하면 done으로 회복된다. 외부 호출 없음."""
    from api import ai as ai_mod
    from api import routes_community as comm

    ctok = _creator_token(client, "comm.timeout@ex.com")
    ch = _bearer(ctok)
    client.post("/me/join", json={"brand_id": "glowlab"}, headers=ch)

    def _boom(text, src, targets):
        raise TimeoutError("simulated translation outage")
    monkeypatch.setattr(ai_mod, "translate", _boom)
    p = client.post("/community/cells/cell-glowlab-th/messages", json={
        "text": "장애 중에도 남아야 하는 원문", "locale": "ko"}, headers=ch)
    assert p.status_code == 200
    assert p.json()["translationState"] == "pending"

    msgs = client.get("/community/cells/cell-glowlab-th/messages",
                      headers=ch).json()
    mine = [m for m in msgs if m["original"] == "장애 중에도 남아야 하는 원문"]
    assert mine and mine[0]["translationState"] == "pending"
    assert mine[0]["translations"] == {}          # 가짜 번역을 만들지 않는다

    # 장애 해제 → 러너 틱이 재시도해 done으로 회복
    monkeypatch.undo()
    r = comm.retry_pending_translations()
    assert r["done"] >= 1
    msgs = client.get("/community/cells/cell-glowlab-th/messages",
                      headers=ch).json()
    mine = [m for m in msgs if m["original"] == "장애 중에도 남아야 하는 원문"]
    assert mine[0]["translationState"] == "done"
    assert set(mine[0]["translations"]) >= {"th", "en", "vi"}


def test_translation_retry_gives_up_after_max(client, monkeypatch):
    """재시도 한도(5회) 초과 시 failed로 확정 — 원문은 계속 보존, 중복 없음."""
    from api import ai as ai_mod
    from api import routes_community as comm

    ctok = _creator_token(client, "comm.failed@ex.com")
    ch = _bearer(ctok)
    client.post("/me/join", json={"brand_id": "glowlab"}, headers=ch)

    calls = {"n": 0}
    def _always_boom(text, src, targets):
        calls["n"] += 1
        raise TimeoutError("persistent outage")
    monkeypatch.setattr(ai_mod, "translate", _always_boom)
    client.post("/community/cells/cell-glowlab-th/messages", json={
        "text": "영구 장애 원문", "locale": "ko"}, headers=ch)   # attempts=1
    for _ in range(4):                                          # 2~5회
        comm.retry_pending_translations()
    msgs = client.get("/community/cells/cell-glowlab-th/messages",
                      headers=ch).json()
    mine = [m for m in msgs if m["original"] == "영구 장애 원문"]
    assert len(mine) == 1                          # 중복 저장 없음
    assert mine[0]["translationState"] == "failed"
    # failed 확정 후에는 더 시도하지 않는다
    before = calls["n"]
    comm.retry_pending_translations()
    assert calls["n"] == before


def test_dm_private_between_creator_and_brand(client, monkeypatch):
    """담당자 1:1 DM — 같은 브랜드의 다른 멤버도 남의 DM은 못 본다."""
    atok = _creator_token(client, "dm.alice@ex.com")
    btok = _creator_token(client, "dm.bob@ex.com")
    for t in (atok, btok):
        client.post("/me/join", json={"brand_id": "glowlab"},
                    headers=_bearer(t))
    brand = _brand_token(client, "dm-brand@ex.com", "glowlab")
    monkeypatch.setenv("AUTH_REQUIRED", "1")

    dm = client.post("/community/dm/glowlab", headers=_bearer(atok)).json()
    cell = dm["cellId"]
    assert client.post(f"/community/cells/{cell}/messages",
                       json={"text": "샘플 배송 문의드립니다"},
                       headers=_bearer(atok)).status_code == 200
    # 브랜드 담당자는 읽고 답할 수 있다
    assert client.get(f"/community/cells/{cell}/messages",
                      headers=_bearer(brand)).status_code == 200
    assert client.post(f"/community/cells/{cell}/messages",
                       json={"text": "내일 발송 예정입니다"},
                       headers=_bearer(brand)).status_code == 200
    # 같은 브랜드의 다른 크리에이터는 403 + 목록에도 안 보인다
    assert client.get(f"/community/cells/{cell}/messages",
                      headers=_bearer(btok)).status_code == 403
    bob_cells = [c["cellId"] for c in client.get(
        "/community/my-cells", headers=_bearer(btok)).json()]
    assert cell not in bob_cells
    # 브랜드 DM 목록에는 잡힌다
    dms = client.get("/community/dm", headers=_bearer(brand)).json()
    assert any(d["cellId"] == cell for d in dms)


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
