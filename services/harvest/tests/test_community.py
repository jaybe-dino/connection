"""커뮤니티 에이전트 — 고지·링크 금지·주 1회·경고 30일·게이트 필수."""

from datetime import UTC, datetime, timedelta

from harvest.community import (
    STRIKE_BAN_DAYS,
    CommunityAgent,
    PostRequest,
)


class FakeNorms:
    """core.norms.NormMemory 계약의 최소 대역."""

    def __init__(self):
        self.banned_calls = []
        self._banned = ("공동구매 모집",)

    def current(self, community):
        class V:
            rules = ("홍보 금지",)
            worked = ("성분 정보성 글",)
            banned = self._banned
        return V()

    def add_banned(self, community, updated_by, item, evidence):
        self.banned_calls.append((community, item))


def make_agent(**kw):
    clock = {"t": datetime(2026, 9, 1, tzinfo=UTC)}
    agent = CommunityAgent(now=lambda: clock["t"], **kw)
    return agent, clock


def test_draft_starts_with_disclosure_thai_first():
    agent, _ = make_agent()
    d = agent.draft("fb:th-beauty", "선케어 성분", "SPF50 성분 비교 정보입니다")
    assert d.ready
    assert d.body.splitlines()[0].startswith("#โฆษณา")   # 태국어 고지 첫 줄


def test_invite_link_blocks_draft():
    agent, _ = make_agent()
    d = agent.draft("fb:th-beauty", "이벤트", "가입은 https://bit.ly/x 로!")
    assert not d.ready
    assert any("링크" in v for v in d.violations)
    assert agent.request_post(d) is None                 # 위반 초안은 게이트행 불가


def test_norm_banned_item_flagged():
    agent, _ = make_agent(norms=FakeNorms())
    d = agent.draft("fb:th-beauty", "공지", "이번 주 공동구매 모집 합니다")
    assert any("공동구매" in v for v in d.violations)


def test_weekly_cap_one_post():
    agent, clock = make_agent()
    d = agent.draft("fb:th-beauty", "정보", "성분 정리")
    req = agent.request_post(d)
    assert isinstance(req, PostRequest) and req.kind == "OUTBOUND"
    agent.record_posted("fb:th-beauty")
    # 같은 주 두 번째 → 차단
    assert not agent.can_post("fb:th-beauty")
    assert "주 1회" in agent.block_reason("fb:th-beauty")
    # 8일 뒤엔 다시 가능
    clock["t"] += timedelta(days=8)
    assert agent.can_post("fb:th-beauty")


def test_strike_bans_30_days_and_updates_norms():
    norms = FakeNorms()
    agent, clock = make_agent(norms=norms)
    agent.record_strike("fb:th-beauty", "홍보성 글 삭제됨")
    assert not agent.can_post("fb:th-beauty")
    assert norms.banned_calls == [("fb:th-beauty", "홍보성 글 삭제됨")]
    # 30일 경과 전엔 계속 중단
    clock["t"] += timedelta(days=STRIKE_BAN_DAYS - 1)
    assert not agent.can_post("fb:th-beauty")
    clock["t"] += timedelta(days=2)
    assert agent.can_post("fb:th-beauty")


def test_posting_always_via_gate_request():
    agent, _ = make_agent()
    d = agent.draft("fb:vn-skincare", "thông tin", "so sánh thành phần",
                    language="vi")
    req = agent.request_post(d)
    assert req.kind == "OUTBOUND"
    assert req.detail.startswith("#quảngcáo")
