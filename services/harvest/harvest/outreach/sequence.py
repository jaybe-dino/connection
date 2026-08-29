"""메일 시퀀스 엔진 — 기획 §4.3 메일 리서치·발송 담당 + 기술스택 §7.

규칙:
  · 3단 시퀀스 (0일 → +3일 → +7일 마지막), 회신 시 즉시 중단
  · 일 상한 80건 · 도메인 워밍업(첫날 20통 → 매일 +20% → 상한 도달)
  · 스팸 점수 3.0↑ 또는 신고율 임계 초과 → 엔진 자동 중단(실패 조건)
  · 발송은 전부 OUTBOUND 게이트: build_batch()로 배치를 만들고
    사람 승인 후 send_batch()로만 나간다 — 직접 발송 경로 없음
  · 발송 전·시점 모두 억제 목록 재확인, unsubscribe 링크 강제 삽입
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from typing import Callable
from uuid import uuid4

from .esp import Esp, OutboundEmail
from .replies import LlmClassifier, ReplyKind, classify_reply
from .suppression import SuppressionList, SuppressReason

log = logging.getLogger(__name__)

STEP_DELAYS_DAYS = (0, 3, 7)      # 3단 시퀀스
DAILY_CAP = 80                    # 일 80건 상한
WARMUP_START = 20                 # 워밍업 첫날
WARMUP_GROWTH = 1.2               # 매일 +20%
SPAM_SCORE_LIMIT = 3.0            # 스팸 3.0↑ 자동 중단
COMPLAINT_RATE_LIMIT = 0.005      # 신고율 0.5%↑ 자동 중단


class SequencePaused(Exception):
    """실패 조건 발동 — 사람이 원인 보고를 확인하기 전까지 발송 불가."""


class EnrollStatus(StrEnum):
    ACTIVE = "active"
    REPLIED = "replied"
    DONE = "done"           # 3단 완주 (무응답)
    STOPPED = "stopped"     # 수신거부·억제


@dataclass
class SequenceStep:
    email: str
    step: int               # 0..2
    subject: str
    body: str


@dataclass
class Enrollment:
    email: str
    name: str
    locale: str
    context: dict
    step: int = 0
    next_due: datetime | None = None
    status: EnrollStatus = EnrollStatus.ACTIVE
    reply_kind: ReplyKind | None = None


@dataclass
class Batch:
    batch_id: str
    steps: list[SequenceStep]
    built_at: datetime
    sent: bool = False


# 템플릿 계약: (step, enrollment) -> (subject, body). 실서비스는 브랜드 프로필 개인화.
Template = Callable[[int, Enrollment], tuple[str, str]]


def default_template(step: int, e: Enrollment) -> tuple[str, str]:
    first = e.name or e.email.split("@")[0]
    brand = e.context.get("brand", "커넥션 파트너 브랜드")
    if step == 0:
        return (f"{first}님, {brand} 협업 제안드려요",
                f"{first}님 콘텐츠 잘 보고 있어요. {brand}에서 샘플 협업을 제안합니다.")
    if step == 1:
        return (f"Re: {brand} 협업 제안",
                "지난 메일 확인하셨을까요? 부담 없이 회신 주세요.")
    return (f"Re: {brand} 협업 제안 (마지막 안내)",
            "마지막으로 안내드려요. 관심 없으시면 이 메일은 무시하셔도 됩니다.")


class OutreachEngine:
    def __init__(self, suppression: SuppressionList | None = None,
                 template: Template = default_template,
                 llm_classifier: LlmClassifier | None = None,
                 daily_cap: int = DAILY_CAP,
                 now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self.now = now
        self.suppression = suppression or SuppressionList(now=now)
        self.template = template
        self.llm_classifier = llm_classifier
        self.daily_cap = daily_cap
        self._enrollments: dict[str, Enrollment] = {}
        self._batches: dict[str, Batch] = {}
        self._sent_by_day: dict[date, int] = {}
        self._total_sent = 0
        self.spam_score = 0.0
        self.started_on: date = now().date()   # 워밍업 기준일
        self.paused_reason: str | None = None

    # ── 등록 ────────────────────────────────────────────────
    def enroll(self, email: str, name: str = "", locale: str = "en",
               context: dict | None = None) -> bool:
        email = email.lower()
        if self.suppression.is_suppressed(email) or \
                not self.suppression.recontact_allowed(email):
            return False
        if email in self._enrollments:
            return False
        self._enrollments[email] = Enrollment(
            email=email, name=name, locale=locale, context=context or {},
            next_due=self.now())
        return True

    # ── 상한 계산 ───────────────────────────────────────────
    def warmup_cap(self, on: date | None = None) -> int:
        """워밍업: 첫날 20 → 매일 ×1.2, 일 상한에서 캡."""
        day_index = ((on or self.now().date()) - self.started_on).days
        cap = WARMUP_START * (WARMUP_GROWTH ** max(0, day_index))
        return min(self.daily_cap, int(cap))

    def _remaining_today(self) -> int:
        today = self.now().date()
        return max(0, self.warmup_cap(today) - self._sent_by_day.get(today, 0))

    # ── 실패 조건 ───────────────────────────────────────────
    def _check_pause(self) -> None:
        if self.spam_score >= SPAM_SCORE_LIMIT:
            self.paused_reason = f"스팸 점수 {self.spam_score:.1f} ≥ {SPAM_SCORE_LIMIT}"
        elif self._total_sent >= 200 and \
                self.suppression.complaint_count() / self._total_sent > COMPLAINT_RATE_LIMIT:
            self.paused_reason = "신고율 임계 초과"
        if self.paused_reason:
            raise SequencePaused(self.paused_reason)

    def resume(self) -> None:
        """원인 보고 확인 후 사람이 명시적으로 재개."""
        self.paused_reason = None

    # ── 배치 (게이트 앞단) ──────────────────────────────────
    def build_batch(self) -> Batch:
        """오늘 나갈 수 있는 만큼의 발송 배치 생성 — OUTBOUND 게이트 승인 대상."""
        self._check_pause()
        now = self.now()
        room = self._remaining_today()
        steps: list[SequenceStep] = []
        for e in self._enrollments.values():
            if len(steps) >= room:
                break
            if e.status != EnrollStatus.ACTIVE or e.next_due is None or e.next_due > now:
                continue
            if self.suppression.is_suppressed(e.email):
                e.status = EnrollStatus.STOPPED
                continue
            subject, body = self.template(e.step, e)
            steps.append(SequenceStep(e.email, e.step, subject, body))
        batch = Batch(batch_id=str(uuid4()), steps=steps, built_at=now)
        self._batches[batch.batch_id] = batch
        return batch

    def send_batch(self, batch_id: str, esp: Esp) -> int:
        """게이트 승인 후에만 호출 — 발송·스텝 전진·다음 예약. 발송 수 반환."""
        self._check_pause()
        batch = self._batches[batch_id]
        if batch.sent:
            raise ValueError("이미 발송된 배치")
        sent = 0
        today = self.now().date()
        for step in batch.steps:
            e = self._enrollments.get(step.email)
            if e is None or e.status != EnrollStatus.ACTIVE:
                continue
            if self.suppression.is_suppressed(step.email):   # 발송 시점 재확인
                e.status = EnrollStatus.STOPPED
                continue
            body = step.body + "\n\n--\n수신을 원치 않으시면: " \
                + (f"https://connection.app/unsub/{e.email}")
            esp.send(OutboundEmail(to=step.email, subject=step.subject, body_text=body))
            sent += 1
            if e.step >= len(STEP_DELAYS_DAYS) - 1:
                e.status = EnrollStatus.DONE
                e.next_due = None
            else:
                delta = STEP_DELAYS_DAYS[e.step + 1] - STEP_DELAYS_DAYS[e.step]
                e.step += 1
                e.next_due = self.now() + timedelta(days=delta)
        batch.sent = True
        self._sent_by_day[today] = self._sent_by_day.get(today, 0) + sent
        self._total_sent += sent
        return sent

    # ── 회신 · 반송 · 신고 ──────────────────────────────────
    def record_reply(self, email: str, body: str) -> ReplyKind:
        kind = classify_reply(body, self.llm_classifier)
        e = self._enrollments.get(email.lower())
        if e:
            if kind == ReplyKind.UNSUBSCRIBE:
                e.status = EnrollStatus.STOPPED
                self.suppression.suppress(email, SuppressReason.UNSUBSCRIBE)
            elif kind == ReplyKind.OUT_OF_OFFICE:
                pass                          # 시퀀스 유지
            else:
                e.status = EnrollStatus.REPLIED   # 관심·거절·기타 → 사람/아리 인계
            e.reply_kind = kind
        return kind

    def record_bounce(self, email: str) -> None:
        self.suppression.suppress(email, SuppressReason.BOUNCE)
        e = self._enrollments.get(email.lower())
        if e:
            e.status = EnrollStatus.STOPPED

    def record_complaint(self, email: str) -> None:
        self.suppression.suppress(email, SuppressReason.COMPLAINT)
        e = self._enrollments.get(email.lower())
        if e:
            e.status = EnrollStatus.STOPPED

    # ── 조회 ────────────────────────────────────────────────
    def enrollment(self, email: str) -> Enrollment | None:
        return self._enrollments.get(email.lower())

    def stats(self) -> dict:
        by_status: dict[str, int] = {}
        for e in self._enrollments.values():
            by_status[e.status.value] = by_status.get(e.status.value, 0) + 1
        return {
            "enrolled": len(self._enrollments), "by_status": by_status,
            "sent_total": self._total_sent,
            "today_cap": self.warmup_cap(),
            "today_sent": self._sent_by_day.get(self.now().date(), 0),
            "suppressed": len(self.suppression),
            "paused": self.paused_reason,
        }
