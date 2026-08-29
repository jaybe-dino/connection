"""러너 데몬 — 母 DB 등록 → OUTBOUND 게이트 → 승인 → 발송 (스레드 없이 1틱씩 검증)."""

import psycopg
from psycopg.rows import dict_row


def _pool_insert(email: str) -> None:
    import os
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        conn.execute(
            "INSERT INTO creator_pool (platform, platform_uid, handle, country,"
            " email, email_status)"
            " VALUES ('tiktok', %s, %s, 'TH', %s, 'valid')"
            " ON CONFLICT DO NOTHING",
            (email, email.split("@")[0], email))
        conn.commit()


def test_full_gate_roundtrip_via_db(client):
    from api.runner_daemon import DbGateClient, _enroll_from_pool
    from harvest.runner import Runner

    _pool_insert("nong@skin.th")
    runner = Runner(gates=DbGateClient())

    assert _enroll_from_pool(runner) == 1
    assert _enroll_from_pool(runner) == 0          # 중복 등록 없음

    msg = runner.mail_tick()
    assert "OUTBOUND 게이트" in msg
    gate_id = runner._mail_gate.gate_id
    # 콘솔 게이트 목록에 실제로 떠 있고, 승인 전 발송 0
    g = client.get(f"/gates/{gate_id}").json()
    assert g["kind"] == "OUTBOUND" and g["state"] == "PENDING"
    assert runner.esp.sent == []

    client.post(f"/gates/{gate_id}/approve", json={"member_id": "kim"})
    assert "발송" in runner.mail_tick()
    assert len(runner.esp.sent) == 1
    assert "th" not in runner.esp.sent[0].to or runner.esp.sent[0].to == "nong@skin.th"


def test_runner_status_endpoint(client):
    r = client.get("/runner/status").json()
    assert r["enabled"] is False                   # 테스트 환경은 기본 꺼짐
    assert "ticks" in r
