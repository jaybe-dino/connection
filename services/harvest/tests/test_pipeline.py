from harvest.fetch import FetchOutcome, VendorRouter
from harvest.models import CreatorProfile, Platform
from harvest.pipeline import FetchWorker
from harvest.queues import (
    Ctx,
    FetchMsg,
    InMemoryQueue,
    Q_DEAD_LETTER,
    Q_ENRICH,
    Q_EXPAND,
)
from harvest.store import InMemoryPool
from harvest.vendors.base import NotFound, QuotaExceeded, RateLimited


def _profile(handle="mai", uid="1", videos=()):
    return CreatorProfile(
        platform=Platform.TIKTOK, platform_uid=uid, handle=handle,
        followers=1000, bio="hi", top_video_ids=list(videos),
    )


class StubVendor:
    def __init__(self, name, result=None, error=None):
        self.name = name
        self.result = result
        self.error = error
        self.calls = 0

    def user_info(self, handle):
        self.calls += 1
        if self.error:
            raise self.error
        return self.result


def test_router_first_vendor_wins():
    v1 = StubVendor("a", result=_profile())
    v2 = StubVendor("b", result=_profile())
    r = VendorRouter([v1, v2]).fetch_profile("mai")
    assert r.outcome == FetchOutcome.OK and r.vendor == "a"
    assert v2.calls == 0


def test_router_falls_back_on_rate_limit():
    v1 = StubVendor("a", error=RateLimited("429"))
    v2 = StubVendor("b", result=_profile())
    r = VendorRouter([v1, v2]).fetch_profile("mai")
    assert r.outcome == FetchOutcome.OK and r.vendor == "b"


def test_router_disables_vendor_on_quota():
    v1 = StubVendor("a", error=QuotaExceeded("402"))
    v2 = StubVendor("b", result=_profile())
    router = VendorRouter([v1, v2])
    router.fetch_profile("mai")
    router.fetch_profile("mai2")
    assert v1.calls == 1  # 비활성 후 재호출 없음


def test_router_not_found_is_terminal():
    v1 = StubVendor("a", error=NotFound("404"))
    v2 = StubVendor("b", result=_profile())
    r = VendorRouter([v1, v2]).fetch_profile("mai")
    assert r.outcome == FetchOutcome.EXCLUDED
    assert v2.calls == 0  # 다른 벤더도 묻지 않는다


def test_router_all_fail_dead_letter():
    v1 = StubVendor("a", error=RateLimited("429"))
    v2 = StubVendor("b", error=RateLimited("429"))
    r = VendorRouter([v1, v2]).fetch_profile("mai")
    assert r.outcome == FetchOutcome.DEAD_LETTER
    assert len(r.errors) == 2


def _worker(vendor):
    pool = InMemoryPool()
    queues = InMemoryQueue()
    return FetchWorker(VendorRouter([vendor]), pool, queues), pool, queues


def test_fetch_worker_upserts_and_emits():
    w, pool, queues = _worker(StubVendor("a", result=_profile(videos=["v1", "v2"])))
    msg = FetchMsg(handle="mai", platform="tiktok",
                   ctx=Ctx("TH", "sunscreen"), source="test")
    cid = w.handle(msg)
    assert cid and len(pool) == 1
    assert queues.depth(Q_ENRICH) == 1
    assert queues.depth(Q_EXPAND) == 1


def test_fetch_worker_idempotent_on_fresh_record():
    vendor = StubVendor("a", result=_profile())
    w, pool, _ = _worker(vendor)
    msg = FetchMsg(handle="mai", platform="tiktok",
                   ctx=Ctx("TH", "sunscreen"), source="test")
    assert w.handle(msg) is not None
    assert w.handle(msg) is None      # fresh → skip
    assert vendor.calls == 1
    assert len(pool) == 1


def test_fetch_worker_dead_letter_flow():
    w, pool, queues = _worker(StubVendor("a", error=RateLimited("429")))
    msg = FetchMsg(handle="mai", platform="tiktok",
                   ctx=Ctx("TH", "sunscreen"), source="test")
    assert w.handle(msg) is None
    assert len(pool) == 0
    assert queues.depth(Q_DEAD_LETTER) == 1
