"""HTTP 트랜스포트 · 레이트 리미터 · 재시도 (기술스택 명세 §6).

의존성 없이 stdlib urllib로 구현. 벤더 어댑터는 Transport에만 의존하므로
테스트에서는 FakeTransport를 주입한다.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Protocol

from .config import FetchParams


@dataclass(frozen=True)
class HttpResponse:
    status: int
    body: str

    def json(self) -> Any:
        return json.loads(self.body)


class Transport(Protocol):
    def get(self, url: str, params: Mapping[str, Any] | None = None,
            headers: Mapping[str, str] | None = None,
            timeout: float = 30.0) -> HttpResponse: ...


class UrllibTransport:
    """프로덕션 기본 트랜스포트 — 환경 프록시(HTTPS_PROXY)를 그대로 따른다."""

    def get(self, url: str, params: Mapping[str, Any] | None = None,
            headers: Mapping[str, str] | None = None,
            timeout: float = 30.0) -> HttpResponse:
        if params:
            qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
            url = f"{url}?{qs}"
        req = urllib.request.Request(url, headers=dict(headers or {}))
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return HttpResponse(resp.status, resp.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            return HttpResponse(e.code, e.read().decode("utf-8", "replace"))


class TokenBucket:
    """벤더별 레이트 준수 — ToS·쿼터의 선을 지킨다."""

    def __init__(self, rate_per_sec: float, capacity: float | None = None,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self.rate = rate_per_sec
        self.capacity = capacity if capacity is not None else max(1.0, rate_per_sec)
        self._tokens = self.capacity
        self._clock = clock
        self._last = clock()

    def _refill(self) -> None:
        now = self._clock()
        self._tokens = min(self.capacity, self._tokens + (now - self._last) * self.rate)
        self._last = now

    def try_acquire(self, n: float = 1.0) -> bool:
        self._refill()
        if self._tokens >= n:
            self._tokens -= n
            return True
        return False

    def wait_time(self, n: float = 1.0) -> float:
        """다음 토큰까지 남은 시간(초)."""
        self._refill()
        if self._tokens >= n:
            return 0.0
        return (n - self._tokens) / self.rate

    def slow_down(self, factor: float = 0.5) -> None:
        """429 수신 시 감속 (§9)."""
        self.rate = max(0.01, self.rate * factor)


def with_retry(fn: Callable[[], HttpResponse],
               params: FetchParams | None = None,
               sleep: Callable[[float], None] = time.sleep,
               retriable: Callable[[HttpResponse], bool] = lambda r: r.status >= 500,
               ) -> HttpResponse:
    """재시도 3회 · 지수 백오프 2s→8s→30s (§4.3). 429/404는 호출측 정책이므로 기본 제외."""
    p = params or FetchParams()
    resp = fn()
    for attempt in range(p.max_retries):
        if not retriable(resp):
            return resp
        sleep(p.backoff_seconds[min(attempt, len(p.backoff_seconds) - 1)])
        resp = fn()
    return resp
