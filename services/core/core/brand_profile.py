"""브랜드 프로필 — 모집의 뿌리 (기획안 §4.2). 버전 관리.

소스 3개: ① 사이트 학습(6축 추출, 각 항목 출처 표기 + 확인·수정)
          ② 온보딩 5문항  ③ 운영 피드백(반려·추가 사유 축적)
소비처 4곳: 4축 판정 적합도 · 초대문/공고 개인화 · 채널 우선순위 · 금지어 필터.
학습 없이는 모집을 시작할 수 없다.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

from .ledger import EventType, Ledger


class FieldSource(StrEnum):
    SITE_LEARNING = "site_learning"      # 제품 상세·리뷰·인스타 90일
    ONBOARDING_QA = "onboarding_qa"      # 5문항
    OPS_FEEDBACK = "ops_feedback"        # 운영 피드백


# 사이트 학습 6축 (가입 위저드 ④)
SITE_AXES = ("positioning", "hero_products", "ingredient_keywords",
             "price_range", "customer_language", "tone")

# 온보딩 5문항 — 사이트가 말해주지 않는 것
ONBOARDING_QUESTIONS = ("brand_one_liner", "ideal_creator", "banned_words",
                        "sample_criteria", "voice")


@dataclass(frozen=True)
class ProfileField:
    value: str
    source: FieldSource
    evidence: str = ""          # 출처 표기 (URL·리뷰 인용 등)
    confirmed: bool = False     # 브랜드 확인·수정 단계 통과 여부


@dataclass(frozen=True)
class BrandProfileVersion:
    brand_id: str
    version: int
    fields: dict[str, ProfileField]
    created_at: str
    note: str = ""

    def banned_words(self) -> list[str]:
        f = self.fields.get("banned_words")
        return [w.strip() for w in f.value.split(",") if w.strip()] if f else []


class LearningIncomplete(Exception):
    """학습 없이는 모집 시작 불가."""


class BrandProfileStore:
    def __init__(self, ledger: Ledger) -> None:
        self.ledger = ledger
        self._versions: dict[str, list[BrandProfileVersion]] = {}

    def publish_version(self, brand_id: str, fields: dict[str, ProfileField],
                        note: str = "") -> BrandProfileVersion:
        versions = self._versions.setdefault(brand_id, [])
        v = BrandProfileVersion(
            brand_id=brand_id, version=len(versions) + 1, fields=dict(fields),
            created_at=datetime.now(UTC).isoformat(), note=note,
        )
        versions.append(v)
        self.ledger.append(f"brand:{brand_id}", EventType.BRAND_PROFILE_VERSIONED,
                           brand_id, {"version": v.version, "note": note,
                                      "fields": sorted(fields)})
        return v

    def latest(self, brand_id: str) -> BrandProfileVersion | None:
        versions = self._versions.get(brand_id)
        return versions[-1] if versions else None

    def history(self, brand_id: str) -> list[BrandProfileVersion]:
        return list(self._versions.get(brand_id, []))

    def apply_feedback(self, brand_id: str, field_name: str, value: str,
                       evidence: str) -> BrandProfileVersion:
        """운영 피드백(반려·추가 사유) → 새 버전 발행."""
        latest = self.latest(brand_id)
        if latest is None:
            raise LearningIncomplete(f"{brand_id}: 프로필 v1 없음")
        fields = dict(latest.fields)
        fields[field_name] = ProfileField(
            value=value, source=FieldSource.OPS_FEEDBACK,
            evidence=evidence, confirmed=True,
        )
        return self.publish_version(brand_id, fields, note=f"ops_feedback:{field_name}")

    def recruiting_ready(self, brand_id: str) -> bool:
        """모집 시작 조건 — 5문항 전부 확인된 v1 이상."""
        latest = self.latest(brand_id)
        if latest is None:
            return False
        for q in ONBOARDING_QUESTIONS:
            f = latest.fields.get(q)
            if f is None or not f.confirmed:
                return False
        return True

    def require_recruiting_ready(self, brand_id: str) -> BrandProfileVersion:
        if not self.recruiting_ready(brand_id):
            raise LearningIncomplete(
                f"{brand_id}: 아리 학습(5문항 확인) 미완 — 모집을 시작할 수 없다")
        latest = self.latest(brand_id)
        assert latest is not None
        return latest
