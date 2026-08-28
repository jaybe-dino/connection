"""Discover — 계정 후보 발견 (구현상세 명세 §3).

정확도보다 양. 소스별 어댑터가 같은 handle 출력을 낸다.
D1 해시태그·키워드 / D2 그래프 확장(댓글러·추천·같은 사운드) /
D3 TikTok Shop 커머스 그물 / D4 커뮤니티 파싱.

여기서는 시드 사전 구조, 수렴 판정, 일일 예산(폭주 방어)을 구현한다.
"""

from collections import deque
from dataclasses import dataclass, field

from .config import ConvergenceParams


@dataclass(frozen=True)
class SeedEntry:
    """seed_dict[country][category] 항목 — §3.1."""

    hashtags: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()
    competitor_tags: tuple[str, ...] = ()
    shop_category_id: str | None = None


# 시드 사전 예시 (국가별 플레이북 파라미터 시트에서 채운다)
SEED_DICT: dict[str, dict[str, SeedEntry]] = {
    "VN": {
        "sunscreen": SeedEntry(
            hashtags=("kemchốngnắng", "reviewkemchốngnắng", "chốngnắnghànquốc"),
            keywords=("kem chống nắng hàn", "chống nắng nâng tông"),
            competitor_tags=("@anessa_vn", "@beplain.vn"),
            shop_category_id="601450",
        ),
    },
    "TH": {
        "sunscreen": SeedEntry(
            hashtags=("ครีมกันแดด", "รีวิวสกินแคร์"),
        ),
    },
}


class ConvergenceDetector:
    """§3.3 수렴 판정 — 최근 window 중 신규율 < 임계가 streak 배치 연속이면 종료.

    배치 경계는 `end_batch()` 호출로 표시한다.
    """

    def __init__(self, params: ConvergenceParams | None = None) -> None:
        self.params = params or ConvergenceParams()
        self._window: deque[bool] = deque(maxlen=self.params.window_size)
        self._streak = 0
        self._converged = False

    def observe(self, is_new: bool) -> None:
        self._window.append(is_new)

    @property
    def new_rate(self) -> float:
        if not self._window:
            return 1.0
        return sum(self._window) / len(self._window)

    def end_batch(self) -> bool:
        """배치 종료 시 호출. 수렴(사실상 전수)이면 True."""
        if self.new_rate < self.params.new_rate_threshold:
            self._streak += 1
        else:
            self._streak = 0
        if self._streak >= self.params.streak_batches:
            self._converged = True
        return self._converged

    @property
    def converged(self) -> bool:
        return self._converged


@dataclass
class DailyBudget:
    """국가·카테고리별 일일 discover 예산 — 소진 시 다음 날로 이월(§3.3 폭주 방어)."""

    limit: int
    used: int = 0
    carryover: int = 0

    def try_spend(self, n: int = 1) -> bool:
        if self.used + n > self.limit:
            self.carryover += n
            return False
        self.used += n
        return True

    def rollover(self) -> None:
        """자정 리셋 — 이월분은 다음 날 예산 소비 대상 큐에 남는다."""
        self.used = 0
        self.carryover = 0
