"""운영 파라미터 — 구현상세 명세 §3~§9의 설계 기준값.

전부 운영에서 캘리브레이션되는 값이므로 한곳에 모은다.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class GraphExpandParams:
    """§3.2 그래프 확장 파라미터."""

    seed_pages_per_tag: int = 50          # 해시태그당 긁는 페이지
    top_videos_per_account: int = 3       # 계정당 댓글 수집 대상 영상
    commenters_per_video: int = 200       # 영상당 댓글러 상한
    suggested_depth: int = 2              # 추천유저 BFS 깊이 (hop)
    expand_fanout_cap: int = 30           # 계정당 확장 상한 (폭주 방지)


@dataclass(frozen=True)
class ConvergenceParams:
    """§3.3 수렴 판정 — 신규율 < 3%가 3배치 연속이면 사실상 전수."""

    window_size: int = 10_000
    new_rate_threshold: float = 0.03
    streak_batches: int = 3


@dataclass(frozen=True)
class FetchParams:
    """§4.3 배치·재시도 규칙."""

    batch_size: int = 500                             # 큐 pop 단위
    max_retries: int = 3
    backoff_seconds: tuple[float, ...] = (2.0, 8.0, 30.0)  # 지수 백오프


@dataclass(frozen=True)
class CountryVoteWeights:
    """§5.3 국가 판정 가중치 — argmax(weighted_vote), conf < min_conf → recheck."""

    account_region: float = 0.40   # 가장 신뢰
    phone_country: float = 0.25    # 있으면 강함
    bio_lang: float = 0.15         # 영어는 약함
    caption_lang: float = 0.15     # 최근 N개 다수결
    active_hour_tz: float = 0.05   # 보조
    min_conf: float = 0.6


@dataclass(frozen=True)
class DedupThresholds:
    """§6.2 매칭 규칙 점수 임계."""

    auto_merge: float = 1.0        # 합산 ≥ 1.0 → 동일인 병합
    human_review: float = 0.6      # 0.6~1.0 → 사람 검토 큐


@dataclass(frozen=True)
class GradeCuts:
    """§7.3 등급 컷 (팔로워 기준, 조정 가능)."""

    mega: int = 1_000_000
    macro: int = 100_000
    mid: int = 20_000
    micro: int = 5_000
    # nano = micro 미만


@dataclass(frozen=True)
class HarvestConfig:
    expand: GraphExpandParams = field(default_factory=GraphExpandParams)
    convergence: ConvergenceParams = field(default_factory=ConvergenceParams)
    fetch: FetchParams = field(default_factory=FetchParams)
    country_vote: CountryVoteWeights = field(default_factory=CountryVoteWeights)
    dedup: DedupThresholds = field(default_factory=DedupThresholds)
    grades: GradeCuts = field(default_factory=GradeCuts)
    # 국가·카테고리별 일일 discover 예산 (예: VN·선케어 하루 5만 계정)
    daily_discover_budget: dict[tuple[str, str], int] = field(default_factory=dict)


DEFAULT = HarvestConfig()
