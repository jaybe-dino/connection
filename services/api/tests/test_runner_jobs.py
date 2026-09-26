"""러너 잡 분리 — GMAIL_SEND_RESUME_ENABLED=0이면 승인 배치 자동 발송만
확실히 차단되고(deliver_pending 절대 미호출) 동기화 등 나머지 잡은 유지.
기존 승인 게이트·웜업 한도·브랜드 격리 보존 회귀 포함. 외부 호출 없음."""

import os
import uuid

import psycopg
from psycopg.rows import dict_row

from api import runner_daemon as rd


def _db():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def _seed_brand(conn, brand):
    conn.execute("INSERT INTO brands (brand_id, name, is_demo)"
                 " VALUES (%s,%s,false) ON CONFLICT (brand_id) DO NOTHING",
                 (brand, brand.upper()))
    conn.execute(
        "INSERT INTO gmail_accounts (brand_id, email, scopes) VALUES"
        " (%s,%s,'https://www.googleapis.com/auth/gmail.send"
        " https://www.googleapis.com/auth/gmail.readonly openid email')"
        " ON CONFLICT (brand_id, email) DO NOTHING",
        (brand, f"ops@{brand}.test"))


def _seed_batch(conn, brand, state="approved"):
    b = conn.execute(
        "INSERT INTO outreach_batches (brand_id, subject, body, created_by,"
        " state) VALUES (%s,'제안','협업 제안 본문','test',%s)"
        " RETURNING batch_id", (brand, state)).fetchone()["batch_id"]
    email = f"cr-{uuid.uuid4().hex[:8]}@{brand}.test"
    conn.execute("INSERT INTO outreach_recipients (batch_id, email)"
                 " VALUES (%s,%s)", (b, email))
    conn.execute("INSERT INTO outreach_optouts (brand_id, email)"
                 " VALUES (%s,%s) ON CONFLICT DO NOTHING", (brand, email))
    return str(b), email


def _reset_runner(monkeypatch):
    """틱 최소 간격·모드 게이트를 테스트용으로 초기화."""
    from api import gmail_sync, routes_gmail
    monkeypatch.setattr(routes_gmail, "_demo_mode", lambda: False)
    monkeypatch.setattr(gmail_sync, "sync", lambda brand: {"imported": 0})
    monkeypatch.setitem(rd._gmail_ops, "lastSync", {})
    monkeypatch.setitem(rd._gmail_ops, "lastResume", {})


def _cleanup(brands):
    with _db() as conn:
        conn.execute("DELETE FROM outreach_recipients WHERE batch_id IN"
                     " (SELECT batch_id FROM outreach_batches WHERE"
                     "  brand_id=ANY(%s))", (brands,))
        conn.execute("DELETE FROM outreach_batches WHERE brand_id=ANY(%s)",
                     (brands,))
        conn.execute("DELETE FROM outreach_optouts WHERE brand_id=ANY(%s)",
                     (brands,))
        conn.execute("DELETE FROM gmail_accounts WHERE brand_id=ANY(%s)",
                     (brands,))
        conn.commit()


def test_resume_blocked_mode_never_calls_deliver_pending(client, monkeypatch):
    """GMAIL_SEND_RESUME_ENABLED=0: 승인 배치+pending 수신자가 있어도
    deliver_pending이 절대 호출되지 않고, 수신 동기화는 계속 돈다.
    수신자 상태도 pending 그대로(발송 부작용 없음)."""
    from api import routes_outreach
    _reset_runner(monkeypatch)
    monkeypatch.setenv("GMAIL_SEND_RESUME_ENABLED", "0")
    calls = []
    monkeypatch.setattr(routes_outreach, "deliver_pending",
                        lambda *a: calls.append(a) or 1)
    synced = []
    from api import gmail_sync
    monkeypatch.setattr(gmail_sync, "sync",
                        lambda brand: synced.append(brand) or {"imported": 0})
    with _db() as conn:
        _seed_brand(conn, "runa")
        batch, email = _seed_batch(conn, "runa")
        conn.commit()
    try:
        for _ in range(2):                       # 반복 틱에도 불호출
            monkeypatch.setitem(rd._gmail_ops, "lastSync", {})
            rd._gmail_ops_tick()
        assert calls == []                       # deliver_pending 절대 미호출
        assert "runa" in synced                  # 동기화는 계속
        with _db() as conn:
            st = conn.execute("SELECT state FROM outreach_recipients WHERE"
                              " email=%s", (email,)).fetchone()["state"]
        assert st == "pending"                   # 발송 부작용 없음
    finally:
        _cleanup(["runa"])


