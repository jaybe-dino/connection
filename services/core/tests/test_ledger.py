from core.ledger import EventType, GENESIS_HASH, Ledger, _Tamper


def test_append_and_chain():
    lg = Ledger()
    e1 = lg.append("system", EventType.SNS_VERIFIED, "creator-1", {"platform": "tiktok"})
    e2 = lg.append("user:creator-1", EventType.PROFILE_UPDATED, "creator-1",
                   {"field": "address"})
    assert e1.seq == 1 and e1.prev_hash == GENESIS_HASH
    assert e2.prev_hash == e1.hash
    assert lg.verify_chain()


def test_filter_by_subject_and_type():
    lg = Ledger()
    lg.append("system", EventType.SNS_VERIFIED, "c1")
    lg.append("system", EventType.SNS_VERIFIED, "c2")
    lg.append("user:c1", EventType.PROFILE_UPDATED, "c1")
    assert len(list(lg.entries(subject="c1"))) == 2
    assert len(list(lg.entries(event_type=EventType.SNS_VERIFIED))) == 2
    assert len(list(lg.entries(subject="c1", event_type=EventType.PROFILE_UPDATED))) == 1


def test_tamper_detected():
    lg = Ledger()
    lg.append("system", EventType.SNS_VERIFIED, "c1")
    lg.append("system", EventType.JUDGMENT, "c1", {"verdict": "fit"})
    assert lg.verify_chain()
    _Tamper(lg).tamper(2, payload={"verdict": "unfit"})  # 판단 조작 시도
    assert not lg.verify_chain()


def test_hash_deterministic_over_payload_order():
    lg1, lg2 = Ledger(), Ledger()
    e1 = lg1.append("a", EventType.JUDGMENT, "s", {"x": 1, "y": 2})
    e2 = lg2.append("a", EventType.JUDGMENT, "s", {"y": 2, "x": 1})
    # ts가 달라 해시는 다를 수 있으나, 같은 재료면 같은 해시
    h1 = e1.compute_hash(e1.seq, e1.ts, e1.actor, e1.event_type.value,
                         e1.subject, {"y": 2, "x": 1}, e1.prev_hash)
    assert h1 == e1.hash
