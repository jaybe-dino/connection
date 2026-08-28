"""동의 관리 — 기획안 §4.1 · L4 신뢰 인프라.

커넥션 공통 필수 3종(본인 확인·약관·국외 이전) + 선택(교차 브랜드 추천).
브랜드별 동의는 셀 합류 시 별도 2종. append-only 기록.

철회는 즉시 전파 — 참조 절단 + 캐시 파기 + (접촉 동의류) 90일 재접촉 금지.
전파 실패 시 전 발송 정지(재접촉·정리 에이전트 실패 조건).
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Callable

from .ledger import EventType, Ledger

RECONTACT_BAN_DAYS = 90


class ConsentKind(StrEnum):
    # 커넥션 공통 (필수 3 + 선택 1)
    IDENTITY = "identity"                  # 본인 확인
    TERMS = "terms"                        # 약관
    CROSS_BORDER = "cross_border"          # 국외 이전
    CROSS_BRAND_RECO = "cross_brand_reco"  # 교차 브랜드 추천 (선택)
    # 브랜드별 (셀 합류 시)
    BRAND_TERMS = "brand_terms"
    BRAND_DATA = "brand_data"


REQUIRED_GLOBAL: frozenset[ConsentKind] = frozenset(
    {ConsentKind.IDENTITY, ConsentKind.TERMS, ConsentKind.CROSS_BORDER}
)
REQUIRED_PER_BRAND: frozenset[ConsentKind] = frozenset(
    {ConsentKind.BRAND_TERMS, ConsentKind.BRAND_DATA}
)


@dataclass
class ConsentRecord:
    creator_id: str
    kind: ConsentKind
    brand_id: str | None          # None = 커넥션 공통
    granted_at: str
    withdrawn_at: str | None = None

    @property
    def active(self) -> bool:
        return self.withdrawn_at is None


# 철회 전파 훅 — 각 서브시스템(母 DB·캐시·발송 큐)이 등록. 실패는 예외로 알린다.
PropagationHook = Callable[[ConsentRecord], None]


class PropagationFailed(Exception):
    """전파 실패 → 전 발송 정지 신호."""


class ConsentStore:
    def __init__(self, ledger: Ledger) -> None:
        self.ledger = ledger
        self._records: list[ConsentRecord] = []
        self._hooks: list[PropagationHook] = []
        self._recontact_ban_until: dict[str, datetime] = {}
        self.outbound_frozen = False       # 전파 실패 시 전 발송 정지

    def register_propagation_hook(self, hook: PropagationHook) -> None:
        self._hooks.append(hook)

    # ── 부여 ────────────────────────────────────────────────
    def grant(self, creator_id: str, kind: ConsentKind,
              brand_id: str | None = None) -> ConsentRecord:
        rec = ConsentRecord(creator_id, kind, brand_id,
                            granted_at=datetime.now(UTC).isoformat())
        self._records.append(rec)
        self.ledger.append(f"user:{creator_id}", EventType.CONSENT_GRANTED, creator_id,
                           {"kind": kind.value, "brand": brand_id})
        return rec

    def _active(self, creator_id: str, brand_id: str | None = None) -> set[ConsentKind]:
        return {r.kind for r in self._records
                if r.creator_id == creator_id and r.brand_id == brand_id and r.active}

    def has_global_required(self, creator_id: str) -> bool:
        """패스 발급 조건 — 공통 필수 3종."""
        return REQUIRED_GLOBAL <= self._active(creator_id, None)

    def can_join_brand(self, creator_id: str, brand_id: str) -> bool:
        """두 번째 브랜드부터 재가입 없음 — 브랜드별 동의 2종만 새로."""
        return self.has_global_required(creator_id) and \
            REQUIRED_PER_BRAND <= self._active(creator_id, brand_id)

    def allows_cross_brand_reco(self, creator_id: str) -> bool:
        return ConsentKind.CROSS_BRAND_RECO in self._active(creator_id, None)

    # ── 철회 · 전파 ──────────────────────────────────────────
    def withdraw(self, creator_id: str, kind: ConsentKind,
                 brand_id: str | None = None) -> ConsentRecord:
        rec = next((r for r in self._records
                    if r.creator_id == creator_id and r.kind == kind
                    and r.brand_id == brand_id and r.active), None)
        if rec is None:
            raise KeyError(f"활성 동의 없음: {creator_id}/{kind.value}/{brand_id}")
        rec.withdrawn_at = datetime.now(UTC).isoformat()
        self.ledger.append(f"user:{creator_id}", EventType.CONSENT_WITHDRAWN, creator_id,
                           {"kind": kind.value, "brand": brand_id})
        self._propagate(rec)
        return rec

    def _propagate(self, rec: ConsentRecord) -> None:
        """즉시 전파 — 하나라도 실패하면 전 발송 정지."""
        for hook in self._hooks:
            try:
                hook(rec)
            except Exception as e:
                self.outbound_frozen = True
                raise PropagationFailed(str(e)) from e
        self._recontact_ban_until[rec.creator_id] = \
            datetime.now(UTC) + timedelta(days=RECONTACT_BAN_DAYS)
        self.ledger.append("system", EventType.CONSENT_PROPAGATED, rec.creator_id,
                           {"kind": rec.kind.value,
                            "recontact_ban_days": RECONTACT_BAN_DAYS})

    def recontact_allowed(self, creator_id: str) -> bool:
        """수신거부·철회 후 90일 재접촉 금지."""
        until = self._recontact_ban_until.get(creator_id)
        return until is None or datetime.now(UTC) >= until
