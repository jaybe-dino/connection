"""append-only 원장 — 데이터 4층 중 L4 신뢰 인프라 (기획안 §5).

판단 근거 · 채점 · 동의 · 프로필 수정 이력 전부 기록.
각 엔트리는 직전 해시를 물고 있는 해시 체인 — 사후 변조가 드러난다.
크리에이터 열람·이의 제기(복구도 기록) 대상이므로 삭제·수정 API가 없다.
"""

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Iterator


class EventType(StrEnum):
    # 계정 · 가입
    SNS_VERIFIED = "SNS_VERIFIED"            # OAuth 검증 완료
    PROFILE_UPDATED = "PROFILE_UPDATED"      # 본인 수정 → 실시간 반영
    # 동의
    CONSENT_GRANTED = "CONSENT_GRANTED"
    CONSENT_WITHDRAWN = "CONSENT_WITHDRAWN"
    CONSENT_PROPAGATED = "CONSENT_PROPAGATED"  # 철회 전파 완료(참조 절단·캐시 파기)
    # 게이트
    GATE_REQUESTED = "GATE_REQUESTED"
    GATE_APPROVED = "GATE_APPROVED"
    GATE_HELD = "GATE_HELD"
    GATE_REJECTED = "GATE_REJECTED"
    GATE_EXECUTED = "GATE_EXECUTED"
    # 아리 판단 · 채점 (L2 평가 하네스)
    JUDGMENT = "JUDGMENT"                    # 4축 판정 등 예측 + 근거
    JUDGMENT_SCORED = "JUDGMENT_SCORED"      # 30일 채점(브라이어) → 가중치 갱신
    WEIGHTS_UPDATED = "WEIGHTS_UPDATED"
    # dedup · DB 위생
    IDENTITY_MERGED = "IDENTITY_MERGED"
    IDENTITY_MERGE_REVERTED = "IDENTITY_MERGE_REVERTED"
    FIELD_PURGED = "FIELD_PURGED"            # 필드 파기 예약 실행
    # 이의 제기
    DISPUTE_OPENED = "DISPUTE_OPENED"
    DISPUTE_RESOLVED = "DISPUTE_RESOLVED"
    # 브랜드 프로필
    BRAND_PROFILE_VERSIONED = "BRAND_PROFILE_VERSIONED"


GENESIS_HASH = "0" * 64


def _canonical(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


@dataclass(frozen=True)
class LedgerEntry:
    seq: int
    ts: str                      # ISO8601 UTC
    actor: str                   # 'ari:{brand}' | 'user:{id}' | 'system'
    event_type: EventType
    subject: str                 # 대상 (creator_id, gate_id, brand_id …)
    payload: dict[str, Any]
    prev_hash: str
    hash: str

    @staticmethod
    def compute_hash(seq: int, ts: str, actor: str, event_type: str,
                     subject: str, payload: dict[str, Any], prev_hash: str) -> str:
        material = f"{seq}|{ts}|{actor}|{event_type}|{subject}|{_canonical(payload)}|{prev_hash}"
        return hashlib.sha256(material.encode("utf-8")).hexdigest()


class Ledger:
    """인메모리 append-only 원장. 프로덕션은 Postgres 테이블(002_core.sql)과 동일 계약."""

    def __init__(self) -> None:
        self._entries: list[LedgerEntry] = []

    def append(self, actor: str, event_type: EventType, subject: str,
               payload: dict[str, Any] | None = None) -> LedgerEntry:
        seq = len(self._entries) + 1
        ts = datetime.now(UTC).isoformat()
        prev = self._entries[-1].hash if self._entries else GENESIS_HASH
        payload = payload or {}
        h = LedgerEntry.compute_hash(seq, ts, actor, event_type.value, subject, payload, prev)
        entry = LedgerEntry(seq, ts, actor, event_type, subject, payload, prev, h)
        self._entries.append(entry)
        return entry

    def entries(self, subject: str | None = None,
                event_type: EventType | None = None) -> Iterator[LedgerEntry]:
        for e in self._entries:
            if subject is not None and e.subject != subject:
                continue
            if event_type is not None and e.event_type != event_type:
                continue
            yield e

    def verify_chain(self) -> bool:
        """전 체인 무결성 검증 — 변조되면 False."""
        prev = GENESIS_HASH
        for i, e in enumerate(self._entries, start=1):
            if e.seq != i or e.prev_hash != prev:
                return False
            expected = LedgerEntry.compute_hash(
                e.seq, e.ts, e.actor, e.event_type.value, e.subject, e.payload, e.prev_hash)
            if e.hash != expected:
                return False
            prev = e.hash
        return True

    def __len__(self) -> int:
        return len(self._entries)


@dataclass
class _Tamper:
    """테스트 편의를 위한 변조 도우미 — 프로덕션 코드에서 사용 금지."""

    ledger: Ledger
    field: str = ""

    def tamper(self, seq: int, **changes: Any) -> None:
        i = seq - 1
        old = self.ledger._entries[i]
        data = {**old.__dict__, **changes}
        self.ledger._entries[i] = LedgerEntry(**data)
