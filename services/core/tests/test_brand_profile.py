import pytest

from core.brand_profile import (
    BrandProfileStore,
    FieldSource,
    LearningIncomplete,
    ONBOARDING_QUESTIONS,
    ProfileField,
)
from core.ledger import Ledger


@pytest.fixture
def store():
    return BrandProfileStore(Ledger())


def _full_fields(confirmed=True):
    fields = {
        q: ProfileField(value=f"answer-{q}", source=FieldSource.ONBOARDING_QA,
                        confirmed=confirmed)
        for q in ONBOARDING_QUESTIONS
    }
    fields["positioning"] = ProfileField(
        value="저자극 선케어", source=FieldSource.SITE_LEARNING,
        evidence="https://glowlab.example/products", confirmed=True,
    )
    return fields


def test_versioning(store):
    v1 = store.publish_version("glowlab", _full_fields())
    v2 = store.apply_feedback("glowlab", "banned_words", "미백, 화이트닝",
                              evidence="검수 반려 3건")
    assert (v1.version, v2.version) == (1, 2)
    assert store.latest("glowlab").version == 2
    assert len(store.history("glowlab")) == 2
    assert store.latest("glowlab").fields["banned_words"].source == FieldSource.OPS_FEEDBACK


def test_recruiting_gate_requires_confirmed_five_questions(store):
    assert not store.recruiting_ready("glowlab")
    store.publish_version("glowlab", _full_fields(confirmed=False))
    assert not store.recruiting_ready("glowlab")       # 확인 안 된 답변으론 불가
    with pytest.raises(LearningIncomplete):
        store.require_recruiting_ready("glowlab")
    store.publish_version("glowlab", _full_fields(confirmed=True))
    assert store.recruiting_ready("glowlab")


def test_banned_words_parsing(store):
    fields = _full_fields()
    fields["banned_words"] = ProfileField("미백, 화이트닝 , 기미제거",
                                          FieldSource.ONBOARDING_QA, confirmed=True)
    v = store.publish_version("glowlab", fields)
    assert v.banned_words() == ["미백", "화이트닝", "기미제거"]


def test_feedback_without_v1_raises(store):
    with pytest.raises(LearningIncomplete):
        store.apply_feedback("nobrand", "voice", "x", "y")
