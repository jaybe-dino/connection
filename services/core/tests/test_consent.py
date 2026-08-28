import pytest

from core.consent import (
    ConsentKind,
    ConsentStore,
    PropagationFailed,
)
from core.ledger import EventType, Ledger


@pytest.fixture
def store():
    return ConsentStore(Ledger())


def _grant_globals(store, cid="c1"):
    for k in (ConsentKind.IDENTITY, ConsentKind.TERMS, ConsentKind.CROSS_BORDER):
        store.grant(cid, k)


def test_pass_requires_three_globals(store):
    store.grant("c1", ConsentKind.IDENTITY)
    store.grant("c1", ConsentKind.TERMS)
    assert not store.has_global_required("c1")
    store.grant("c1", ConsentKind.CROSS_BORDER)
    assert store.has_global_required("c1")


def test_second_brand_needs_only_brand_consents(store):
    _grant_globals(store)
    store.grant("c1", ConsentKind.BRAND_TERMS, "glowlab")
    store.grant("c1", ConsentKind.BRAND_DATA, "glowlab")
    assert store.can_join_brand("c1", "glowlab")
    assert not store.can_join_brand("c1", "aura")     # 재가입 없음 · 브랜드 동의만 새로
    store.grant("c1", ConsentKind.BRAND_TERMS, "aura")
    store.grant("c1", ConsentKind.BRAND_DATA, "aura")
    assert store.can_join_brand("c1", "aura")


def test_cross_brand_reco_is_optional(store):
    _grant_globals(store)
    assert not store.allows_cross_brand_reco("c1")
    store.grant("c1", ConsentKind.CROSS_BRAND_RECO)
    assert store.allows_cross_brand_reco("c1")


def test_withdraw_propagates_and_bans_recontact(store):
    _grant_globals(store)
    store.grant("c1", ConsentKind.CROSS_BRAND_RECO)
    cut = []
    store.register_propagation_hook(lambda rec: cut.append((rec.creator_id, rec.kind)))
    assert store.recontact_allowed("c1")

    store.withdraw("c1", ConsentKind.CROSS_BRAND_RECO)
    assert cut == [("c1", ConsentKind.CROSS_BRAND_RECO)]
    assert not store.allows_cross_brand_reco("c1")
    assert not store.recontact_allowed("c1")          # 90일 금지
    types = [e.event_type for e in store.ledger.entries(subject="c1")]
    assert EventType.CONSENT_WITHDRAWN in types
    assert EventType.CONSENT_PROPAGATED in types


def test_propagation_failure_freezes_outbound(store):
    _grant_globals(store)

    def bad_hook(rec):
        raise RuntimeError("cache purge failed")

    store.register_propagation_hook(bad_hook)
    with pytest.raises(PropagationFailed):
        store.withdraw("c1", ConsentKind.TERMS)
    assert store.outbound_frozen                       # 전파 실패 → 전 발송 정지


def test_withdraw_unknown_raises(store):
    with pytest.raises(KeyError):
        store.withdraw("c1", ConsentKind.TERMS)
