"""리퍼럴 운영 에이전트 — 기획 §4.3.

셀 멤버의 초대를 보상 사기 없이 운영:
  · 보상은 피초대자가 **첫 제출을 끝내야** 지급 (가입 아님)
  · 자기 초대·중복 계정은 기기 지문으로 차단
  · 같은 기기 3계정 이상 → 해당 코드 정지 + 보고 (실패 조건)
  · 지급은 항상 승인 — 주 1회 묶음으로 PAYOUT 게이트에 올린다
  · 귀속은 최초 접점 우선 (구현상세 L1 귀속 규칙)
"""

import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Callable

DEVICE_LIMIT = 3            # 같은 기기 계정 수 임계
DEFAULT_REWARD = 10_000     # 보상액 (설계 기준값)


class ClaimStatus(StrEnum):
    CLAIMED = "claimed"            # 코드 입력됨 · 첫 제출 전
    COMPLETED = "completed"        # 첫 제출 완료 → 보상 대상
    REJECTED = "rejected"          # 자기 초대·중복·정지 코드


@dataclass
class Claim:
    invitee: str
    code: str
    owner: str
    device: str
    status: ClaimStatus
    reason: str = ""
    claimed_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True)
class RewardProposal:
    owner: str
    invitee: str
    amount: int


class ReferralEngine:
    def __init__(self, reward: int = DEFAULT_REWARD,
                 now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self.reward = reward
        self.now = now
        self._codes: dict[str, dict] = {}          # code → {owner, suspended}
        self._claims: dict[str, Claim] = {}        # invitee → Claim (최초 접점)
        self._device_accounts: dict[str, set[str]] = {}
        self._paid: set[str] = set()               # 지급 완료된 invitee
        self.alerts: list[str] = []

    # ── 코드 ────────────────────────────────────────────────
    def issue_code(self, owner: str) -> str:
        existing = next((c for c, v in self._codes.items()
                         if v["owner"] == owner and not v["suspended"]), None)
        if existing:
            return existing
        code = "CX-" + secrets.token_hex(3).upper()
        self._codes[code] = {"owner": owner, "suspended": False}
        return code

    def code_of(self, owner: str) -> str | None:
        return next((c for c, v in self._codes.items() if v["owner"] == owner), None)

    # ── 클레임 (가입 시 코드 입력) ──────────────────────────
    def claim(self, code: str, invitee: str, device_fingerprint: str) -> Claim:
        meta = self._codes.get(code)
        if meta is None:
            return self._reject(invitee, code, "", device_fingerprint, "없는 코드")
        owner = meta["owner"]
        if meta["suspended"]:
            return self._reject(invitee, code, owner, device_fingerprint, "정지된 코드")
        if owner == invitee:
            return self._reject(invitee, code, owner, device_fingerprint, "자기 초대")
        if invitee in self._claims:
            # 최초 접점 우선 — 두 번째 코드는 무시하고 기존 귀속 유지
            return self._claims[invitee]

        accounts = self._device_accounts.setdefault(device_fingerprint, set())
        accounts.add(invitee)
        if len(accounts) >= DEVICE_LIMIT:
            meta["suspended"] = True
            self.alerts.append(
                f"기기 지문 {device_fingerprint[:8]}…에서 계정 {len(accounts)}개 — "
                f"코드 {code} 정지")
            return self._reject(invitee, code, owner, device_fingerprint,
                                "동일 기기 다계정 — 코드 정지")

        claim = Claim(invitee=invitee, code=code, owner=owner,
                      device=device_fingerprint, status=ClaimStatus.CLAIMED)
        self._claims[invitee] = claim
        return claim

    def _reject(self, invitee: str, code: str, owner: str, device: str,
                reason: str) -> Claim:
        return Claim(invitee=invitee, code=code, owner=owner, device=device,
                     status=ClaimStatus.REJECTED, reason=reason)

    # ── 완주 · 보상 ─────────────────────────────────────────
    def record_first_submission(self, invitee: str) -> bool:
        """검수 통과된 첫 제출 — 이때부터 보상 대상."""
        claim = self._claims.get(invitee)
        if claim is None or claim.status != ClaimStatus.CLAIMED:
            return False
        if self._codes.get(claim.code, {}).get("suspended"):
            return False
        claim.status = ClaimStatus.COMPLETED
        return True

    def payout_batch(self) -> list[RewardProposal]:
        """주 1회 묶음 — 지급은 항상 승인이므로 제안만 만든다 (PAYOUT 게이트행)."""
        out = []
        for claim in self._claims.values():
            if claim.status == ClaimStatus.COMPLETED and claim.invitee not in self._paid:
                out.append(RewardProposal(claim.owner, claim.invitee, self.reward))
        return out

    def mark_paid(self, proposals: list[RewardProposal]) -> None:
        """게이트 승인 후 호출."""
        for p in proposals:
            self._paid.add(p.invitee)

    def stats(self) -> dict:
        by = {s.value: 0 for s in ClaimStatus}
        for c in self._claims.values():
            by[c.status.value] += 1
        return {"codes": len(self._codes),
                "suspended": sum(1 for v in self._codes.values() if v["suspended"]),
                "claims": by, "paid": len(self._paid), "alerts": list(self.alerts)}
