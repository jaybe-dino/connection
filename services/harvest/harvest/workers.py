"""Discover 워커 — D1 해시태그 · D2 그래프 확장 (구현상세 명세 §3).

D1이 씨앗, D2가 확장. 신규 발견률 <3%까지 BFS — 이게 전수 수렴의 엔진.
폭주 방어: expand_fanout_cap(계정당) + 국가·카테고리 일일 예산.
"""

import logging
from typing import Iterator, Protocol

from .config import GraphExpandParams
from .discover import ConvergenceDetector, DailyBudget, SeedEntry
from .queues import Ctx, FetchMsg, Q_FETCH, QueueBackend
from .store import Pool

log = logging.getLogger(__name__)


class DiscoverySource(Protocol):
    """D1/D2를 제공하는 벤더 능력 계약 (EnsembleData·ScrapeCreators 등)."""

    name: str

    def hashtag_posts(self, tag: str, pages: int = 1) -> Iterator[dict]: ...


class GraphSource(DiscoverySource, Protocol):
    def post_comments(self, video_id: str, limit: int = 200) -> Iterator[str]: ...
    def suggested_users(self, handle: str, limit: int = 30) -> Iterator[str]: ...


class HashtagDiscoverWorker:
    """D1 — 카테고리 해시태그 → 작성자 후보 → q.fetch.

    pool.exists로 신규 여부를 판정해 수렴 감지기에 관찰을 넣고,
    신규만 예산을 소비하며 큐에 넣는다 (seen 스킵 → 증분이 싼 이유).
    """

    def __init__(self, source: DiscoverySource, pool: Pool, queues: QueueBackend,
                 detector: ConvergenceDetector, budget: DailyBudget,
                 params: GraphExpandParams | None = None) -> None:
        self.source = source
        self.pool = pool
        self.queues = queues
        self.detector = detector
        self.budget = budget
        self.params = params or GraphExpandParams()
        self._emitted: set[str] = set()   # 이번 실행 내 중복 emit 방지

    def _consider(self, handle: str | None, ctx: Ctx, platform: str = "tiktok") -> bool:
        """후보 1건 처리. emit했으면 True."""
        if not handle or handle in self._emitted:
            return False
        is_new = not self.pool.exists(platform, handle)
        self.detector.observe(is_new)
        if not is_new:
            return False
        if not self.budget.try_spend():
            return False                   # 예산 소진 — 이월
        self._emitted.add(handle)
        self.queues.emit(Q_FETCH, FetchMsg(handle=handle, platform=platform,
                                           ctx=ctx, source=self.source.name))
        return True

    def run_seed(self, seed: SeedEntry, ctx: Ctx) -> int:
        """시드 1건(해시태그 목록) 완주. emit 수 반환. 배치 경계 = 시드 1건."""
        if self.detector.converged:
            return 0
        emitted = 0
        for tag in seed.hashtags:
            for post in self.source.hashtag_posts(tag, pages=self.params.seed_pages_per_tag):
                if self._consider(post.get("author_handle"), ctx):
                    emitted += 1
        self.detector.end_batch()
        return emitted


class GraphExpandWorker:
    """D2 — 댓글러·추천유저 확장 (q.expand 소비).

    계정당 확장 상한(expand_fanout_cap)으로 지수 폭주를 막는다.
    """

    def __init__(self, source: GraphSource, pool: Pool, queues: QueueBackend,
                 detector: ConvergenceDetector, budget: DailyBudget,
                 params: GraphExpandParams | None = None) -> None:
        self.source = source
        self.pool = pool
        self.queues = queues
        self.detector = detector
        self.budget = budget
        self.params = params or GraphExpandParams()
        self._emitted: set[str] = set()

    def _consider(self, handle: str | None, ctx: Ctx) -> bool:
        if not handle or handle in self._emitted:
            return False
        is_new = not self.pool.exists("tiktok", handle)
        self.detector.observe(is_new)
        if not is_new or not self.budget.try_spend():
            return False
        self._emitted.add(handle)
        self.queues.emit(Q_FETCH, FetchMsg(handle=handle, platform="tiktok",
                                           ctx=ctx, source=f"{self.source.name}:expand"))
        return True

    def expand(self, handle: str, video_ids: list[str], ctx: Ctx) -> int:
        """계정 1건 확장. emit 수 반환 (fanout cap 이하 보장)."""
        if self.detector.converged:
            return 0
        cap = self.params.expand_fanout_cap
        emitted = 0

        # 상위 영상 댓글러 (top N × 200)
        for vid in video_ids[: self.params.top_videos_per_account]:
            if emitted >= cap:
                break
            for commenter in self.source.post_comments(
                    vid, limit=self.params.commenters_per_video):
                if emitted >= cap:
                    break
                if self._consider(commenter, ctx):
                    emitted += 1

        # 추천/유사 유저
        if emitted < cap:
            for suggested in self.source.suggested_users(handle):
                if emitted >= cap:
                    break
                if self._consider(suggested, ctx):
                    emitted += 1

        return emitted