def test_default_mode_resumes_approved_batch_compat(client, monkeypatch):
    """호환성: 플래그 미설정(기존 환경)에서는 기존처럼 승인 배치를 재개한다."""
    from api import routes_outreach
    _reset_runner(monkeypatch)
    monkeypatch.delenv("GMAIL_SEND_RESUME_ENABLED", raising=False)
    calls = []
    monkeypatch.setattr(routes_outreach, "deliver_pending",
                        lambda brand, batch: calls.append((brand, str(batch)))
                        or 1)
    with _db() as conn:
        _seed_brand(conn, "runa")
        batch, _ = _seed_batch(conn, "runa")
        conn.commit()
    try:
        rd._gmail_ops_tick()
        assert calls == [("runa", batch)]        # 기존 동작 유지
    finally:
        _cleanup(["runa"])


def test_unapproved_batch_never_resumed(client, monkeypatch):
    """승인 게이트 보존: draft 배치는 발송 재개가 켜져 있어도 재개되지 않는다."""
    from api import routes_outreach
    _reset_runner(monkeypatch)
    monkeypatch.delenv("GMAIL_SEND_RESUME_ENABLED", raising=False)
    calls = []
    monkeypatch.setattr(routes_outreach, "deliver_pending",
                        lambda *a: calls.append(a) or 1)
    with _db() as conn:
        _seed_brand(conn, "runa")
        _seed_batch(conn, "runa", state="draft")
        conn.commit()
    try:
        rd._gmail_ops_tick()
        assert calls == []                       # 미승인은 절대 발송 안 함
    finally:
        _cleanup(["runa"])


def test_brand_isolation_in_resume(client, monkeypatch):
    """브랜드 격리 보존: 각 브랜드는 자기 승인 배치로만 deliver_pending이
    호출되고 교차 호출이 없다."""
    from api import routes_outreach
    _reset_runner(monkeypatch)
    monkeypatch.delenv("GMAIL_SEND_RESUME_ENABLED", raising=False)
    calls = []
    monkeypatch.setattr(routes_outreach, "deliver_pending",
                        lambda brand, batch: calls.append((brand, str(batch)))
                        or 1)
    with _db() as conn:
        _seed_brand(conn, "runa")
        _seed_brand(conn, "runb")
        ba, _ = _seed_batch(conn, "runa")
        bb, _ = _seed_batch(conn, "runb")
        conn.commit()
    try:
        rd._gmail_ops_tick()
        assert sorted(calls) == sorted([("runa", ba), ("runb", bb)])
        assert ("runa", bb) not in calls and ("runb", ba) not in calls
    finally:
        _cleanup(["runa", "runb"])


def test_warmup_limit_preserved_in_real_deliver(client, monkeypatch):
    """웜업 한도 보존: 한도 소진(send_via_brand_gmail=None)이면 실제
    deliver_pending은 발송 0건·수신자 pending 유지로 대기한다 — 분리
    스위치가 이 안전 규칙을 바꾸지 않는다."""
    from api import routes_gmail, routes_outreach
    monkeypatch.setattr(routes_gmail, "send_via_brand_gmail",
                        lambda *a, **k: None)    # 일일 한도 초과 모사
    monkeypatch.setattr(routes_outreach.gmail, "send_via_brand_gmail",
                        lambda *a, **k: None, raising=False)
    with _db() as conn:
        _seed_brand(conn, "runa")
        batch, email = _seed_batch(conn, "runa")
        conn.commit()
    try:
        delivered = routes_outreach.deliver_pending("runa", batch)
        assert delivered == 0
        with _db() as conn:
            st = conn.execute("SELECT state FROM outreach_recipients WHERE"
                              " email=%s", (email,)).fetchone()["state"]
        assert st == "pending"                   # 한도 회복 후 재개 대기
    finally:
        _cleanup(["runa"])


def test_status_reports_job_split_and_counters_origin(client, monkeypatch):
    """상태 응답: countersSince(프로세스 시작)·잡별 활성/비활성·사유가
    환경에 따라 정확히 표시된다."""
    monkeypatch.setenv("GMAIL_SEND_RESUME_ENABLED", "0")
    monkeypatch.setitem(rd._state, "enabled", True)
    from api import routes_gmail
    monkeypatch.setattr(routes_gmail, "_demo_mode", lambda: False)
    s = rd.status()
    assert s["countersSince"]                    # 카운터 기준 시각 명시
    jobs = s["jobs"]
    assert set(jobs) == {"sync", "sendResume", "translation", "billing",
                         "reconcile"}
    assert jobs["sync"]["enabled"] is True
    assert jobs["sendResume"]["enabled"] is False
    assert "차단" in jobs["sendResume"]["reason"]
    assert "GMAIL_SEND_RESUME_ENABLED" in jobs["sendResume"]["reason"]
    assert jobs["translation"]["enabled"] and jobs["billing"]["enabled"]
    assert jobs["reconcile"]["enabled"] is False  # NICEpay 미설정
    # 러너 꺼짐이면 모든 잡 비활성 + 사유
    monkeypatch.setitem(rd._state, "enabled", False)
    off = rd.status()["jobs"]
    assert all(not j["enabled"] for j in off.values())
    assert off["sync"]["reason"] == "러너 꺼짐"
