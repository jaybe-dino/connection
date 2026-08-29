"""리퍼럴 에이전트 — 코드·귀속·기기 지문·지급 조건."""

from harvest.referral import (
    DEVICE_LIMIT,
    ClaimStatus,
    ReferralEngine,
)


def test_issue_code_stable_per_owner():
    eng = ReferralEngine()
    code = eng.issue_code("c-mai")
    assert code.startswith("CX-")
    assert eng.issue_code("c-mai") == code          # 재발급 아님 — 같은 코드
    assert eng.issue_code("c-nan") != code


def test_claim_then_reward_only_after_first_submission():
    eng = ReferralEngine(reward=10_000)
    code = eng.issue_code("c-mai")
    claim = eng.claim(code, "c-new", "dev-A")
    assert claim.status == ClaimStatus.CLAIMED
    # 가입만으로는 보상 대상 아님
    assert eng.payout_batch() == []
    # 첫 제출 완료 → 보상 제안 생성
    assert eng.record_first_submission("c-new") is True
    batch = eng.payout_batch()
    assert len(batch) == 1
    assert batch[0].owner == "c-mai" and batch[0].amount == 10_000
    # 게이트 승인 후 지급 처리 → 다음 배치에서 제외
    eng.mark_paid(batch)
    assert eng.payout_batch() == []


def test_first_touch_attribution():
    eng = ReferralEngine()
    a = eng.issue_code("c-mai")
    b = eng.issue_code("c-nan")
    first = eng.claim(a, "c-new", "dev-A")
    second = eng.claim(b, "c-new", "dev-A")          # 두 번째 코드는 무시
    assert second.owner == "c-mai"
    assert first is second or second.code == a


def test_self_invite_rejected():
    eng = ReferralEngine()
    code = eng.issue_code("c-mai")
    claim = eng.claim(code, "c-mai", "dev-A")
    assert claim.status == ClaimStatus.REJECTED
    assert "자기" in claim.reason


def test_unknown_code_rejected():
    eng = ReferralEngine()
    claim = eng.claim("CX-FAKE00", "c-new", "dev-A")
    assert claim.status == ClaimStatus.REJECTED


def test_device_multi_account_suspends_code():
    eng = ReferralEngine()
    code = eng.issue_code("c-mai")
    for i in range(DEVICE_LIMIT - 1):
        assert eng.claim(code, f"c-u{i}", "dev-X").status == ClaimStatus.CLAIMED
    third = eng.claim(code, "c-u99", "dev-X")        # 3번째 계정 → 정지
    assert third.status == ClaimStatus.REJECTED
    assert eng.stats()["suspended"] == 1
    assert eng.alerts                                # 보고 발생
    # 정지된 코드는 이후 클레임도 거절
    after = eng.claim(code, "c-u100", "dev-Y")
    assert after.status == ClaimStatus.REJECTED
    assert "정지" in after.reason


def test_suspended_code_blocks_completion():
    eng = ReferralEngine()
    code = eng.issue_code("c-mai")
    eng.claim(code, "c-ok", "dev-1")
    # 다른 기기에서 다계정으로 코드 정지 유발
    for i in range(DEVICE_LIMIT):
        eng.claim(code, f"c-x{i}", "dev-BAD")
    # 정지 후엔 기존 CLAIMED 도 완주 인정 안 됨 (사기 조사 대상)
    assert eng.record_first_submission("c-ok") is False
