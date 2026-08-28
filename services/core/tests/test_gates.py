import pytest

from core.gates import (
    GateEngine,
    GateError,
    GateKind,
    GateState,
    InvalidTransition,
    NotAuthorized,
    Role,
    TeamMember,
)
from core.ledger import EventType, Ledger


@pytest.fixture
def engine():
    eng = GateEngine(Ledger())
    eng.register_member("glowlab", TeamMember("kim", Role.APPROVER))
    eng.register_member("glowlab", TeamMember("lee", Role.OPERATOR))
    eng.register_member(
        "glowlab",
        TeamMember("pii-only", Role.APPROVER, frozenset({GateKind.PII})),
    )
    return eng


def _req(engine, kind=GateKind.OUTBOUND):
    return engine.request("glowlab", kind, "메일 80건 발송",
                          {"recipients": 80}, requested_by="ari:glowlab")


def test_nothing_happens_before_approval(engine):
    executed = []
    engine.register_executor(GateKind.OUTBOUND, lambda r: executed.append(r.gate_id))
    req = _req(engine)
    assert req.state == GateState.PENDING
    assert executed == []                      # 누르기 전엔 아무 일도 없다
    engine.approve(req.gate_id, "kim")
    assert executed == [req.gate_id]
    assert engine.get(req.gate_id).executed


def test_hold_has_no_external_effect(engine):
    executed = []
    engine.register_executor(GateKind.OUTBOUND, lambda r: executed.append(1))
    req = _req(engine)
    engine.hold(req.gate_id, "lee", note="문구 재검토")
    assert executed == []
    assert engine.get(req.gate_id).state == GateState.HELD
    # 보류 후에도 승인 가능
    engine.approve(req.gate_id, "kim")
    assert executed == [1]


def test_operator_cannot_approve(engine):
    engine.register_executor(GateKind.OUTBOUND, lambda r: None)
    req = _req(engine)
    with pytest.raises(NotAuthorized):
        engine.approve(req.gate_id, "lee")


def test_gate_kind_scoped_approver(engine):
    engine.register_executor(GateKind.OUTBOUND, lambda r: None)
    engine.register_executor(GateKind.PII, lambda r: None)
    out = _req(engine, GateKind.OUTBOUND)
    pii = _req(engine, GateKind.PII)
    with pytest.raises(NotAuthorized):
        engine.approve(out.gate_id, "pii-only")
    assert engine.approve(pii.gate_id, "pii-only").state == GateState.APPROVED


def test_non_member_rejected(engine):
    engine.register_executor(GateKind.OUTBOUND, lambda r: None)
    req = _req(engine)
    with pytest.raises(NotAuthorized):
        engine.approve(req.gate_id, "stranger")


def test_no_executor_means_no_approval(engine):
    req = _req(engine)
    with pytest.raises(GateError):
        engine.approve(req.gate_id, "kim")
    # 실패해도 실행 안 됨 · 재결정 가능 상태 유지 확인
    assert not engine.get(req.gate_id).executed


def test_no_double_decision(engine):
    engine.register_executor(GateKind.OUTBOUND, lambda r: None)
    req = _req(engine)
    engine.approve(req.gate_id, "kim")
    with pytest.raises(InvalidTransition):
        engine.reject(req.gate_id, "kim", "늦음")


def test_pending_inbox_lists_pending_and_held(engine):
    engine.register_executor(GateKind.OUTBOUND, lambda r: None)
    r1 = _req(engine)
    r2 = _req(engine)
    r3 = _req(engine)
    engine.hold(r2.gate_id, "lee")
    engine.approve(r3.gate_id, "kim")
    ids = {r.gate_id for r in engine.pending("glowlab")}
    assert ids == {r1.gate_id, r2.gate_id}


def test_ledger_records_lifecycle(engine):
    engine.register_executor(GateKind.PAYOUT, lambda r: None)
    req = _req(engine, GateKind.PAYOUT)
    engine.approve(req.gate_id, "kim")
    types = [e.event_type for e in engine.ledger.entries(subject=req.gate_id)]
    assert types == [EventType.GATE_REQUESTED, EventType.GATE_APPROVED,
                     EventType.GATE_EXECUTED]
    assert engine.ledger.verify_chain()
