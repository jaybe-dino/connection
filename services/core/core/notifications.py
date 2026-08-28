"""알림 시스템 — P0 공통 레이어 (기획안 §7 '가장 급한 셋' ①).

크리에이터: 알림함 + 유형별 푸시 설정 (선정·배송·검수·정산·마감 D-3).
브랜드: 승인 대기 외부 알림 (메일·카카오·슬랙) — 채널 어댑터는 주입.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Callable
from uuid import uuid4


class NotifType(StrEnum):
    # 크리에이터
    SELECTED = "selected"            # 캠페인 선정
    SHIPPING = "shipping"            # 배송 상태 변경
    REVIEW_RESULT = "review_result"  # 검수 결과
    PAYOUT = "payout"                # 정산
    DEADLINE_D3 = "deadline_d3"      # 마감 D-3
    # 브랜드
    GATE_PENDING = "gate_pending"    # 승인 대기


class Channel(StrEnum):
    INBOX = "inbox"      # 앱 알림함 (끌 수 없음 — 기록)
    PUSH = "push"        # PWA 푸시
    EMAIL = "email"
    KAKAO = "kakao"
    SLACK = "slack"


@dataclass
class Notification:
    notif_id: str
    user_id: str
    type: NotifType
    title: str
    body: str
    created_at: str
    read: bool = False


# 외부 채널 발송 어댑터 (email/kakao/slack/push) — 실연동 전엔 수집만
Sender = Callable[[Channel, Notification], None]


class NotificationCenter:
    def __init__(self, sender: Sender | None = None) -> None:
        self._inbox: dict[str, list[Notification]] = {}
        # (user, type) → 켜진 채널. 미설정 시 기본값.
        self._prefs: dict[tuple[str, NotifType], set[Channel]] = {}
        self._sender = sender
        self.sent_log: list[tuple[Channel, Notification]] = []

    def default_channels(self, type_: NotifType) -> set[Channel]:
        if type_ == NotifType.GATE_PENDING:
            return {Channel.INBOX, Channel.EMAIL}   # 브랜드 외부 알림 기본 메일
        return {Channel.INBOX, Channel.PUSH}

    def set_pref(self, user_id: str, type_: NotifType, channels: set[Channel]) -> None:
        """유형별 on/off — 알림함(INBOX)은 항상 유지된다."""
        self._prefs[(user_id, type_)] = set(channels) | {Channel.INBOX}

    def channels_for(self, user_id: str, type_: NotifType) -> set[Channel]:
        return self._prefs.get((user_id, type_), self.default_channels(type_))

    def notify(self, user_id: str, type_: NotifType, title: str, body: str = "") -> Notification:
        n = Notification(
            notif_id=str(uuid4()), user_id=user_id, type=type_,
            title=title, body=body, created_at=datetime.now(UTC).isoformat(),
        )
        self._inbox.setdefault(user_id, []).append(n)
        for ch in sorted(self.channels_for(user_id, type_) - {Channel.INBOX}):
            self.sent_log.append((ch, n))
            if self._sender:
                self._sender(ch, n)
        return n

    def inbox(self, user_id: str, unread_only: bool = False) -> list[Notification]:
        items = self._inbox.get(user_id, [])
        return [n for n in items if not n.read] if unread_only else list(items)

    def mark_read(self, user_id: str, notif_id: str) -> None:
        for n in self._inbox.get(user_id, []):
            if n.notif_id == notif_id:
                n.read = True
                return
        raise KeyError(notif_id)
