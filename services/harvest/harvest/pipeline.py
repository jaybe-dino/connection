"""파이프라인 워커 — 큐 소비 루프 (구현상세 명세 §2·§5).

FetchWorker: 멱등 fetch → upsert → enrich·expand·dedup 큐 전파.
EnrichWorker: 이메일(정규식→링크크롤→검증) · 전화/메신저 · 국가 합의 · 스코어/등급
              → 母 DB 반영. conf<0.6 → q.recheck.
"""

import logging
import re
from dataclasses import dataclass
from typing import Callable

from .enrich.country import CountrySignals, decide_country, phone_to_country
from .enrich.email_extract import extract_emails, is_link_in_bio
from .enrich.email_verify import VerifyApi, verify_email
from .enrich.langdetect import detect_lang
from .enrich.linkcrawl import crawl_link
from .fetch import FetchOutcome, VendorRouter
from .http import Transport
from .models import EmailStatus, Grade
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
from .score import ScoreInput, contact_score, grade_of, influence_score
from .store import Pool

log = logging.getLogger(__name__)

_RE_PHONE = re.compile(r"\+\d[\d\s\-]{7,14}\d")

# 국가별 주 메신저 (기술스택 §7 연락 채널 전환 루트)
_MESSENGER_BY_COUNTRY = {"VN": "zalo", "TH": "line", "US": "whatsapp"}


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


@dataclass
class Enrichment:
    """EnrichWorker 산출 — 母 DB 반영분."""

    creator_id: str
    email: str | None
    email_status: EmailStatus
    messenger: dict[str, str]           # {whatsapp|zalo|line: 번호}
    country: str | None
    country_conf: float
    lang: str | None
    influence: float
    contact: float
    grade: Grade


class EnrichWorker:
    """§5 심화 — bio·링크에서 연락처, 다신호 국가 합의, 스코어·등급 산출.

    transport 없으면 링크 크롤 생략, verify_api 없으면 검증은 risky 보수 처리.
    mx_lookup은 테스트/오프라인에서 주입 (기본은 실제 DNS 조회).
    """

    def __init__(self, pool: Pool, queues: QueueBackend,
                 transport: Transport | None = None,
                 verify_api: VerifyApi | None = None,
                 mx_lookup: Callable[[str], bool] | None = None) -> None:
        self.pool = pool
        self.queues = queues
        self.transport = transport
        self.verify_api = verify_api
        self.mx_lookup = mx_lookup

    # ── 단계별 ──────────────────────────────────────────────

    def _find_email(self, bio: str | None, links: list[str]) -> tuple[str | None, EmailStatus]:
        candidates = extract_emails(bio)
        if not candidates and self.transport:
            # 2단: link-in-bio 크롤 (linktr.ee류 우선, 없으면 첫 링크)
            targets = [u for u in links if is_link_in_bio(u)] or links[:1]
            for url in targets:
                candidates = crawl_link(url, self.transport)
                if candidates:
                    break
        for email in candidates:
            status = verify_email(email, self.verify_api, self.mx_lookup)
            if status != EmailStatus.NONE:
                return email, status
        return None, EmailStatus.NONE

    @staticmethod
    def _find_phone(bio: str | None) -> str | None:
        if not bio:
            return None
        m = _RE_PHONE.search(bio)
        return m.group(0) if m else None

    # ── 메인 ────────────────────────────────────────────────

    def handle(self, msg: EnrichMsg) -> Enrichment:
        rec = self.pool.get(msg.creator_id) or {}

        email, email_status = self._find_email(msg.bio, msg.links)
        phone = self._find_phone(msg.bio)
        bio_lang = detect_lang(msg.bio)

        decision = decide_country(CountrySignals(
            account_region=rec.get("account_region"),
            phone_country=phone_to_country(phone) if phone else None,
            bio_lang=bio_lang,
        ))
        if decision.needs_recheck:
            self.queues.emit(Q_RECHECK, {"creator_id": msg.creator_id})

        messenger: dict[str, str] = {}
        if phone and decision.country:
            app = _MESSENGER_BY_COUNTRY.get(decision.country, "whatsapp")
            messenger[app] = phone

        influence = influence_score(ScoreInput(
            followers=rec.get("followers"),
            engagement_rate=rec.get("engagement_rate"),
            avg_views=rec.get("avg_views"),
            post_freq_30d=rec.get("post_freq_30d"),
            sponsor_ratio_90d=rec.get("sponsor_ratio_90d"),
        ))
        grade = grade_of(rec.get("followers"))
        contact = contact_score(influence, email_status, has_messenger=bool(messenger))

        enrichment = Enrichment(
            creator_id=msg.creator_id, email=email, email_status=email_status,
            messenger=messenger, country=decision.country,
            country_conf=round(decision.confidence, 3), lang=bio_lang,
            influence=influence, contact=contact, grade=grade,
        )
        self.pool.update_enrichment(enrichment)
        return enrichment
