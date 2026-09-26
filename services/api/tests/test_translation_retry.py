"""번역 수동 재시도 — 크레딧 소진 등으로 failed 확정된 메시지의 재큐.

권한(브랜드 자기 셀·운영만), 중복 클릭 원자성, 원문 보존, 상태 전이,
러너 이어받기 회귀. 외부 호출 없음(ai.translate 전부 모사).
"""

import json
import os

import psycopg
from psycopg.rows import dict_row

from api import routes_community as rc


def _db():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def _brand_token(client, email, brand):
    inv = client.post("/auth/invite", json={"email": email,
                                            "brand_id": brand}).json()
    t = inv["demoLink"].split("invite=")[1]
    return client.post("/auth/accept", json={
        "token": t, "password": "retry-pw-123456"}).json()["token"]


def _seed_failed(cell="cell-glowlab-th", original="สวัสดี ทดสอบ",
                 locale="th", partial=None):
    with _db() as conn:
        m = conn.execute(
            "INSERT INTO cell_messages (cell_id, channel, author, author_kind,"
            " original, original_locale, translations, translation_state,"
            " translation_attempts)"
            " VALUES (%s,'chat','tester','creator',%s,%s,%s,'failed',5)"
            " RETURNING msg_id",
            (cell, original, locale,
             json.dumps(partial or {}, ensure_ascii=False))).fetchone()
        conn.commit()
    return str(m["msg_id"])


def _state(msg_id):
    with _db() as conn:
        return conn.execute(
            "SELECT original, translations, translation_state,"
            " translation_attempts FROM cell_messages WHERE msg_id=%s",
            (msg_id,)).fetchone()


def test_brand_retry_success_and_original_preserved(client, monkeypatch):
    monkeypatch.setattr(rc.ai, "translate",
                        lambda text, src, targets:
                        {t: f"re-{t}: {text}" for t in targets if t != src})
    tok = _brand_token(client, "retry.owner@glowlab.co", "glowlab")
    mid = _seed_failed(partial={"en": "old partial"})
    r = client.post(f"/community/cells/cell-glowlab-th/messages/{mid}"
                    "/translation-retry", headers=_bearer(tok))
    assert r.status_code == 200
    assert r.json()["translationState"] == "done"
    row = _state(mid)
    assert row["original"] == "สวัสดี ทดสอบ"          # 원문 불변
    assert row["translation_state"] == "done"
    assert row["translations"]["ko"].startswith("re-ko:")


def test_other_brand_and_creator_forbidden(client, monkeypatch):
    monkeypatch.setattr(rc.ai, "translate", lambda *a: {})
    mid = _seed_failed()
    other = _brand_token(client, "retry.other@aura.co", "aura")
    r = client.post(f"/community/cells/cell-glowlab-th/messages/{mid}"
                    "/translation-retry", headers=_bearer(other))
    assert r.status_code == 403                       # 타 브랜드 차단
    # 멤버 크리에이터도 재시도 불가(읽기만)
    m = client.post("/auth/magic", json={"email": "retry.cr@ex.com"}).json()
    ct = client.post("/auth/magic/verify", json={
        "token": m["demoLink"].split("magic=")[1]}).json()["token"]
    client.post("/me/join", json={"brand_id": "glowlab"}, headers=_bearer(ct))
    r2 = client.post(f"/community/cells/cell-glowlab-th/messages/{mid}"
                     "/translation-retry", headers=_bearer(ct))
    assert r2.status_code == 403
    assert _state(mid)["translation_state"] == "failed"   # 상태 불변


def test_done_and_pending_conflict(client, monkeypatch):
    monkeypatch.setattr(rc.ai, "translate", lambda *a: {})
    tok = _brand_token(client, "retry.state@glowlab.co", "glowlab")
    mid = _seed_failed()
    with _db() as conn:
        conn.execute("UPDATE cell_messages SET translation_state='done'"
                     " WHERE msg_id=%s", (mid,))
        conn.commit()
    assert client.post(f"/community/cells/cell-glowlab-th/messages/{mid}"
                       "/translation-retry",
                       headers=_bearer(tok)).status_code == 409
    with _db() as conn:
        conn.execute("UPDATE cell_messages SET translation_state='pending'"
                     " WHERE msg_id=%s", (mid,))
        conn.commit()
    assert client.post(f"/community/cells/cell-glowlab-th/messages/{mid}"
                       "/translation-retry",
                       headers=_bearer(tok)).status_code == 409
    # 정리 — 다른 테스트의 러너 재시도에 흘러가지 않게
    with _db() as conn:
        conn.execute("UPDATE cell_messages SET translation_state='done'"
                     " WHERE msg_id=%s", (mid,))
        conn.commit()


