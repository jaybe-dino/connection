"""에이전트 실행 루프 — 스윕·메일·리퍼럴·정리를 스케줄러에 조립하는 러너.

핵심 계약: **바깥으로 나가는 모든 것은 게이트를 거친다.**
  메일 배치  → OUTBOUND 게이트 접수 → 승인 폴링 → 승인 시에만 send_batch
  리퍼럴 지급 → PAYOUT 게이트 접수  → 승인 시에만 mark_paid
  보류·거절  → 배치 폐기, 외부 무통지 (게이트 의미론)

게이트는 API 서버(POST /gates · GET /gates/{id})가 원본이고, 러너는 클라이언트다.
프로덕션: `python -m harvest.cli runner --api https://…` 를 cron/supervisor가 돌린다.
키 없이도 DryRunEsp + 인메모리 게이트로 전체 루프가 실연된다.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Callable, Protocol

from .outreach import DryRunEsp, OutreachEngine, SequencePaused
from .outreach.esp import Esp
from .referral import ReferralEngine, RewardProposal
from .scheduler import Scheduler

log = logging.getLogger(__name__)


class GateClient(Protocol):
    """API 게이트의 최소 계약 — file→접수, state→PENDING/APPROVED/HELD/REJECTED."""

    def file(self, kind: str, summary: str, detail: str) -> str: ...
    def state(self, gate_id: str) -> str: ...


class HttpGateClient:
    """실서버 연결 — services/api 의 POST /gates · GET /gates/{id}."""

    def __init__(self, base_url: str, transport=None) -> None:
        if transport is None:
            from .http import UrllibTransport
            transport = UrllibTransport()
        self.base = base_url.rstrip("/")
        self.t = transport

    def file(self, kind: str, summary: str, detail: str) -> str:
        r = self.t.post(f"{self.base}/gates", json_body={
            "kind": kind, "summary": summary, "detail": detail,
            "requested_by": "ari:runner"})
        return r.json()["gateId"]

    def state(self, gate_id: str) -> str:
        return self.t.get(f"{self.base}/gates/{gate_id}").json()["state"]


class MemoryGateClient:
    """드라이런·테스트용 — approve()/hold() 를 사람이 대신 눌러준다."""

    def __init__(self, auto_approve: bool = False) -> None:
        self.auto_approve = auto_approve
        self._gates: dict[str, dict] = {}

    def file(self, kind: str, summary: str, detail: str) -> str:
        gid = f"g{len(self._gates) + 1}"
        state = "APPROVED" if self.auto_approve else "PENDING"
        self._gates[gid] = {"kind": kind, "summary": summary, "state": state}
        return gid

    def state(self, gate_id: str) -> str:
        return self._gates[gate_id]["state"]

    def approve(self, gate_id: str) -> None:
        self._gates[gate_id]["state"] = "APPROVED"

    def hold(self, gate_id: str) -> None:
        self._gates[gate_id]["state"] = "HELD"


@dataclass
class _PendingGate:
    gate_id: str
    payload: object                          # batch_id | list[RewardProposal]


class Runner:
    """스케줄러 위에 잡을 얹고, 게이트 대기 상태를 들고 다니는 조립체."""

    def __init__(self, gates: GateClient,
                 outreach: OutreachEngine | None = None,
                 esp: Esp | None = None,
                 referral: ReferralEngine | None = None,
                 sweep: Callable[[], object] | None = None,
                 clean: Callable[[], object] | None = None,
                 now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self.gates = gates
        self.outreach = outreach or OutreachEngine(now=now)
        self.esp = esp or DryRunEsp()
        self.referral = referral or ReferralEngine(now=now)
        self.now = now
        self.scheduler = Scheduler(now=now)
        self._mail_gate: _PendingGate | None = None
        self._payout_gate: _PendingGate | None = None
        self.log: list[str] = []

        self.scheduler.register("mail", self.mail_tick, every=timedelta(hours=1))
        self.scheduler.register("referral_payout", self.payout_tick,
                                every=timedelta(days=7))
        if sweep:
            self.scheduler.register("sweep", sweep, every=timedelta(days=1))
        if clean:
            self.scheduler.register("clean", clean, every=timedelta(days=1))

    # ── 메일: build → 게이트 → 승인 시 발송 ─────────────────
    def mail_tick(self) -> str:
        if self._mail_gate is not None:
            state = self.gates.state(self._mail_gate.gate_id)
            if state == "PENDING":
                return "메일: 게이트 승인 대기"
            gate, self._mail_gate = self._mail_gate, None
            if state == "APPROVED":
                sent = self.outreach.send_batch(str(gate.payload), self.esp)
                msg = f"메일: 게이트 승인 → {sent}통 발송"
            else:
                msg = f"메일: 게이트 {state} → 배치 폐기 (외부 무통지)"
            self.log.append(msg)
            return msg

        try:
            batch = self.outreach.build_batch()
        except SequencePaused as e:
            msg = f"메일: 중단됨 — {e} (사람 확인 필요)"
            self.log.append(msg)
            return msg
        if not batch.steps:
            return "메일: 보낼 대상 없음"
        gate_id = self.gates.file(
            "OUTBOUND",
            f"콜드 메일 {len(batch.steps)}건",
            "\n".join(f"{s.email} · step{s.step} · {s.subject}"
                      for s in batch.steps[:20]))
        self._mail_gate = _PendingGate(gate_id, batch.batch_id)
        msg = f"메일: 배치 {len(batch.steps)}건 → OUTBOUND 게이트 {gate_id} 접수"
        self.log.append(msg)
        return msg

    # ── 리퍼럴: 주 1회 지급 묶음 → PAYOUT 게이트 ────────────
    def payout_tick(self) -> str:
        if self._payout_gate is not None:
            state = self.gates.state(self._payout_gate.gate_id)
            if state == "PENDING":
                return "지급: 게이트 승인 대기"
            gate, self._payout_gate = self._payout_gate, None
            if state == "APPROVED":
                proposals = gate.payload
                self.referral.mark_paid(proposals)      # type: ignore[arg-type]
                msg = f"지급: 게이트 승인 → {len(proposals)}건 지급 처리"  # type: ignore[arg-type]
            else:
                msg = f"지급: 게이트 {state} → 이번 주 지급 없음"
            self.log.append(msg)
            return msg

        proposals: list[RewardProposal] = self.referral.payout_batch()
        if not proposals:
            return "지급: 대상 없음"
        total = sum(p.amount for p in proposals)
        gate_id = self.gates.file(
            "PAYOUT",
            f"리퍼럴 보상 {len(proposals)}건 · ₩{total:,}",
            "\n".join(f"{p.owner} ← {p.invitee} · ₩{p.amount:,}" for p in proposals))
        self._payout_gate = _PendingGate(gate_id, proposals)
        msg = f"지급: {len(proposals)}건 → PAYOUT 게이트 {gate_id} 접수"
        self.log.append(msg)
        return msg

    # ── 루프 ────────────────────────────────────────────────
    def tick(self) -> list[str]:
        return self.scheduler.tick()

    def poll_gates(self) -> list[str]:
        """스케줄 주기와 무관하게 게이트 대기 건만 즉시 재확인 (승인 반영용)."""
        out = []
        if self._mail_gate is not None:
            out.append(self.mail_tick())
        if self._payout_gate is not None:
            out.append(self.payout_tick())
        return out
