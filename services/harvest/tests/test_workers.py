from harvest.config import ConvergenceParams, GraphExpandParams
from harvest.discover import ConvergenceDetector, DailyBudget, SeedEntry
from harvest.models import CreatorProfile, Platform
from harvest.queues import Ctx, InMemoryQueue, Q_FETCH
from harvest.store import InMemoryPool
from harvest.workers import GraphExpandWorker, HashtagDiscoverWorker


class FakeSource:
    name = "fake"

    def __init__(self, posts_by_tag=None, comments=None, suggested=None):
        self.posts_by_tag = posts_by_tag or {}
        self.comments = comments or {}
        self.suggested = suggested or {}

    def hashtag_posts(self, tag, pages=1):
        yield from self.posts_by_tag.get(tag, [])

    def post_comments(self, video_id, limit=200):
        yield from self.comments.get(video_id, [])[:limit]

    def suggested_users(self, handle, limit=30):
        yield from self.suggested.get(handle, [])[:limit]


def _ctx():
    return Ctx(country="TH", category="sunscreen")


def _seed_worker(source, pool=None, budget_limit=1000):
    pool = pool or InMemoryPool()
    queues = InMemoryQueue()
    det = ConvergenceDetector(ConvergenceParams(window_size=100))
    w = HashtagDiscoverWorker(source, pool, queues, det, DailyBudget(budget_limit))
    return w, pool, queues, det


def test_d1_emits_new_handles_once():
    src = FakeSource(posts_by_tag={"tag1": [
        {"author_handle": "a", "video_id": "v1"},
        {"author_handle": "b", "video_id": "v2"},
        {"author_handle": "a", "video_id": "v3"},   # 같은 실행 내 중복
    ]})
    w, _, queues, _ = _seed_worker(src)
    n = w.run_seed(SeedEntry(hashtags=("tag1",)), _ctx())
    assert n == 2
    handles = [m.handle for m in queues.pop(Q_FETCH, 10)]
    assert handles == ["a", "b"]


def test_d1_skips_seen_in_pool():
    pool = InMemoryPool()
    pool.upsert(CreatorProfile(platform=Platform.TIKTOK, platform_uid="1",
                               handle="a"), source="prev")
    src = FakeSource(posts_by_tag={"t": [
        {"author_handle": "a"}, {"author_handle": "b"},
    ]})
    w, _, queues, det = _seed_worker(src, pool=pool)
    n = w.run_seed(SeedEntry(hashtags=("t",)), _ctx())
    assert n == 1                            # seen 스킵
    assert det.new_rate == 0.5               # 관찰은 둘 다 들어감


def test_d1_budget_exhaustion_carries_over():
    src = FakeSource(posts_by_tag={"t": [
        {"author_handle": f"h{i}"} for i in range(10)
    ]})
    w, _, queues, _ = _seed_worker(src, budget_limit=3)
    n = w.run_seed(SeedEntry(hashtags=("t",)), _ctx())
    assert n == 3
    assert w.budget.carryover == 7


def test_d1_stops_when_converged():
    src = FakeSource(posts_by_tag={"t": [{"author_handle": "x"}]})
    w, _, queues, det = _seed_worker(src)
    det._converged = True
    assert w.run_seed(SeedEntry(hashtags=("t",)), _ctx()) == 0
    assert queues.depth(Q_FETCH) == 0


def test_d2_fanout_cap():
    params = GraphExpandParams(expand_fanout_cap=5, top_videos_per_account=2,
                               commenters_per_video=200)
    src = FakeSource(
        comments={"v1": [f"c{i}" for i in range(10)],
                  "v2": [f"d{i}" for i in range(10)]},
        suggested={"root": [f"s{i}" for i in range(10)]},
    )
    pool = InMemoryPool()
    queues = InMemoryQueue()
    det = ConvergenceDetector(ConvergenceParams(window_size=100))
    w = GraphExpandWorker(src, pool, queues, det, DailyBudget(1000), params)
    n = w.expand("root", ["v1", "v2", "v3"], _ctx())
    assert n == 5                            # 계정당 상한
    assert queues.depth(Q_FETCH) == 5


def test_d2_reaches_suggested_when_comments_thin():
    params = GraphExpandParams(expand_fanout_cap=30)
    src = FakeSource(comments={"v1": ["c1"]}, suggested={"root": ["s1", "s2"]})
    pool = InMemoryPool()
    queues = InMemoryQueue()
    det = ConvergenceDetector()
    w = GraphExpandWorker(src, pool, queues, det, DailyBudget(1000), params)
    assert w.expand("root", ["v1"], _ctx()) == 3
    handles = [m.handle for m in queues.pop(Q_FETCH, 10)]
    assert handles == ["c1", "s1", "s2"]
