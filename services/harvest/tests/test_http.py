from harvest.config import FetchParams
from harvest.http import HttpResponse, TokenBucket, with_retry


def test_token_bucket_basic():
    t = [0.0]
    b = TokenBucket(rate_per_sec=1.0, capacity=2, clock=lambda: t[0])
    assert b.try_acquire() and b.try_acquire()
    assert not b.try_acquire()            # 소진
    t[0] += 1.0                           # 1초 경과 → 1토큰
    assert b.try_acquire()
    assert not b.try_acquire()


def test_token_bucket_slow_down():
    t = [0.0]
    b = TokenBucket(rate_per_sec=10.0, capacity=1, clock=lambda: t[0])
    b.try_acquire()
    b.slow_down()                          # 429 → 절반 감속
    assert b.rate == 5.0
    assert b.wait_time() == 1 / 5.0


def test_with_retry_backoff_sequence():
    calls = []
    sleeps = []
    responses = [HttpResponse(500, ""), HttpResponse(502, ""), HttpResponse(200, "{}")]

    def fn():
        calls.append(1)
        return responses[len(calls) - 1]

    resp = with_retry(fn, FetchParams(), sleep=sleeps.append)
    assert resp.status == 200
    assert sleeps == [2.0, 8.0]            # 지수 백오프


def test_with_retry_gives_up_after_max():
    sleeps = []
    resp = with_retry(lambda: HttpResponse(500, ""), FetchParams(), sleep=sleeps.append)
    assert resp.status == 500
    assert sleeps == [2.0, 8.0, 30.0]      # 3회 후 포기


def test_with_retry_does_not_retry_4xx():
    sleeps = []
    resp = with_retry(lambda: HttpResponse(404, ""), FetchParams(), sleep=sleeps.append)
    assert resp.status == 404
    assert sleeps == []
