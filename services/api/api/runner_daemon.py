"""러너 상시 가동 — API 프로세스 안 상주 잡 (별도 인프라 불필요).

두 루프는 완전히 분리되어 있다(검수 지적 반영):

① Gmail 운영 루프 — RUNNER_ENABLED=1 또는 GMAIL_OPS_ENABLED=1 이면 시작.
   하는 일: 브랜드별 수신 동기화(읽기 동의 계정만) + "사람이 승인한" 아웃리치
   배치의 발송 재개 + 월마감 청구서 생성(결제 없음). 자동 모집·자동 초안·
   레거시 발송은 절대 하지 않는다.

② 레거시 데모 루프(GLOWLAB 하드코딩 자동 모집·게이트 접수) —
   LEGACY_DEMO_RUNNER=1 을 명시해야만, 그리고 실발송 키(GOOGLE/SENDGRID)가
   전혀 없는 순수 데모 환경에서만 시작한다. 운영에서는 기동 자체가 거부된다.

  RUNNER_INTERVAL_SEC=60  틱 간격 (두 루프 공용)
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


class BrandGmailEsp:
    """브랜드에 연결된 지메일이 있으면 그 주소로 발송, 없으면 내부 ESP로 폴백.

    지메일 트랙은 1:1 아웃리치용 — 일일 한도(워밍업 곡선) 초과 시에도 폴백한다.
    """

    def __init__(self, inner, brand_id: str = "glowlab") -> None:
        self.inner, self.brand_id = inner, brand_id
        self.name = f"gmail+{inner.name}"

    def send(self, email) -> str:
        from .routes_gmail import send_via_brand_gmail
        try:
            with connect() as conn:
                sent = send_via_brand_gmail(conn, self.brand_id, email.to,
                                            email.subject, email.body_text)
            if sent:
                return f"{sent['via']}:{sent['fromEmail']}"
        except Exception:
            log.exception("지메일 발송 실패 — 기본 ESP로 폴백")
        return self.inner.send(email)


def _make_esp():
    from harvest.outreach import DryRunEsp
    key = os.environ.get("SENDGRID_API_KEY", "")
    if key:
        from harvest.outreach.esp import SendGridEsp
        return BrandGmailEsp(SendGridEsp(api_key=key)), "gmail+sendgrid"
    return BrandGmailEsp(DryRunEsp()), "gmail+dryrun"


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


_gmail_ops = {"lastSync": {}, "lastResume": {}, "synced": 0, "resumed": 0,
              "errors": []}
SYNC_EVERY_SEC, RESUME_EVERY_SEC = 600, 900


def _gmail_ops_tick() -> list[str]:
    """화면 비의존 Gmail 운영 — 수신 동기화 + 승인 배치 발송 재개.

    실모드(구글 키 존재)에서만 동작. 브랜드별 최소 간격(동기화 10분·재개 15분)
    으로 보수적으로 돌며, 실패는 기록만 하고 다음 틱에 재시도한다.
    가짜 열람·회신을 만들지 않고, 미승인 배치를 보내지 않는다."""
    from . import routes_gmail as gmail
    if gmail._demo_mode():
        return []
    notes: list[str] = []
    now = time.time()
    try:
        with connect() as conn:
            brands = [r["brand_id"] for r in conn.execute(
                "SELECT DISTINCT brand_id FROM gmail_accounts"
                " WHERE state='connected'"
                "   AND scopes LIKE %s", ("%gmail.readonly%",)).fetchall()]
            resumable = [r["brand_id"] for r in conn.execute(
                "SELECT DISTINCT b.brand_id FROM outreach_batches b"
                " JOIN outreach_recipients r USING (batch_id)"
                " WHERE b.state='approved' AND r.state='pending'").fetchall()]
    except Exception as e:
        _gmail_ops["errors"] = ([f"scan: {e}"] + _gmail_ops["errors"])[:5]
        return []
    for brand in brands:
        if now - _gmail_ops["lastSync"].get(brand, 0) < SYNC_EVERY_SEC:
            continue
        _gmail_ops["lastSync"][brand] = now
        try:
            from . import gmail_sync
            r = gmail_sync.sync(brand)
            _gmail_ops["synced"] += 1
            notes.append(f"sync {brand}: {r.get('imported', 0)}건")
        except Exception as e:                     # 동의 철회·토큰 만료 등 — 기록만
            _gmail_ops["errors"] = ([f"sync {brand}: {type(e).__name__}"]
                                    + _gmail_ops["errors"])[:5]
    for brand in resumable:
        if now - _gmail_ops["lastResume"].get(brand, 0) < RESUME_EVERY_SEC:
            continue
        _gmail_ops["lastResume"][brand] = now
        try:
            from .routes_outreach import deliver_pending
            with connect() as conn:
                batches = conn.execute(
                    "SELECT DISTINCT b.batch_id FROM outreach_batches b"
                    " JOIN outreach_recipients r USING (batch_id)"
                    " WHERE b.brand_id=%s AND b.state='approved'"
                    "   AND r.state='pending' LIMIT 1", (brand,)).fetchall()
            for b in batches:
                n = deliver_pending(brand, b["batch_id"])
                if n:
                    _gmail_ops["resumed"] += n
                    notes.append(f"resume {brand}: {n}건 발송")
        except Exception as e:
            _gmail_ops["errors"] = ([f"resume {brand}: {type(e).__name__}"]
                                    + _gmail_ops["errors"])[:5]
    return notes


_tr_state = {"last": 0.0, "done": 0, "failed": 0, "errors": []}
TRANSLATE_EVERY_SEC = 120


def _translation_tick() -> list[str]:
    """pending 번역 재시도 — Gmail 실모드 여부와 무관하게 항상 돈다.

    원문은 이미 저장돼 있으므로 재시도는 표시 품질 회복일 뿐, 실패해도
    데이터 유실이 없다. 한도 초과 메시지는 'failed'로 확정한다."""
    now = time.time()
    if now - _tr_state["last"] < TRANSLATE_EVERY_SEC:
        return []
    _tr_state["last"] = now
    try:
        from .routes_community import retry_pending_translations
        r = retry_pending_translations()
        _tr_state["done"] += r["done"]
        _tr_state["failed"] += r["failed"]
        if r["scanned"]:
            return [f"번역 재시도 {r['scanned']}건"
                    f" (완료 {r['done']}·포기 {r['failed']})"]
    except Exception as e:
        _tr_state["errors"] = ([f"{type(e).__name__}"]
                               + _tr_state["errors"])[:5]
    return []


_recon_state = {"last": 0.0, "checked": 0, "settled": 0, "errors": []}
RECONCILE_EVERY_SEC = 1800


def _reconcile_tick() -> list[str]:
    """결제 대사 — processing으로 남은 청구서의 PG 거래를 '조회'해 확정/보류.

    NICEpay 크리덴셜이 설정된 환경에서만 동작하며, 새 결제를 만들지 않는다
    (승인 결과 조회 → 검증 통과 시 paid 확정, 불일치 시 review 보류)."""
    from . import nicepay
    if not nicepay.configured():
        return []
    now = time.time()
    if now - _recon_state["last"] < RECONCILE_EVERY_SEC:
        return []
    _recon_state["last"] = now
    notes: list[str] = []
    try:
        with connect() as conn:
            rows = conn.execute(
                "SELECT invoice_id, tid FROM signup_invoices"
                " WHERE status='processing' AND tid IS NOT NULL"
                " ORDER BY period LIMIT 20").fetchall()
        from .routes_payments import settle
        for r in rows:
            try:
                data = nicepay.request('GET', r["tid"])
            except nicepay.PaymentUnavailable:
                continue                       # PG 응답 없음 — 다음 틱에 재시도
            _recon_state["checked"] += 1
            if settle(r["tid"], r["invoice_id"], data):
                _recon_state["settled"] += 1
                notes.append(f"대사 확정 {r['invoice_id']}")
    except Exception as e:
        _recon_state["errors"] = ([f"{type(e).__name__}"]
                                  + _recon_state["errors"])[:5]
    return notes


_billing_state = {"lastClose": 0.0, "closedInvoices": 0, "errors": []}
BILLING_CLOSE_EVERY_SEC = 6 * 3600


def _billing_tick() -> list[str]:
    """월마감 자동화 — 지난달 확정 사용량의 청구서 생성만. 결제는 하지 않는다."""
    now = time.time()
    if now - _billing_state["lastClose"] < BILLING_CLOSE_EVERY_SEC:
        return []
    _billing_state["lastClose"] = now
    notes = []
    try:
        from .routes_payments import close_months
        with connect() as conn:
            brands = [r["brand_id"] for r in conn.execute(
                "SELECT brand_id FROM brands WHERE NOT is_demo").fetchall()]
        for brand in brands:
            with connect() as conn:
                before = conn.execute(
                    "SELECT count(*) n FROM signup_invoices WHERE brand_id=%s",
                    (brand,)).fetchone()["n"]
                close_months(conn, brand)
                after = conn.execute(
                    "SELECT count(*) n FROM signup_invoices WHERE brand_id=%s",
                    (brand,)).fetchone()["n"]
            if after > before:
                _billing_state["closedInvoices"] += after - before
                notes.append(f"월마감 {brand}: 청구서 {after - before}건 생성")
    except Exception as e:
        _billing_state["errors"] = ([f"close: {type(e).__name__}"]
                                    + _billing_state["errors"])[:5]
    return notes


def _gmail_loop(interval: int) -> None:
    """① Gmail 운영 루프 — 동기화·승인 배치 재개·월마감만. 자동 모집 없음."""
    log.info("gmail ops loop 시작 — interval %ss", interval)
    while True:
        try:
            with _lock:
                notes = (_translation_tick() + _gmail_ops_tick()
                         + _billing_tick() + _reconcile_tick())
                _state["ticks"] += 1
                _state["last_tick"] = datetime.now(UTC).isoformat()
                _state["error"] = None
                if notes:
                    _state["log"] = (_state["log"] + [
                        f"{_state['last_tick']} · {' / '.join(notes)}"])[-30:]
        except Exception as e:
            _state["error"] = str(e)
            log.exception("gmail ops tick 실패")
        time.sleep(interval)


def _legacy_loop(interval: int) -> None:
    """② 레거시 데모 루프 — 순수 데모 환경 전용 (기동 조건은 start_if_enabled)."""
    global _runner
    from harvest.runner import Runner
    esp, esp_name = _make_esp()
    _runner = Runner(gates=DbGateClient(), esp=esp)
    _state["esp"] = esp_name
    log.info("legacy demo runner 시작 — interval %ss · esp %s", interval, esp_name)
    while True:
        try:
            with _lock:
                enrolled = _enroll_from_pool(_runner)
                ran = _runner.tick()
                polled = _runner.poll_gates()
                _state["legacy_ticks"] = _state.get("legacy_ticks", 0) + 1
                notes = ([f"등록 {enrolled}명"] if enrolled else []) + polled
                if notes or ran:
                    _state["log"] = (_state["log"] + [
                        f"{datetime.now(UTC).isoformat()} · demo잡 {ran or '-'} · {' / '.join(notes) or ''}"
                    ])[-30:]
        except Exception as e:
            _state["error"] = str(e)
            log.exception("legacy runner tick 실패")
        time.sleep(interval)


def start_if_enabled() -> bool:
    interval = int(os.environ.get("RUNNER_INTERVAL_SEC", "60"))
    started = False
    if (os.environ.get("RUNNER_ENABLED") == "1"
            or os.environ.get("GMAIL_OPS_ENABLED") == "1"):
        threading.Thread(target=_gmail_loop, args=(interval,), daemon=True,
                         name="gmail-ops").start()
        _state["enabled"] = True
        _state["mode"] = "gmail-ops"
        started = True
    if os.environ.get("LEGACY_DEMO_RUNNER") == "1":
        # 실발송 수단이 하나라도 있으면 기동 거부 — 데모 전용 루프다.
        if os.environ.get("GOOGLE_CLIENT_ID") or os.environ.get("SENDGRID_API_KEY"):
            log.error("LEGACY_DEMO_RUNNER는 실발송 키가 있는 환경에서 켤 수 없습니다"
                      " — 기동 거부")
            _state["legacyRefused"] = True
        else:
            threading.Thread(target=_legacy_loop, args=(interval,), daemon=True,
                             name="legacy-demo-runner").start()
            _state["legacy"] = True
            started = True
    return started


def status() -> dict:
    out = dict(_state)
    out["gmailOps"] = {"synced": _gmail_ops["synced"],
                       "resumed": _gmail_ops["resumed"],
                       "recentErrors": _gmail_ops["errors"]}
    out["billing"] = {"closedInvoices": _billing_state["closedInvoices"],
                      "recentErrors": _billing_state["errors"]}
    out["translation"] = {"done": _tr_state["done"],
                          "failed": _tr_state["failed"],
                          "recentErrors": _tr_state["errors"]}
    out["reconcile"] = {"checked": _recon_state["checked"],
                        "settled": _recon_state["settled"],
                        "recentErrors": _recon_state["errors"]}
    if _runner is not None:
        with _lock:
            out["outreach"] = _runner.outreach.stats()
            out["referral"] = _runner.referral.stats()
    return out
