"""지속 수집 루프 — 구현상세 명세 §10 스케줄.

잡 레지스트리 + 주기 판정. 외부 cron/Temporal 없이도 `tick()` 호출만으로
도는 단순 스케줄러 — 프로덕션은 cron이 1분마다 `harvest scheduler tick`을 부르거나
Temporal schedule로 대체한다. 잡 실패는 다른 잡을 막지 않는다.

§10 기본 잡 주기:
  신규 발견 델타(매일 02:00) · 경쟁사 워치(매일) · 커뮤니티 파싱(매일)
  지표 리프레시(7일 상위/30일 하위) · 연락처 보강(주간) · 학습 채점(주간)
  이메일 재검증(90일)
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, time, timedelta
from typing import Callable

log = logging.getLogger(__name__)


@dataclass
class Job:
    name: str
    fn: Callable[[], object]
    every: timedelta                       # 주기
    at: time | None = None                 # 특정 시각(UTC) 고정 시 (예: 02:00)
    last_run: datetime | None = None
    last_error: str | None = None
    runs: int = 0
    failures: int = 0

    def due(self, now: datetime) -> bool:
        if self.last_run is None:
            # at이 지정된 잡은 첫 실행도 해당 시각 이후에만
            return self.at is None or now.timetz().replace(tzinfo=None) >= self.at
        nxt = self.last_run + self.every
        if self.at is not None:
            nxt = datetime.combine((self.last_run + self.every).date(), self.at, UTC)
        return now >= nxt


class Scheduler:
    def __init__(self, now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self.now = now
        self._jobs: dict[str, Job] = {}

    def register(self, name: str, fn: Callable[[], object],
                 every: timedelta, at: time | None = None) -> Job:
        job = Job(name=name, fn=fn, every=every, at=at)
        self._jobs[name] = job
        return job

    def tick(self) -> list[str]:
        """due인 잡 전부 실행. 실행된 잡 이름 반환. 실패는 기록하고 계속."""
        ran = []
        now = self.now()
        for job in self._jobs.values():
            if not job.due(now):
                continue
            try:
                job.fn()
                job.last_error = None
            except Exception as e:  # noqa: BLE001 — 한 잡의 실패가 루프를 못 막게
                job.last_error = str(e)
                job.failures += 1
                log.exception("job %s failed", job.name)
            job.last_run = now
            job.runs += 1
            ran.append(job.name)
        return ran

    def status(self) -> list[dict]:
        return [{
            "name": j.name, "every": str(j.every),
            "at": j.at.isoformat() if j.at else None,
            "last_run": j.last_run.isoformat() if j.last_run else None,
            "runs": j.runs, "failures": j.failures, "last_error": j.last_error,
        } for j in self._jobs.values()]


def register_default_jobs(sched: Scheduler, jobs: dict[str, Callable[[], object]]) -> None:
    """§10 기본 스케줄 — 콜러블만 꽂으면 된다. 없는 잡은 건너뜀."""
    spec: list[tuple[str, timedelta, time | None]] = [
        ("discover_delta", timedelta(days=1), time(2, 0)),    # 신규 발견 델타 02:00
        ("competitor_watch", timedelta(days=1), None),        # 경쟁사 워치
        ("community_parse", timedelta(days=1), None),         # 커뮤니티 파싱
        ("metrics_refresh_top", timedelta(days=7), None),     # 상위 등급 리프레시
        ("metrics_refresh_rest", timedelta(days=30), None),   # 하위 등급 리프레시
        ("contact_backfill", timedelta(days=7), None),        # 연락처 보강
        ("scoring", timedelta(days=7), None),                 # 학습 채점(브라이어)
        ("email_reverify", timedelta(days=90), None),         # 이메일 재검증
    ]
    for name, every, at in spec:
        if name in jobs:
            sched.register(name, jobs[name], every, at)
