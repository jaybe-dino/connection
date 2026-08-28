"""게이트 엔진 — 기획안 §4.7 · 페이지맵 공통 레이어.

PII · PAYOUT · OUTBOUND · PUBLISH — 자율 등급과 무관하게 항상 사람이 승인.
원칙:
  - 누르기 전엔 아무 일도 일어나지 않는다 (실행은 승인 시에만, 지연 실행 콜백)
  - 보류 시 크리에이터에게 아무 안내도 나가지 않는다 (외부 부수효과 없음)
  - 모든 전이는 원장에 기록된다
  - 승인 권한은 역할 + 게이트별 지정 (P0 팀 권한)
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Callable
from uuid import uuid4

from .ledger import EventType, Ledger


class GateKind(StrEnum):
    PII = "PII"              # 개인정보 제공 (배송 주소 전달 등)
    PAYOUT = "PAYOUT"        # 정산 실행
    OUTBOUND = "OUTBOUND"    # 메일·DM 등 외부 발송
    PUBLISH = "PUBLISH"      # 브랜드 이름의 공개 게시


class GateState(StrEnum):
    PENDING = "PENDING"
    HELD = "HELD"            # 보류 — 외부로 아무것도 나가지 않음
    APPROVED = "APPROVED"    # 승인 → 실행됨
    REJECTED = "REJECTED"


class Role(StrEnum):
    APPROVER = "approver"
    OPERATOR = "operator"
    VIEWER = "viewer"


class GateError(Exception):
    pass


class NotAuthorized(GateError):
    pass


class InvalidTransition(GateError):
    pass


@dataclass
class TeamMember:
    """브랜드 팀 멤버 — P0 팀 권한. approver라도 게이트별 지정을 좁힐 수 있다."""

    member_id: str
    role: Role
    gate_kinds: frozenset[GateKind] = frozenset(GateKind)  # 승인 가능한 게이트

    def can_approve(self, kind: GateKind) -> bool:
        return self.role == Role.APPROVER and kind in self.gate_kinds


@dataclass
class GateRequest:
    gate_id: str
    brand_id: str
    kind: GateKind
    summary: str                       # 승인함 카드에 보일 요약
    payload: dict[str, Any]            # 실행에 필요한 데이터 (수신자·금액·본문 등)
    requested_by: str                  # 보통 'ari:{brand}'
    state: GateState = GateState.PENDING
    decided_by: str | None = None
    decided_at: str | None = None
    hold_note: str | None = None       # 내부 메모 — 밖으로 안 나감
    executed: bool = False


# 승인 시 실제 부수효과를 일으키는 실행기 — 게이트 종류별 등록
Executor = Callable[[GateRequest], None]


class GateEngine:
    def __init__(self, ledger: Ledger) -> None:
        self.ledger = ledger
        self._requests: dict[str, GateRequest] = {}
        self._executors: dict[GateKind, Executor] = {}
        self._members: dict[tuple[str, str], TeamMember] = {}  # (brand, member) → TeamMember

    # ── 팀 권한 ──────────────────────────────────────────────
    def register_member(self, brand_id: str, member: TeamMember) -> None:
        self._members[(brand_id, member.member_id)] = member

    def _member(self, brand_id: str, member_id: str) -> TeamMember:
        m = self._members.get((brand_id, member_id))
        if m is None:
            raise NotAuthorized(f"{member_id}: {brand_id} 팀 멤버 아님")
        return m

    # ── 실행기 ──────────────────────────────────────────────
    def register_executor(self, kind: GateKind, executor: Executor) -> None:
        self._executors[kind] = executor

    # ── 요청 · 전이 ──────────────────────────────────────────
    def request(self, brand_id: str, kind: GateKind, summary: str,
                payload: dict[str, Any], requested_by: str) -> GateRequest:
        req = GateRequest(
            gate_id=str(uuid4()), brand_id=brand_id, kind=kind,
            summary=summary, payload=payload, requested_by=requested_by,
        )
        self._requests[req.gate_id] = req
        self.ledger.append(requested_by, EventType.GATE_REQUESTED, req.gate_id,
                           {"brand": brand_id, "kind": kind.value, "summary": summary})
        return req

    def pending(self, brand_id: str) -> list[GateRequest]:
        """승인함 — PENDING·HELD만."""
        return [r for r in self._requests.values()
                if r.brand_id == brand_id and r.state in (GateState.PENDING, GateState.HELD)]

    def _require_decidable(self, req: GateRequest) -> None:
        if req.state not in (GateState.PENDING, GateState.HELD):
            raise InvalidTransition(f"{req.state}에서는 결정 불가")

    def approve(self, gate_id: str, member_id: str) -> GateRequest:
        """승인 = 실행. 실행기가 없으면 실행 없이 실패한다(부분 상태 방지)."""
        req = self._requests[gate_id]
        self._require_decidable(req)
        member = self._member(req.brand_id, member_id)
        if not member.can_approve(req.kind):
            raise NotAuthorized(f"{member_id}: {req.kind.value} 승인 권한 없음")

        executor = self._executors.get(req.kind)
        if executor is None:
            raise GateError(f"{req.kind.value} 실행기 미등록 — 승인 불가")

        req.state = GateState.APPROVED
        req.decided_by = member_id
        req.decided_at = datetime.now(UTC).isoformat()
        self.ledger.append(f"user:{member_id}", EventType.GATE_APPROVED, gate_id,
                           {"kind": req.kind.value})
        executor(req)          # 누르기 전엔 아무 일도 일어나지 않는다 — 여기서만 실행
        req.executed = True
        self.ledger.append("system", EventType.GATE_EXECUTED, gate_id,
                           {"kind": req.kind.value})
        return req

    def hold(self, gate_id: str, member_id: str, note: str | None = None) -> GateRequest:
        """보류 — 크리에이터에게 아무 안내도 나가지 않는다. 내부 메모만."""
        req = self._requests[gate_id]
        self._require_decidable(req)
        self._member(req.brand_id, member_id)   # 팀 멤버면 보류 가능
        req.state = GateState.HELD
        req.hold_note = note
        self.ledger.append(f"user:{member_id}", EventType.GATE_HELD, gate_id, {})
        return req

    def reject(self, gate_id: str, member_id: str, reason: str) -> GateRequest:
        req = self._requests[gate_id]
        self._require_decidable(req)
        member = self._member(req.brand_id, member_id)
        if not member.can_approve(req.kind):
            raise NotAuthorized(f"{member_id}: {req.kind.value} 결정 권한 없음")
        req.state = GateState.REJECTED
        req.decided_by = member_id
        req.decided_at = datetime.now(UTC).isoformat()
        self.ledger.append(f"user:{member_id}", EventType.GATE_REJECTED, gate_id,
                           {"reason": reason})
        return req

    def get(self, gate_id: str) -> GateRequest:
        return self._requests[gate_id]
