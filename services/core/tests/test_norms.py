"""L3 규범 메모리 — 버전 승계 · 원장 기록."""

from core.ledger import EventType, Ledger
from core.norms import NormMemory


def test_versioning_inherits_previous():
    mem = NormMemory()
    v1 = mem.update("fb:th-beauty", "ari:glowlab", "그룹 규칙 확인",
                    rules=["홍보 금지"])
    v2 = mem.add_worked("fb:th-beauty", "ari:glowlab",
                        "성분 정보성 글", "반응 상위 10%")
    assert (v1.version, v2.version) == (1, 2)
    assert v2.rules == ("홍보 금지",)               # 승계
    assert v2.worked == ("성분 정보성 글",)
    assert mem.current("fb:th-beauty") is v2
    assert len(mem.history("fb:th-beauty")) == 2    # 과거 버전 보존


def test_add_banned_records_to_ledger():
    ledger = Ledger()
    mem = NormMemory(ledger=ledger)
    mem.add_banned("fb:th-beauty", "ari:glowlab", "공동구매 모집",
                   evidence="관리자 경고 수신")
    entries = list(ledger.entries(event_type=EventType.NORM_UPDATED))
    assert len(entries) == 1
    assert entries[0].subject == "fb:th-beauty"
    assert "공동구매 모집" in entries[0].payload["banned"]
    assert ledger.verify_chain()


def test_unknown_community_empty():
    mem = NormMemory()
    assert mem.current("nope") is None
    assert mem.history("nope") == []
    assert mem.communities() == []
