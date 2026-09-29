# 실브라우저 E2E (Playwright, 로컬 격리 스택)

컨테이너 리셋으로 스크래치 스크립트가 유실되던 것을 리포로 영구화했다.
실행 전제: PostgreSQL(e2e_c3) + uvicorn 8765(키 전부 제거 env) +
http.server 5174(console dist)/5175(creator dist)/5176(admin dist)/
5177(signup dist), `admin.ctx@ex.com`(admin-ctx-pass-1)·realco 시드.

    node tests_e2e/<파일>.mjs   # PASS/FAIL 출력, 실패 시 exit 1

외부 발송·실PG·실OAuth 없음 — 전부 로컬 모사 스택 대상.
