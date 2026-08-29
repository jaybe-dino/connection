"""4축 판정 — 기획안 §4.3 공통 판정.

축: ① 진짜 사람 ② 제품 적합 ③ 협찬 과다 ④ 중복.
결과는 하나의 후보 큐로 — 협찬 과다는 차단이 아니라 '과금 제외'(커뮤니티 유지).
모든 판단·근거는 원장 기록 대상이며, 30일 뒤 채점(core.evaluation)과 짝.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from .score import detect_step_growth


class Verdict(StrEnum):
    INVITE = "invite"                    # 후보 큐 → 셀 충원
    HOLD = "hold"                        # 신호 부족 — 재수집 후 재판정
    BILLING_EXCLUDED = "billing_excluded"  # 협찬 과다 — 차단 아님
    REJECT = "reject"                    # 가짜·중복


@dataclass(frozen=True)
class AxisScore:
    axis: str
    score: float          # 0~1 (높을수록 통과)
    evidence: str


@dataclass(frozen=True)
class Judgment:
    creator_id: str
    verdict: Verdict
    fit_probability: float               # 초대→완주 예측 확률 (채점 대상)
    axes: tuple[AxisScore, ...]

    def to_ledger_payload(self) -> dict:
        return {
            "verdict": self.verdict.value,
            "fit_probability": self.fit_probability,
            "axes": [{"axis": a.axis, "score": round(a.score, 3),
                      "evidence": a.evidence} for a in self.axes],
        }


@dataclass
class BrandFit:
    """브랜드 프로필에서 오는 적합 기준 (소비처 ① 4축 판정 적합도)."""

    categories: tuple[str, ...] = ()      # 예: ("beauty", "skincare", "suncare")
    banned_words: tuple[str, ...] = ()
    target_countries: tuple[str, ...] = ()


def _axis_real_person(rec: dict[str, Any]) -> AxisScore:
    """진짜 사람 — 계단 급증·팔로워/팔로잉 비율·참여율 이상."""
    score = 1.0
    reasons = []
    series = [(d["date"], d["count"]) for d in rec.get("follower_series", [])]
    if detect_step_growth(series):
        score -= 0.6
        reasons.append("계단형 팔로워 급증")
    followers = rec.get("followers") or 0
    following = rec.get("following") or 0
    if followers > 1000 and following > 0 and following / followers > 3:
        score -= 0.3
        reasons.append("팔로잉/팔로워 비정상")
    er = rec.get("engagement_rate")
    if followers > 10_000 and er is not None and er < 0.003:
        score -= 0.4
        reasons.append(f"참여율 {er:.4f} 비정상 저조")
    return AxisScore("real_person", max(0.0, score), "; ".join(reasons) or "이상 신호 없음")


def _axis_product_fit(rec: dict[str, Any], brand: BrandFit) -> AxisScore:
    """제품 적합 — 카테고리·국가 일치, 금지어."""
    score = 0.5
    reasons = []
    cats = set(rec.get("category") or [])
    if brand.categories and cats & set(brand.categories):
        score += 0.4
        reasons.append(f"카테고리 일치 {sorted(cats & set(brand.categories))}")
    if brand.target_countries:
        if rec.get("country") in brand.target_countries:
            score += 0.1
            reasons.append(f"타깃 국가 {rec.get('country')}")
        else:
            score -= 0.4
            reasons.append(f"국가 불일치 {rec.get('country')}")
    bio = (rec.get("bio") or "").lower()
    hit = [w for w in brand.banned_words if w.lower() in bio]
    if hit:
        score -= 0.5
        reasons.append(f"금지어 {hit}")
    return AxisScore("product_fit", min(1.0, max(0.0, score)),
                     "; ".join(reasons) or "판단 신호 부족")


def _axis_sponsor_load(rec: dict[str, Any]) -> AxisScore:
    ratio = rec.get("sponsor_ratio_90d")
    if ratio is None:
        return AxisScore("sponsor_load", 0.7, "협찬 비율 미측정")
    if ratio > 0.4:
        return AxisScore("sponsor_load", 0.2, f"협찬 비율 {ratio:.0%} > 40%")
    return AxisScore("sponsor_load", 1.0 - ratio, f"협찬 비율 {ratio:.0%}")


def _axis_duplicate(rec: dict[str, Any]) -> AxisScore:
    if rec.get("identity_group_conflict"):
        return AxisScore("duplicate", 0.0, "동일인 그룹 내 기존 멤버 존재")
    return AxisScore("duplicate", 1.0, "중복 없음")


def judge(rec: dict[str, Any], brand: BrandFit) -> Judgment:
    """레코드 1건 4축 판정. rec은 母 DB 행(dict)."""
    axes = (
        _axis_real_person(rec),
        _axis_product_fit(rec, brand),
        _axis_sponsor_load(rec),
        _axis_duplicate(rec),
    )
    by = {a.axis: a for a in axes}

    if by["duplicate"].score < 0.5 or by["real_person"].score < 0.4:
        verdict = Verdict.REJECT
    elif by["sponsor_load"].score < 0.4:
        verdict = Verdict.BILLING_EXCLUDED   # 차단이 아니라 과금 제외
    elif by["product_fit"].score >= 0.6:
        verdict = Verdict.INVITE
    else:
        verdict = Verdict.HOLD

    # 초대→완주 예측 확률 — 4축 가중 결합 (30일 채점으로 캘리브레이션)
    fit = (0.25 * by["real_person"].score + 0.45 * by["product_fit"].score
           + 0.15 * by["sponsor_load"].score + 0.15 * by["duplicate"].score)
    return Judgment(creator_id=str(rec.get("creator_id", "")),
                    verdict=verdict, fit_probability=round(fit, 3), axes=axes)
