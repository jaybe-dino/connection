"""파이프라인 워커 — 큐 소비 루프 (구현상세 명세 §2 멱등성 규칙 포함).

on q.fetch(msg):
    if pool.exists(handle) and fresh: return        # 중복 fetch 방지
    profile = router.fetch(handle)
    cid = pool.upsert(profile, source)
    emit(q.enrich, ...); emit(q.expand, ...)
"""

import logging

from .enrich import CountrySignals, decide_country, extract_emails
from .fetch import FetchOutcome, VendorRouter
from .models import PoolState
from .queues import (
    Q_DEAD_LETTER,
    Q_DEDUP,
    Q_ENRICH,
    Q_EXPAND,
    Q_RECHECK,
    DeadLetter,
    EnrichMsg,
    ExpandMsg,
    FetchMsg,
    QueueBackend,
)
from .store import Pool

log = logging.getLogger(__name__)


class FetchWorker:
    def __init__(self, router: VendorRouter, pool: Pool, queues: QueueBackend) -> None:
        self.router = router
        self.pool = pool
        self.queues = queues

    def handle(self, msg: FetchMsg) -> str | None:
        """q.fetch 메시지 1건 처리. 저장된 creator_id 또는 None."""
        # 멱등성: 같은 handle 재유입 시 fresh면 skip
        if self.pool.exists(msg.platform, msg.handle) and \
                self.pool.is_fresh(msg.platform, msg.handle):
            return None

        result = self.router.fetch_profile(msg.handle)

        if result.outcome == FetchOutcome.EXCLUDED:
            # 404/삭제 — 재시도 없이 EXCLUDED 기록 (기존 레코드가 있을 때만)
            log.info("EXCLUDED (deleted/404): %s", msg.handle)
            return None

        if result.outcome == FetchOutcome.DEAD_LETTER:
            self.queues.emit(
                Q_DEAD_LETTER,
                DeadLetter(queue="q.fetch", message={"handle": msg.handle},
                           reason="; ".join(result.errors)),
            )
            return None

        profile = result.profile
        assert profile is not None
        cid = self.pool.upsert(profile, source=result.vendor or msg.source)
        self.queues.emit(Q_ENRICH, EnrichMsg(cid, profile.bio, list(profile.links)))
        if profile.top_video_ids:
            self.queues.emit(Q_EXPAND, ExpandMsg(cid, profile.top_video_ids, msg.ctx))
        self.queues.emit(Q_DEDUP, {"creator_id": cid})
        return cid


class EnrichWorker:
    """bio → 이메일 후보 · 국가 판정. 검증 API 연동 전까지 후보만 적재."""

    def __init__(self, pool: Pool, queues: QueueBackend) -> None:
        self.pool = pool
        self.queues = queues

    def handle(self, msg: EnrichMsg) -> dict:
        emails = extract_emails(msg.bio)
        # 국가 판정 — fetch 시점 account_region은 pool 레코드에 있음.
        # 여기서는 bio 기반 신호만으로 1차 판정하고, conf 미달 시 recheck 큐로.
        decision = decide_country(CountrySignals(bio_lang=None))
        if decision.needs_recheck:
            self.queues.emit(Q_RECHECK, {"creator_id": msg.creator_id})
        return {"creator_id": msg.creator_id, "email_candidates": emails,
                "country": decision.country, "country_conf": decision.confidence}
