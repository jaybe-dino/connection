"""큐 · 이벤트 계약 — 구현상세 명세 §2.

단계 간 통신은 큐 메시지로. 메시지 스키마와 소비자를 여기 고정한다.
백엔드는 인메모리(테스트·MVP) → Redis Streams/SQS로 교체 가능하도록
`QueueBackend` 프로토콜만 의존한다.
"""

from collections import defaultdict, deque
from dataclasses import asdict, dataclass, field
from typing import Any, Protocol

# 큐 이름 상수
Q_DISCOVER = "q.discover"     # {source, handle?, seed?, ctx:{country,category}} → Fetch 워커
Q_FETCH = "q.fetch"           # {handle, platform, ctx, attempt} → Fetch 워커
Q_ENRICH = "q.enrich"         # {creator_id, bio, links} → Enrich 워커
Q_EXPAND = "q.expand"         # {creator_id, video_ids[], ctx} → Discover(그래프) 워커
Q_DEDUP = "q.dedup"           # {creator_id, blocking_keys[]} → Dedup 워커
Q_RECHECK = "q.recheck"       # 국가 판정 conf < 0.6
Q_DEAD_LETTER = "q.dead_letter"  # 실패 메시지 + 사유 → 재처리·알림


@dataclass(frozen=True)
class Ctx:
    """국가·카테고리 파드 컨텍스트."""

    country: str
    category: str


@dataclass
class FetchMsg:
    handle: str
    platform: str
    ctx: Ctx
    source: str
    attempt: int = 0


@dataclass
class EnrichMsg:
    creator_id: str
    bio: str | None
    links: list[str] = field(default_factory=list)


@dataclass
class ExpandMsg:
    creator_id: str
    video_ids: list[str]
    ctx: Ctx


@dataclass
class DeadLetter:
    queue: str
    message: dict[str, Any]
    reason: str


class QueueBackend(Protocol):
    def emit(self, queue: str, message: Any) -> None: ...
    def pop(self, queue: str, n: int = 1) -> list[Any]: ...
    def depth(self, queue: str) -> int: ...


class InMemoryQueue:
    """테스트·단일 프로세스 MVP용. 프로덕션은 Redis Streams/SQS 어댑터로 교체."""

    def __init__(self) -> None:
        self._queues: dict[str, deque[Any]] = defaultdict(deque)

    def emit(self, queue: str, message: Any) -> None:
        self._queues[queue].append(message)

    def pop(self, queue: str, n: int = 1) -> list[Any]:
        q = self._queues[queue]
        out = []
        while q and len(out) < n:
            out.append(q.popleft())
        return out

    def depth(self, queue: str) -> int:
        return len(self._queues[queue])


def to_dict(msg: Any) -> dict[str, Any]:
    return asdict(msg)
