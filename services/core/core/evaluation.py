"""L2 평가 하네스 — 데이터 4층 (기획안 §5).

아리의 모든 예측이 30일 뒤 자동 채점(브라이어 점수) → 가중치 갱신이 원장에 남는다.
L2 승격 기준 = 브라이어 점수. 성적표가 해자.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Callable
from uuid import uuid4

from .ledger import EventType, Ledger

SCORING_DELAY_DAYS = 30

# L2 승격 컷 (설계 기준값 — 운영 캘리브레이션). 브라이어는 낮을수록 좋다.
L2_BRIER_CUT = 0.20
L2_MIN_SAMPLES = 30


@dataclass
class Prediction:
    prediction_id: str
    channel: str              # 판단 주체·경로 (예: 'judgment:tiktokshop')
    subject: str              # creator_id 등
    probability: float        # 예측 확률 (예: 초대→완주)
    made_at: datetime
    due_at: datetime
    outcome: bool | None = None
    brier: float | None = None


class EvaluationHarness:
    def __init__(self, ledger: Ledger,
                 now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self.ledger = ledger
        self.now = now
        self._predictions: dict[str, Prediction] = {}

    # ── 기록 ────────────────────────────────────────────────
    def record(self, channel: str, subject: str, probability: float,
               evidence: dict | None = None) -> Prediction:
        if not 0.0 <= probability <= 1.0:
            raise ValueError("probability must be 0..1")
        p = Prediction(
            prediction_id=str(uuid4()), channel=channel, subject=subject,
            probability=probability, made_at=self.now(),
            due_at=self.now() + timedelta(days=SCORING_DELAY_DAYS),
        )
        self._predictions[p.prediction_id] = p
        self.ledger.append(f"ari:{channel}", EventType.JUDGMENT, subject,
                           {"prediction_id": p.prediction_id,
                            "probability": probability, **(evidence or {})})
        return p

    def record_outcome(self, prediction_id: str, outcome: bool) -> None:
        """실제 결과 도착 (완주 여부 등) — 채점은 due 시점에."""
        self._predictions[prediction_id].outcome = outcome

    # ── 채점 ────────────────────────────────────────────────
    def score_due(self) -> list[Prediction]:
        """30일 지난 예측을 채점. outcome 미도착이면 False(미완주)로 간주."""
        now = self.now()
        scored = []
        for p in self._predictions.values():
            if p.brier is not None or p.due_at > now:
                continue
            actual = bool(p.outcome)
            p.brier = round((p.probability - (1.0 if actual else 0.0)) ** 2, 4)
            self.ledger.append("system", EventType.JUDGMENT_SCORED, p.subject,
                               {"prediction_id": p.prediction_id,
                                "channel": p.channel, "outcome": actual,
                                "brier": p.brier})
            scored.append(p)
        return scored

    # ── 집계 · 승격 ─────────────────────────────────────────
    def channel_report(self, channel: str) -> dict:
        scored = [p for p in self._predictions.values()
                  if p.channel == channel and p.brier is not None]
        n = len(scored)
        mean = round(sum(p.brier for p in scored) / n, 4) if n else None
        return {
            "channel": channel, "samples": n, "mean_brier": mean,
            "l2_eligible": n >= L2_MIN_SAMPLES and mean is not None
                           and mean <= L2_BRIER_CUT,
        }

    def update_weights(self, channel: str, weights: dict[str, float],
                       reason: str) -> None:
        """가중치 갱신은 반드시 원장에 남는다."""
        self.ledger.append("system", EventType.WEIGHTS_UPDATED, channel,
                           {"weights": weights, "reason": reason})
