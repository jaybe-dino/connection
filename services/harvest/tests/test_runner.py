"""러너 — 메일·지급 게이트 루프 (접수→승인→실행 / 보류→폐기)."""

from datetime import UTC, datetime, timedelta

from harvest.outreach import DryRunEsp, OutreachEngine
from harvest.referral import ReferralEngine
from harvest.runner import MemoryGateClient, Runner


def make_runner(auto_approve=False):
    clock = {"t": datetime(2026, 9, 1, 12, 0, tzinfo=UTC)}
    now = lambda: clock["t"]
    gates = MemoryGateClient(auto_approve=auto_approve)
    outreach = OutreachEngine(now=now)
    referral = ReferralEngine(now=now)
    esp = DryRunEsp()
    r = Runner(gates=gates, outreach=outreach, esp=esp, referral=referral, now=now)
    return r, gates, esp, clock


def test_mail_waits_for_gate_then_sends():
    r, gates, esp, _ = make_runner()
    r.outreach.enroll("mai@work.co", "Mai", context={"brand": "GLOWLAB"})
    msg = r.mail_tick()
    assert "OUTBOUND 게이트" in msg
    assert esp.sent == []                       # 승인 전 발송 0
    assert r.mail_tick() == "메일: 게이트 승인 대기"
    gates.approve("g1")
    msg = r.mail_tick()
    assert "1통 발송" in msg
    assert len(esp.sent) == 1


def test_mail_held_batch_discarded():
    r, gates, esp, _ = make_runner()
    r.outreach.enroll("mai@work.co", "Mai")
    r.mail_tick()
    gates.hold("g1")
    msg = r.mail_tick()
    assert "폐기" in msg
    assert esp.sent == []                       # 보류 = 외부 무통지


def test_payout_gate_flow():
    r, gates, _, _ = make_runner()
    code = r.referral.issue_code("c-mai")
    r.referral.claim(code, "c-new", "dev-A")
    r.referral.record_first_submission("c-new")
    msg = r.payout_tick()
    assert "PAYOUT 게이트" in msg
    gates.approve("g1")
    msg = r.payout_tick()
    assert "지급 처리" in msg
    assert r.referral.payout_batch() == []      # 지급 완료 → 재지급 없음


def test_scheduler_assembly_runs_jobs():
    r, gates, esp, clock = make_runner(auto_approve=True)
    r.outreach.enroll("mai@work.co", "Mai")
    ran = r.tick()
    assert "mail" in ran and "referral_payout" in ran
    # 게이트 자동 승인 → 즉시 폴링으로 발송까지
    r.poll_gates()
    assert len(esp.sent) == 1
    # 한 시간 전엔 mail 재실행 없음, 한 시간 후 재실행
    assert "mail" not in r.tick()
    clock["t"] += timedelta(hours=1, minutes=1)
    assert "mail" in r.tick()


def test_empty_batch_files_no_gate():
    r, gates, _, _ = make_runner()
    assert r.mail_tick() == "메일: 보낼 대상 없음"
    assert gates._gates == {}
