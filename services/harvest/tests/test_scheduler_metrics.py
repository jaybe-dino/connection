import json
from datetime import UTC, datetime, time, timedelta

from harvest.http import HttpResponse
from harvest.metrics import Metrics
from harvest.scheduler import Scheduler, register_default_jobs
from harvest.vendors.adapters import ZeroBounce


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t

    def advance(self, **kw):
        self.t += timedelta(**kw)


def test_scheduler_daily_at_0200():
    clock = Clock(datetime(2026, 9, 1, 1, 0, tzinfo=UTC))
    sched = Scheduler(now=clock)
    runs = []
    sched.register("discover_delta", lambda: runs.append(1),
                   timedelta(days=1), at=time(2, 0))
    assert sched.tick() == []            # 02:00 전
    clock.advance(hours=1, minutes=5)
    assert sched.tick() == ["discover_delta"]
    clock.advance(hours=3)
    assert sched.tick() == []            # 같은 날 재실행 없음
    clock.advance(days=1)
    assert sched.tick() == ["discover_delta"]
    assert len(runs) == 2


def test_scheduler_weekly_and_failure_isolation():
    clock = Clock(datetime(2026, 9, 1, 12, 0, tzinfo=UTC))
    sched = Scheduler(now=clock)
    ok_runs = []

    def bad():
        raise RuntimeError("vendor down")

    sched.register("contact_backfill", bad, timedelta(days=7))
    sched.register("scoring", lambda: ok_runs.append(1), timedelta(days=7))
    ran = sched.tick()
    assert set(ran) == {"contact_backfill", "scoring"}   # 실패해도 다음 잡 실행
    assert ok_runs == [1]
    status = {s["name"]: s for s in sched.status()}
    assert status["contact_backfill"]["failures"] == 1
    assert "vendor down" in status["contact_backfill"]["last_error"]
    clock.advance(days=3)
    assert sched.tick() == []            # 주간 주기 미도래
    clock.advance(days=4)
    assert set(sched.tick()) == {"contact_backfill", "scoring"}


def test_register_default_jobs_skips_missing():
    sched = Scheduler(now=Clock(datetime(2026, 9, 1, 12, 0, tzinfo=UTC)))
    register_default_jobs(sched, {"scoring": lambda: None})
    assert [s["name"] for s in sched.status()] == ["scoring"]


def test_metrics_counters_gauges_alerts():
    m = Metrics()
    m.inc("accounts_added", 120, country="TH")
    m.inc("vendor_calls", 100, vendor="scrapecreators")
    m.inc("vendor_fails", 7, vendor="scrapecreators")
    m.set("cost_per_account_krw", 150)
    m.set("email_coverage_top", 0.45)
    m.set("new_rate", 0.02, country="TH", cat="sunscreen")
    m.set("dead_letter_depth", 300)

    assert m.vendor_fail_rate("scrapecreators") == 0.07
    assert m.vendor_fail_rate("unknown") is None
    alerts = m.alerts()
    assert any("원가" in a for a in alerts)
    assert any("커버리지" in a for a in alerts)
    assert any("수렴" in a for a in alerts)
    assert any("dead_letter" in a for a in alerts)
    snap = m.snapshot()
    assert snap["counters"]["accounts_added{country=TH}"] == 120


class FakeTransport:
    def __init__(self, status_value):
        self.status_value = status_value

    def get(self, url, params=None, headers=None, timeout=30.0):
        return HttpResponse(200, json.dumps({"status": self.status_value}))

    def post(self, url, json_body=None, headers=None, timeout=30.0):
        return HttpResponse(200, "{}")


def test_zerobounce_status_mapping():
    for zb_status, expected in [("valid", "valid"), ("catch-all", "risky"),
                                ("invalid", "invalid"), ("weird", "risky")]:
        v = ZeroBounce(api_key="k", transport=FakeTransport(zb_status))
        assert v.verify("a@b.co") == expected
