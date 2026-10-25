"""운영 API readiness 래퍼 — 보안 키 교체 배포 전용(원본 불변).

변경하지 않은 `api.main` 의 동일한 FastAPI `app` 과 `health()` 를 그대로 import
하고, native readiness 용 엄격한 `/health/ready` 경로 하나만 더한다. 기존
`/health` 와 업무 API 는 그대로 보존된다. 새 기능·의존성·인증 변경·운영 접근은
없다. 비밀값/에러 내용은 응답에 넣지 않는다.

이유: 운영 `health()` 는 DB 오류나 _startup_error 가 있어도 dict 를 HTTP 200 으로
반환하므로, 200 만 보는 native readiness 가 비정상 컨테이너로 잘못 전환될 수
있다. `/health/ready` 는 health() 의 ok 가 True 이고 startup_error 가 None 일
때에만 200 {ok:true}, 그 외에는 503 {ok:false} 를 준다.
"""

from fastapi import Response

# 변경하지 않은 운영 앱과 health 핸들러(services/api/api/main.py)
from api.main import app, health


@app.get("/health/ready")
def health_ready(response: Response) -> dict:
    """동기 handler — 내부 health() 가 동기 DB 호출을 하므로 FastAPI 가 이 핸들러를
    스레드풀에서 실행해 event loop 를 막지 않게 한다. async 로 두지 않는다."""
    try:
        result = health()
    except Exception:
        response.status_code = 503
        return {"ok": False}
    ready = bool(result.get("ok")) and result.get("startup_error") is None
    if not ready:
        response.status_code = 503
        return {"ok": False}
    return {"ok": True}
