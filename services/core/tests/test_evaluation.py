from datetime import UTC, datetime, timedelta

import pytest

from core.evaluation import EvaluationHarness, L2_MIN_SAMPLES
from core.ledger import EventType, Ledger


class Clock:
    def __init__(self):
        self.t = datetime(2026, 9, 1, tzinfo=UTC)

    def __call__(self):
        return self.t

    def advance(self, days):
        self.t += timedelta(days=days)


@pytest.fixture
def harness():
    clock = Clock()
    h = EvaluationHarness(Ledger(), now=clock)
    h.clock = clock
    return h


def test_record_and_score_after_30_days(harness):
    p = harness.record("judgment:tiktokshop", "c1", 0.8)
    assert harness.score_due() == []          # 아직 30일 안 됨
    harness.record_outcome(p.prediction_id, True)
    harness.clock.advance(31)
    scored = harness.score_due()
    assert len(scored) == 1
    assert scored[0].brier == round((0.8 - 1.0) ** 2, 4)   # 0.04
    # 재채점 없음
    assert harness.score_due() == []


def test_missing_outcome_counts_as_failure(harness):
    harness.record("judgment:mail", "c2", 0.9)
    harness.clock.advance(31)
    scored = harness.score_due()
    assert scored[0].brier == round(0.9 ** 2, 4)   # 미완주 간주 → 큰 페널티


def test_ledger_trail(harness):
    p = harness.record("judgment:mail", "c1", 0.7)
    harness.record_outcome(p.prediction_id, True)
    harness.clock.advance(31)
    harness.score_due()
    harness.update_weights("judgment:mail", {"product_fit": 0.5}, "브라이어 개선")
    types = [e.event_type for e in harness.ledger.entries()]
    assert types == [EventType.JUDGMENT, EventType.JUDGMENT_SCORED,
                     EventType.WEIGHTS_UPDATED]
    assert harness.ledger.verify_chain()


def test_l2_promotion_gate(harness):
    # 정확한 예측 30건 → 승격 가능
    for i in range(L2_MIN_SAMPLES):
        p = harness.record("judgment:sweep", f"c{i}", 0.9)
        harness.record_outcome(p.prediction_id, True)
    harness.clock.advance(31)
    harness.score_due()
    report = harness.channel_report("judgment:sweep")
    assert report["samples"] == L2_MIN_SAMPLES
    assert report["mean_brier"] == 0.01
    assert report["l2_eligible"] is True

    # 부정확한 채널은 승격 불가
    for i in range(L2_MIN_SAMPLES):
        p = harness.record("judgment:bad", f"b{i}", 0.9)
        harness.record_outcome(p.prediction_id, False)
    harness.clock.advance(31)
    harness.score_due()
    assert harness.channel_report("judgment:bad")["l2_eligible"] is False


def test_invalid_probability(harness):
    with pytest.raises(ValueError):
        harness.record("x", "c", 1.5)
