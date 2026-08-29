"""억제 목록 · 재접촉 금지 — 기술스택 §7 · 재접촉·정리 에이전트(기획 §4.3).

수신거부는 전 채널 즉시 전파 대상(커넥션 core.consent와 연동점),
철회·수신거부 후 90일 재접촉 금지. 반송(bounce)은 email_status=invalid 처리와 짝.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Callable

RECONTACT_BAN_DAYS = 90


class SuppressReason(StrEnum):
    UNSUBSCRIBE = "unsubscribe"   # 영구 억제 + 90일 재접촉 금지
    BOUNCE = "bounce"             # 하드바운스 — 영구 (email_status=invalid)
    COMPLAINT = "complaint"       # 스팸 신고 — 영구 + 스팸률 집계
    MANUAL = "manual"


@dataclass
class SuppressionList:
    now: Callable[[], datetime] = lambda: datetime.now(UTC)
    _entries: dict[str, tuple[SuppressReason, datetime]] = field(default_factory=dict)
    _ban_until: dict[str, datetime] = field(default_factory=dict)

    def suppress(self, email: str, reason: SuppressReason) -> None:
        email = email.lower()
        self._entries[email] = (reason, self.now())
        if reason in (SuppressReason.UNSUBSCRIBE, SuppressReason.COMPLAINT):
            self._ban_until[email] = self.now() + timedelta(days=RECONTACT_BAN_DAYS)

    def is_suppressed(self, email: str) -> bool:
        return email.lower() in self._entries

    def recontact_allowed(self, email: str) -> bool:
        """억제 해제 후에도 90일 금지는 별도로 확인한다."""
        until = self._ban_until.get(email.lower())
        return until is None or self.now() >= until

    def reason(self, email: str) -> SuppressReason | None:
        e = self._entries.get(email.lower())
        return e[0] if e else None

    def complaint_count(self) -> int:
        return sum(1 for r, _ in self._entries.values()
                   if r == SuppressReason.COMPLAINT)

    def __len__(self) -> int:
        return len(self._entries)
