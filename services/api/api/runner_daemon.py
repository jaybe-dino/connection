"""러너 상시 가동 — API 프로세스 안에서 도는 에이전트 루프 (별도 인프라 불필요).

환경변수:
  RUNNER_ENABLED=1        켜기 (기본 꺼짐 — 데모·테스트에 영향 없음)
  RUNNER_INTERVAL_SEC=60  틱 간격
  SENDGRID_API_KEY=…      있으면 실발송(SendGrid), 없으면 드라이런(로그만)

흐름: 母 DB(creator_pool)에서 유효 이메일 후보를 시퀀스에 등록
  → 배치 생성 → OUTBOUND 게이트 접수(gate_requests) → 콘솔에서 사람이 승인
  → 다음 틱에 감지 → 발송. 리퍼럴 지급도 같은 방식으로 PAYOUT 게이트를 탄다.
"""

import json
import logging
import os
import threading
import time
from datetime import UTC, datetime

from .db import connect, ledger_append

log = logging.getLogger(__name__)

_state: dict = {"enabled": False, "ticks": 0, "last_tick": None,
                "log": [], "error": None}
_runner = None
_lock = threading.Lock()


class DbGateClient:
    """러너가 같은 프로세스의 DB 게이트를 직접 쓴다 (HTTP 왕복 불필요)."""

    def file(self, kind: str, summary: str, detail: str) -> str:
        with connect() as conn:
            row = conn.execute(
                "INSERT INTO gate_requests (brand_id, kind, summary, payload,"
                " requested_by) VALUES ('glowlab',%s,%s,%s,'ari:runner')"
                " RETURNING gate_id",
                (kind, summary,
                 json.dumps({"detail": detail}, ensure_ascii=False))).fetchone()
            ledger_append(conn, "ari:runner", "GATE_REQUESTED", str(row["gate_id"]),
                          {"kind": kind, "summary": summary})
        return str(row["gate_id"])

    def state(self, gate_id: str) -> str:
        with connect() as conn:
            r = conn.execute(
                "SELECT state FROM gate_requests WHERE gate_id=%s",
                (gate_id,)).fetchone()
        return r["state"] if r else "REJECTED"


def _make_esp():
    from harvest.outreach import DryRunEsp
    key = os.environ.get("SENDGRID_API_KEY", "")
    if key:
        from harvest.outreach.esp import SendGridEsp
        return SendGridEsp(api_key=key), "sendgrid"
    return DryRunEsp(), "dryrun"


def _enroll_from_pool(runner) -> int:
    """母 DB에서 아직 시퀀스에 없는 유효 이메일 후보를 등록. 등록 수 반환."""
    try:
        with connect() as conn:
            rows = conn.execute(
                "SELECT email, handle, country FROM creator_pool"
                " WHERE email IS NOT NULL AND email_status='valid'"
                " LIMIT 200").fetchall()
    except Exception:                       # 테이블 없는 환경(부분 배포)도 계속 돈다
        return 0
    n = 0
    for r in rows:
        locale = {"TH": "th", "VN": "vi", "KR": "ko"}.get(r["country"] or "", "en")
        if runner.outreach.enroll(r["email"], r["handle"] or "", locale=locale,
                                  context={"brand": "GLOWLAB"}):
            n += 1
    return n


def _loop(interval: int) -> None:
    global _runner
    from harvest.runner import Runner
    esp, esp_name = _make_esp()
    _runner = Runner(gates=DbGateClient(), esp=esp)
    _state["esp"] = esp_name
    log.info("runner daemon 시작 — interval %ss · esp %s", interval, esp_name)
    while True:
        try:
            with _lock:
                enrolled = _enroll_from_pool(_runner)
                ran = _runner.tick()
                polled = _runner.poll_gates()
                _state["ticks"] += 1
                _state["last_tick"] = datetime.now(UTC).isoformat()
                _state["error"] = None
                notes = ([f"등록 {enrolled}명"] if enrolled else []) + polled
                _state["log"] = (_state["log"] + [
                    f"{_state['last_tick']} · 잡 {ran or '-'} · {' / '.join(notes) or '변화 없음'}"
                ])[-30:]
        except Exception as e:              # 루프는 죽지 않는다 — 다음 틱에 재시도
            _state["error"] = str(e)
            log.exception("runner tick 실패")
        time.sleep(interval)


def start_if_enabled() -> bool:
    if os.environ.get("RUNNER_ENABLED", "") != "1":
        return False
    interval = int(os.environ.get("RUNNER_INTERVAL_SEC", "60"))
    t = threading.Thread(target=_loop, args=(interval,), daemon=True,
                         name="agent-runner")
    t.start()
    _state["enabled"] = True
    return True


def status() -> dict:
    out = dict(_state)
    if _runner is not None:
        with _lock:
            out["outreach"] = _runner.outreach.stats()
            out["referral"] = _runner.referral.stats()
    return out
