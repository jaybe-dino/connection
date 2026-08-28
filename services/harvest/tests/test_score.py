from harvest.models import EmailStatus, Grade
from harvest.score import (
    ScoreInput,
    contact_score,
    detect_step_growth,
    grade_of,
    influence_score,
    penalty,
)


def test_influence_in_range():
    s = ScoreInput(followers=48_000, engagement_rate=0.06,
                   avg_views=35_000, post_freq_30d=12)
    v = influence_score(s)
    assert 0.0 <= v <= 100.0
    assert v > 50.0  # 평균 이상 지표 → 상위권


def test_penalties_lower_score():
    base = ScoreInput(followers=48_000, engagement_rate=0.06,
                      avg_views=35_000, post_freq_30d=12)
    penalized = ScoreInput(followers=48_000, engagement_rate=0.06,
                           avg_views=35_000, post_freq_30d=12,
                           sponsor_ratio_90d=0.55, days_since_last_post=60,
                           step_growth_flag=True)
    assert influence_score(penalized) < influence_score(base)
    assert penalty(penalized) == 0.5 + 0.3 + 0.4


def test_missing_fields_still_scores():
    v = influence_score(ScoreInput())
    assert 0.0 <= v <= 100.0


def test_contact_score_bonuses():
    assert contact_score(50.0) == 50.0
    assert contact_score(50.0, EmailStatus.VALID) == 70.0
    assert contact_score(50.0, EmailStatus.RISKY) == 50.0  # risky는 발송 제외 기본
    assert contact_score(50.0, EmailStatus.VALID, has_messenger=True,
                         category_matches_brand=True) == 95.0


def test_grade_cuts():
    assert grade_of(1_500_000) == Grade.MEGA
    assert grade_of(1_000_000) == Grade.MEGA
    assert grade_of(250_000) == Grade.MACRO
    assert grade_of(50_000) == Grade.MID
    assert grade_of(10_000) == Grade.MICRO
    assert grade_of(3_000) == Grade.NANO
    assert grade_of(None) == Grade.NANO


def test_step_growth_detection():
    organic = [(f"d{i}", 10_000 + i * 50) for i in range(30)]
    assert not detect_step_growth(organic)

    stepped = [("d1", 10_000), ("d2", 10_100), ("d3", 25_000)]  # 하루 +147%
    assert detect_step_growth(stepped)

    assert not detect_step_growth([])
    assert not detect_step_growth([("d1", 100)])