def test_retry_failure_requeues_for_runner(client, monkeypatch):
    """즉시 시도가 또 실패해도(크레딧 여전히 부족 등) 원문·부분 번역은
    보존되고 pending으로 남아 러너가 새 한도(5회)로 이어받는다."""
    def boom(*a):
        raise RuntimeError("credit balance is too low")
    monkeypatch.setattr(rc.ai, "translate", boom)
    tok = _brand_token(client, "retry.fail@glowlab.co", "glowlab")
    mid = _seed_failed(partial={"en": "partial kept"})
    r = client.post(f"/community/cells/cell-glowlab-th/messages/{mid}"
                    "/translation-retry", headers=_bearer(tok))
    assert r.status_code == 200
    assert r.json()["translationState"] == "pending"
    assert "hint" in r.json()                          # 실패 안내 동봉
    row = _state(mid)
    assert row["original"] == "สวัสดี ทดสอบ"
    assert row["translations"] == {"en": "partial kept"}
    assert row["translation_state"] == "pending"
    assert row["translation_attempts"] == 1            # 한도 리셋
    # 이제 러너가 성공적으로 이어받는다
    monkeypatch.setattr(rc.ai, "translate",
                        lambda text, src, targets:
                        {t: f"rn-{t}: {text}" for t in targets if t != src})
    rc.retry_pending_translations(limit=50)
    assert _state(mid)["translation_state"] == "done"


def test_duplicate_click_single_requeue(client, monkeypatch):
    """중복 클릭: 첫 요청이 failed→pending을 원자적으로 집으면 두 번째는
    409 — 같은 메시지가 이중으로 재큐·이중 시도되지 않는다."""
    def boom(*a):
        raise RuntimeError("still no credit")
    monkeypatch.setattr(rc.ai, "translate", boom)
    tok = _brand_token(client, "retry.dup@glowlab.co", "glowlab")
    mid = _seed_failed()
    first = client.post(f"/community/cells/cell-glowlab-th/messages/{mid}"
                        "/translation-retry", headers=_bearer(tok))
    assert first.status_code == 200                    # pending으로 재큐됨
    second = client.post(f"/community/cells/cell-glowlab-th/messages/{mid}"
                         "/translation-retry", headers=_bearer(tok))
    assert second.status_code == 409                   # 이미 재시도 중
    assert _state(mid)["translation_attempts"] == 1
    with _db() as conn:                                # 정리
        conn.execute("UPDATE cell_messages SET translation_state='done'"
                     " WHERE msg_id=%s", (mid,))
        conn.commit()


def test_admin_can_retry_and_missing_message_404(client, monkeypatch):
    monkeypatch.setattr(rc.ai, "translate",
                        lambda text, src, targets:
                        {t: f"ad-{t}: {text}" for t in targets if t != src})
    from api import auth as auth_mod
    with _db() as conn:
        conn.execute(
            "INSERT INTO users (kind, email, password_hash) VALUES"
            " ('admin', 'retry.admin@ex.com', %s)"
            " ON CONFLICT (email) DO NOTHING",
            (auth_mod.hash_password("retry-admin-pw-1"),))
        conn.commit()
    admin = client.post("/auth/login", json={
        "email": "retry.admin@ex.com", "password": "retry-admin-pw-1"}).json()
    ah = _bearer(admin["token"])
    mid = _seed_failed()
    r = client.post(f"/community/cells/cell-glowlab-th/messages/{mid}"
                    "/translation-retry", headers=ah)
    assert r.status_code == 200 and r.json()["translationState"] == "done"
    ghost = 999999999
    assert client.post(f"/community/cells/cell-glowlab-th/messages/{ghost}"
                       "/translation-retry", headers=ah).status_code == 404
