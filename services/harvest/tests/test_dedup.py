from harvest.dedup import (
    DedupCandidate,
    DedupVerdict,
    blocking_keys,
    match,
    norm_email,
    norm_handle,
    norm_link_host,
)


def test_norm_email_gmail_rules():
    assert norm_email("Mai.Work+tag@Gmail.com") == "maiwork@gmail.com"
    assert norm_email("a.b@example.com") == "a.b@example.com"  # gmail 외 점 유지
    assert norm_email("A.B+x@example.com") == "a.b@example.com"


def test_norm_link_host():
    assert norm_link_host("https://www.linktr.ee/mai?x=1") == "linktr.ee"
    assert norm_link_host("beacons.ai/mai") == "beacons.ai"


def test_norm_handle():
    assert norm_handle("@Beauty.Mai_") == "beautymai"


def test_same_verified_email_auto_merge():
    a = DedupCandidate("c1", verified_email="mai.work@gmail.com")
    b = DedupCandidate("c2", verified_email="MaiWork@gmail.com")
    m = match(a, b)
    assert m.verdict == DedupVerdict.MERGE
    assert "same_verified_email" in m.rule_hits


def test_link_only_goes_to_human_review():
    a = DedupCandidate("c1", link_hosts=["linktr.ee/mai"])
    b = DedupCandidate("c2", link_hosts=["https://linktr.ee/other"])
    m = match(a, b)
    # 같은 최종 도메인 +0.7 → 0.6~1.0 검토 구간
    assert m.verdict == DedupVerdict.HUMAN_REVIEW
    assert m.score == 0.7


def test_similar_handle_same_country_alone_is_distinct():
    a = DedupCandidate("c1", handle="beauty.mai", country="TH")
    b = DedupCandidate("c2", handle="beauty_mai", country="TH")
    m = match(a, b)
    assert m.score == 0.4
    assert m.verdict == DedupVerdict.DISTINCT


def test_phone_plus_handle_merges():
    a = DedupCandidate("c1", handle="beauty.mai", country="TH", phone="+66 812345678")
    b = DedupCandidate("c2", handle="beauty_mai", country="TH", phone="+66812345678")
    m = match(a, b)  # 0.6 + 0.4 = 1.0
    assert m.verdict == DedupVerdict.MERGE


def test_blocking_keys():
    c = DedupCandidate(
        "c1", handle="@Beauty.Mai", verified_email="Mai.Work@gmail.com",
        link_hosts=["linktr.ee/mai"], phone="+66 812345678",
    )
    keys = blocking_keys(c)
    assert "email:maiwork@gmail.com" in keys
    assert "link:linktr.ee" in keys
    assert "handle:beautymai" in keys
    assert "phone:+66812345678" in keys
