"""모니터링 지표 — 구현상세 명세 §11 대시보드.

카운터·게이지 수집기 + 경보 조건 평가. Prometheus 도입 전까지의 자체 구현이며
`snapshot()` 결과를 그대로 익스포트하면 된다.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

# 경보 조건 (§11) — 설계 기준값
COST_PER_ACCOUNT_MAX_KRW = 120.0
EMAIL_COVERAGE_TOP_MIN = 0.60
NEW_RATE_CONVERGED = 0.03


@dataclass
class Metrics:
    counters: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    gauges: dict[str, float] = field(default_factory=dict)

    # ── 기록 ────────────────────────────────────────────────
    def inc(self, name: str, value: float = 1.0, **labels: str) -> None:
        self.counters[self._key(name, labels)] += value

    def set(self, name: str, value: float, **labels: str) -> None:
        self.gauges[self._key(name, labels)] = value

    @staticmethod
    def _key(name: str, labels: dict[str, str]) -> str:
        if not labels:
            return name
        tag = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
        return f"{name}{{{tag}}}"

    # ── 파생 · 경보 ─────────────────────────────────────────
    def vendor_fail_rate(self, vendor: str) -> float | None:
        calls = self.counters.get(f"vendor_calls{{vendor={vendor}}}", 0)
        fails = self.counters.get(f"vendor_fails{{vendor={vendor}}}", 0)
        return round(fails / calls, 4) if calls else None

    def alerts(self) -> list[str]:
        out = []
        cpa = self.gauges.get("cost_per_account_krw")
        if cpa is not None and cpa > COST_PER_ACCOUNT_MAX_KRW:
            out.append(f"계정당 원가 {cpa:.0f}원 > {COST_PER_ACCOUNT_MAX_KRW:.0f}원 — 그래프 예산 점검")
        cov = self.gauges.get("email_coverage_top")
        if cov is not None and cov < EMAIL_COVERAGE_TOP_MIN:
            out.append(f"상위 등급 이메일 커버리지 {cov:.0%} < 60%")
        dl = self.gauges.get("dead_letter_depth")
        if dl is not None and dl > 100:
            out.append(f"dead_letter 적체 {dl:.0f}건 — 벤더·파서 장애 의심")
        for key, val in list(self.gauges.items()):
            if key.startswith("new_rate{") and val < NEW_RATE_CONVERGED:
                out.append(f"{key} = {val:.1%} — 전수 근접(수렴)")
        return out

    def snapshot(self) -> dict[str, Any]:
        return {
            "counters": dict(self.counters),
            "gauges": dict(self.gauges),
            "alerts": self.alerts(),
        }
