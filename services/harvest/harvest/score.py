"""Score — 영향력 · 접촉 우선순위 · 등급 (구현상세 명세 §7).

influence = 100 * sigmoid(
    0.30*z(log(followers)) + 0.28*z(engagement_rate)
  + 0.18*z(avg_views/followers) + 0.14*z(post_freq_30d)
  + 0.10*z(gmv_signal) - penalty )

penalty = 0.5*계단형급증 + 0.3*(sponsor_ratio_90d>0.4) + 0.4*(마지막 게시 45일 초과)

contact = influence + 20*(email valid) + 10*(왓츠앱|잘로|라인)
        + 15*category_match(brand_profile)
"""

import math
from dataclasses import dataclass, field

from .config import GradeCuts
from .models import EmailStatus, Grade


@dataclass(frozen=True)
class MetricStats:
    mean: float
    std: float

    def z(self, x: float | None) -> float:
        if x is None or self.std <= 0:
            return 0.0
        return (x - self.mean) / self.std


@dataclass(frozen=True)
class PopulationStats:
    """국가·카테고리 파드별 모집단 통계 — 운영에서 주기 재계산.

    기본값은 뷰티 카테고리 가정의 부트스트랩 값이다.
    """

    log_followers: MetricStats = field(default_factory=lambda: MetricStats(9.2, 1.8))
    engagement_rate: MetricStats = field(default_factory=lambda: MetricStats(0.045, 0.04))
    reach_efficiency: MetricStats = field(default_factory=lambda: MetricStats(0.35, 0.45))
    post_freq_30d: MetricStats = field(default_factory=lambda: MetricStats(9.0, 8.0))
    gmv_signal: MetricStats = field(default_factory=lambda: MetricStats(0.0, 1.0))


@dataclass
class ScoreInput:
    followers: int | None = None
    engagement_rate: float | None = None
    avg_views: int | None = None
    post_freq_30d: int | None = None
    gmv_signal: int | None = None
    sponsor_ratio_90d: float | None = None
    days_since_last_post: int | None = None
    step_growth_flag: bool = False        # follower_series 계단 감지(가짜 팔로워)


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def penalty(s: ScoreInput) -> float:
    p = 0.0
    if s.step_growth_flag:
        p += 0.5
    if (s.sponsor_ratio_90d or 0.0) > 0.4:
        p += 0.3   # 협찬 과다 — 차단이 아니라 과금 제외 후보
    if (s.days_since_last_post or 0) > 45:
        p += 0.4   # 휴면
    return p


def influence_score(s: ScoreInput, stats: PopulationStats | None = None) -> float:
    st = stats or PopulationStats()
    log_followers = math.log(s.followers) if s.followers and s.followers > 0 else None
    reach = (s.avg_views / s.followers) if s.avg_views and s.followers else None

    x = (
        0.30 * st.log_followers.z(log_followers)
        + 0.28 * st.engagement_rate.z(s.engagement_rate)
        + 0.18 * st.reach_efficiency.z(reach)
        + 0.14 * st.post_freq_30d.z(s.post_freq_30d)
        + 0.10 * st.gmv_signal.z(s.gmv_signal)
        - penalty(s)
    )
    return round(100.0 * _sigmoid(x), 2)


def contact_score(
    influence: float,
    email_status: EmailStatus = EmailStatus.NONE,
    has_messenger: bool = False,          # whatsapp | zalo | line
    category_matches_brand: bool = False, # 브랜드 붙었을 때만
) -> float:
    c = influence
    if email_status == EmailStatus.VALID:
        c += 20.0
    if has_messenger:
        c += 10.0
    if category_matches_brand:
        c += 15.0
    return round(c, 2)


def grade_of(followers: int | None, cuts: GradeCuts | None = None) -> Grade:
    g = cuts or GradeCuts()
    f = followers or 0
    if f >= g.mega:
        return Grade.MEGA
    if f >= g.macro:
        return Grade.MACRO
    if f >= g.mid:
        return Grade.MID
    if f >= g.micro:
        return Grade.MICRO
    return Grade.NANO


def detect_step_growth(series: list[tuple[str, int]],
                       jump_ratio: float = 0.30, window: int = 7) -> bool:
    """follower_series에서 계단형 급증 감지 — window일 내 jump_ratio 이상 점프."""
    if len(series) < 2:
        return False
    counts = [c for _, c in series]
    for i in range(1, len(counts)):
        lo = max(0, i - window)
        base = counts[lo]
        if base > 0 and (counts[i] - base) / base >= jump_ratio:
            return True
    return False
