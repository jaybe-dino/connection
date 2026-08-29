from datetime import UTC, datetime, timedelta

import pytest

from harvest.outreach import (
    DryRunEsp,
    OutreachEngine,
    ReplyKind,
    SequencePaused,
    SuppressionList,
    SuppressReason,
    classify_reply,
)


class Clock:
    def __init__(self):
        self.t = datetime(2026, 9, 1, 9, 0, tzinfo=UTC)

    def __call__(self):
        return self.t

    def advance(self, **kw):
        self.t += timedelta(**kw)


@pytest.fixture
def engine():
    clock = Clock()
    eng = OutreachEngine(now=clock, daily_cap=80)
    eng.clock = clock  # 테스트 편의
    return eng


# ── 회신 분류 ────────────────────────────────────────────────

def test_classify_multilingual():
    assert classify_reply("Yes I'm interested! What's the rate?") == ReplyKind.INTERESTED
    assert classify_reply("สนใจค่ะ ขอรายละเอียดหน่อย") == ReplyKind.INTERESTED
    assert classify_reply("Em quan tâm, cho xin chi tiết") == ReplyKind.INTERESTED
    assert classify_reply("Not interested, thanks") == ReplyKind.DECLINED
    assert classify_reply("ไม่สนใจนะคะ") == ReplyKind.DECLINED
    assert classify_reply("Please remove me from your list") == ReplyKind.UNSUBSCRIBE
    assert classify_reply("수신거부 합니다") == ReplyKind.UNSUBSCRIBE
    assert classify_reply("I am out of office until Monday") == ReplyKind.OUT_OF_OFFICE
    assert classify_reply("ok") == ReplyKind.OTHER


def test_classify_llm_escalation():
    assert classify_reply("음... 글쎄요 한번 볼게요",
                          llm=lambda t: "interested") == ReplyKind.INTERESTED
    assert classify_reply("???", llm=lambda t: "banana") == ReplyKind.OTHER  # 이상값 방어


# ── 시퀀스 ───────────────────────────────────────────────────

def test_three_step_sequence_flow(engine):
    esp = DryRunEsp()
    assert engine.enroll("mai@work.co", "Mai", "th", {"brand": "GLOWLAB"})

    b1 = engine.build_batch()
    assert [s.step for s in b1.steps] == [0]
    assert engine.send_batch(b1.batch_id, esp) == 1
    assert "unsub" in esp.sent[0].body_text          # unsubscribe 링크 강제

    # 3일 전에는 다음 스텝이 안 나온다
    engine.clock.advance(days=1)
    assert engine.build_batch().steps == []
    engine.clock.advance(days=2)
    b2 = engine.build_batch()
    assert [s.step for s in b2.steps] == [1]
    engine.send_batch(b2.batch_id, esp)

    engine.clock.advance(days=4)                     # +7일 시점
    b3 = engine.build_batch()
    assert [s.step for s in b3.steps] == [2]
    engine.send_batch(b3.batch_id, esp)
    assert engine.enrollment("mai@work.co").status.value == "done"
    assert engine.build_batch().steps == []          # 완주 후 더 없음


def test_reply_stops_sequence(engine):
    esp = DryRunEsp()
    engine.enroll("mai@work.co")
    engine.send_batch(engine.build_batch().batch_id, esp)
    assert engine.record_reply("mai@work.co", "interested! rate?") == ReplyKind.INTERESTED
    engine.clock.advance(days=5)
    assert engine.build_batch().steps == []          # 회신 → 중단, 인계


def test_ooo_keeps_sequence(engine):
    esp = DryRunEsp()
    engine.enroll("mai@work.co")
    engine.send_batch(engine.build_batch().batch_id, esp)
    engine.record_reply("mai@work.co", "Automatic reply: out of office")
    engine.clock.advance(days=3)
    assert len(engine.build_batch().steps) == 1      # 부재중은 계속


def test_unsubscribe_suppresses_and_bans(engine):
    esp = DryRunEsp()
    engine.enroll("mai@work.co")
    engine.send_batch(engine.build_batch().batch_id, esp)
    engine.record_reply("mai@work.co", "unsubscribe please")
    assert engine.suppression.is_suppressed("mai@work.co")
    assert not engine.suppression.recontact_allowed("mai@work.co")
    assert not engine.enroll("mai@work.co")          # 재등록 차단 (90일)


def test_warmup_then_daily_cap(engine):
    # 첫날 20통
    for i in range(30):
        engine.enroll(f"u{i}@x.co")
    b = engine.build_batch()
    assert len(b.steps) == 20
    # 열흘 뒤: 20×1.2^10 ≈ 123 → 상한 80으로 캡
    assert engine.warmup_cap(engine.clock.t.date() + timedelta(days=10)) == 80


def test_daily_counter_blocks_second_batch(engine):
    esp = DryRunEsp()
    for i in range(25):
        engine.enroll(f"u{i}@x.co")
    engine.send_batch(engine.build_batch().batch_id, esp)   # 20 발송
    assert len(engine.build_batch().steps) == 0             # 오늘 소진
    engine.clock.advance(days=1)
    assert len(engine.build_batch().steps) == 5             # 내일 재개


def test_spam_score_pauses(engine):
    engine.enroll("a@x.co")
    engine.spam_score = 3.2
    with pytest.raises(SequencePaused):
        engine.build_batch()
    engine.spam_score = 0.5
    engine.resume()
    assert len(engine.build_batch().steps) == 1


def test_bounce_and_complaint(engine):
    esp = DryRunEsp()
    engine.enroll("dead@x.co")
    engine.enroll("angry@x.co")
    engine.send_batch(engine.build_batch().batch_id, esp)
    engine.record_bounce("dead@x.co")
    engine.record_complaint("angry@x.co")
    assert engine.suppression.reason("dead@x.co") == SuppressReason.BOUNCE
    assert engine.suppression.reason("angry@x.co") == SuppressReason.COMPLAINT
    engine.clock.advance(days=3)
    assert engine.build_batch().steps == []


def test_send_requires_built_batch_and_no_double_send(engine):
    esp = DryRunEsp()
    engine.enroll("a@x.co")
    b = engine.build_batch()
    engine.send_batch(b.batch_id, esp)
    with pytest.raises(ValueError):
        engine.send_batch(b.batch_id, esp)           # 재발송 차단
    with pytest.raises(KeyError):
        engine.send_batch("no-such-batch", esp)      # 게이트 우회 경로 없음


def test_stats(engine):
    engine.enroll("a@x.co")
    s = engine.stats()
    assert s["enrolled"] == 1 and s["today_cap"] == 20 and s["paused"] is None
