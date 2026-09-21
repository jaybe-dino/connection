# 개발 현황 — 2026-09-20 (Claude 개발분, Codex 검수 대상)

역할: Claude = 개발·자체 테스트·커밋·근거 보고 / Codex = 서비스·코드 직접 검수.
이 문서는 검수 사이클 1회차 인계 문서다. 발견 오류는 그대로 전달해 주면 수정한다.

## 완료 (이번 커밋)

### 1. 835eb76 지적사항 수정
- **접근 경계 축소** (`api/main.py` legacy_access_boundary):
  광범위 "로그인만 있으면 통과" 예외를 제거하고, **핸들러에 본인 검사가 실제로
  구현된 3개 경로만** 허용: `POST /me/join`, `GET /me/memberships`,
  `POST /campaigns/{id}/apply`(AUTH_REQUIRED에서 크리에이터 JWT 강제 추가).
  `/me/{id}/fields`·`/me/{id}`·`/cells/*`·`/notifications`·`GET /campaigns` 등
  검사 없는 경로는 관리자 전용 복구.
  근거: `tests/test_tenancy_api.py::test_legacy_boundary_allowlist`
  (허용 3경로 통과 + 비검사 5경로 × 크리에이터/브랜드/무토큰 전부 401).
- **소급 인상 철회** (`db/migrations/022_restore_pre_5000_prices.sql`):
  **[※ 사이클 2에서 이 접근 자체가 무효화됨 — 아래 '사이클 2' §4의 감사 큐 방식이 현행]**
  020의 "미청구 사용량 일괄 5,000원" UPDATE는 소급 인상 금지 위반이었음을
  인정하고 정정. 50원은 오기가 아니라 과거 도입가 정책(012).
  022는 `schema_migrations.applied_at('020…')` 이전 `verified_at`의 미청구
  행만 50원으로 복원한다(발행 청구서·검증 시각 증거 기반, 020 미실행 환경에선
  no-op으로 수렴). 신규 검증 가입은 5,000원, 같은 브랜드 중복 무과금(UNIQUE),
  발행 청구서 불변.
  근거: `tests_billing/test_payments.py::test_pre_5000_unbilled_usage_is_preserved_not_raised`
  (과거 미청구 50원 복원 · 발행분 5,000원 그대로 · 신규 5,000원).
  ⚠️ **운영 DB 실측은 이 샌드박스에서 불가**(egress 차단): 022 배포 후
  `SELECT unit_price, count(*), min(verified_at), max(verified_at) FROM signup_usage
  WHERE invoice_id IS NULL GROUP BY 1` 로 분포 확인 요망. 020이 운영에서
  이미 실행됐다면 그 사이(020 배포~022 배포)에 발행된 청구서가 있는지도 확인
  필요 — 있다면 해당 청구서는 022가 손대지 않으므로 개별 판단 대상.

### 2. 브랜드 복수 제품 학습·제품별 캠페인·후보 추천 (신규)
- `db/migrations/023_brand_products.sql`: brand_products(틱톡샵 상품 식별자·
  커미션%) + product_profile_versions(브랜드 프로필과 동일한 버전·근거 체계)
  + campaigns.product_id.
- `api/routes_products.py`:
  - 제품 CRUD(브랜드 격리), 제품 프로필 저장 — **기존 /brand-learning
    파이프라인 재사용**(레이트리밋·근거 인용 원문 검증 포함): UI가 제품 페이지를
    /brand-learning으로 분석 → learning_id를 제품 프로필 저장에 전달.
  - `POST …/products/{id}/campaigns`: 제품 커미션%로 affiliate 캠페인 개설.
  - `GET …/products/{id}/candidates`: **후보 DB(creator_pool) 실측 필드만으로**
    정렬·필터(국가·이메일 검증·브랜드 수신거부 제외, contact/influence 점수순),
    후보마다 데이터 근거 문자열 동봉. 지표 생성 없음(응답 note에 명시).
  - `POST …/outreach/compose`에 `product_id` 선택 인자 — 제품 프로필을
    브랜드 프로필과 함께 AI 초안 근거로 전달.
  근거: `tests/test_products_api.py` 3종(버전 이력 보존, 브랜드 격리 403/404,
  캠페인-제품 연결 + 후보 필터·정렬·근거).

### 3. Gmail 화면 비의존 운영 (러너 이관)
- `api/runner_daemon.py` `_gmail_ops_tick()`:
  - **수신 동기화**: readonly 동의(scope)가 있는 connected 계정의 브랜드만,
    브랜드당 최소 10분 간격으로 `gmail_sync.sync()` 호출. 실패는 기록 후
    다음 틱 재시도(가짜 열람·회신 없음, 동의 없는 계정 건드리지 않음).
  - **발송 큐 재개**: 승인(approved)된 아웃리치 배치에 pending 수신자가 남으면
    브랜드당 15분 간격·틱당 1배치로 `deliver_pending()` 재개. 수신거부·90일
    중복·일일 한도(보수적 증량)·불확실 실패 review 격리 등 기존 안전 규칙은
    `routes_outreach.deliver_pending()`으로 함수화해 라우트와 공용.
  - `/runner/status`에 `gmailOps{synced,resumed,recentErrors}` 노출.
- 데모 모드(GOOGLE_CLIENT_ID 없음)에선 동작하지 않음. **실계정 실동작 검증은
  운영 환경에서만 가능** — 배포 후 `/runner/status`의 gmailOps 수치와
  `gmail_accounts.synced_at` 갱신으로 확인 요망(아래 검수 가이드).

## 테스트·커밋 증거

- services/api: **82 passed** (`PGUSER=postgres … pytest -q`, 신규: 경계
  allowlist 1, 제품 3) / tests_billing: **50 passed** (신규: 소급 금지 1).
- 로컬 부팅으로 마이그레이션 020~023 적용 확인(schema_migrations)·/health ok.
- 커밋: 이 문서와 함께 푸시된 HEAD (fast-forward만, 강제푸시 없음).
- 실행하지 않은 것(지시 준수): 실카드 결제, 외부 수신자 실발송, 새 OAuth 동의,
  비밀키 출력.

## 진행 중 / 다음 작업(미완 — 완료 주장 아님)

1. 내부 디스코드형 커뮤니티(cells·공지·DM·번역 UI) 재공개 — 코드·DB는 있으나
   멤버십 검사 없는 엔드포인트라 경계에서 관리자 전용. 멤버십 기반 가드 추가
   후 allowlist에 편입 예정. (실제 Discord 서버 연동은 존재하지 않으며 계획도
   별개 — 혼동 금지)
2. 선정·수수료 합의·샘플·콘텐츠 제출·TikTok 식별자/광고 코드(스파크 코드 등
   종류·권한 구분) 관리 테이블·API·UI.
3. 콘솔 UI에 제품 관리·후보 추천 화면 연결(현재 API만), 크리에이터 캠페인
   지원 UI.
4. 월마감 자동화·결제/취소 대사 잡의 러너 이관(현재 수동 트리거).

## 막힘 / 외부 의존 (검증 불가 항목)

- 운영 DB 실측(022 영향·020 실행 이력) — 샌드박스 egress 차단. Codex 또는
  운영 콘솔에서 위 SQL 확인 필요.
- Gmail readonly 실동의 계정 필요(러너 동기화 실증). Google 공개 심사 상태는
  코드와 별개 트랙.
- NICEpay 실거래(결제·취소 대사) — 사람 승인 후 소액 실결제로만 검증 가능.
- 크리에이터 본인 검증 자동화 — TikTok Login Kit 심사 승인 대기(현재 어드민
  수동 verify).

## Codex 검수 가이드 (권장 확인 지점)

1. `GET /brands/{b}/billing` unitPrice=5000 · 위 소급 SQL 분포.
2. AUTH_REQUIRED=1에서 `/me/c-mai/fields` PUT이 크리에이터/브랜드 토큰으로
   401인지(경계 축소 확인), `/me/join`은 크리에이터 토큰으로 200인지.
3. 제품 플로우: 제품 생성→(/brand-learning으로 제품 페이지 분석)→프로필 저장
   →campaigns.product_id·affiliate_pct→candidates 근거 문자열.
4. `/runner/status`.gmailOps — 동기화가 화면 없이 증가하는지(운영).
5. `deliver_pending` 재개가 수신거부·중복·한도 규칙을 라우트와 동일하게
   지키는지 코드 경로 확인.

---

# 사이클 2 — Codex 1차 검수 반영 (같은 날)

## 지적 → 수정 내역

1. **소수 커미션 절사(12.5→12)**: 원인 = campaigns.affiliate_pct integer +
   int() 캐스팅. 수정 = 025 마이그레이션(numeric(5,2))+캐스팅 제거.
   회귀: `test_decimal_commission_preserved` (API·DB 모두 12.5) + UI E2E.
2. **후보 추천이 fields 미사용**: 수정 = 제품 이름·프로필 필드 키워드 ↔ 후보
   category/product_tags 교집합을 1순위 정렬 기준으로(동률 시 접촉·영향력 점수),
   matchedTerms·fitScore·"제품 적합" 근거를 후보별 반환. productFieldsUsed는
   실제 키워드에 기여한 필드만. 검증: `test_candidates_ranked_by_product_fit`
   — 서로 다른 두 제품에서 1위 후보가 달라지고(적합도가 접촉점수 99를 이김)
   근거에 일치 키워드 명시.
3. **Gmail잡-레거시 러너 결합 위험**: 수정 = 루프 완전 분리.
   `RUNNER_ENABLED|GMAIL_OPS_ENABLED` → Gmail 운영 루프만(동기화·승인 배치
   재개·월마감 청구서 생성; 자동 모집·자동 발송 없음).
   레거시 데모 루프는 `LEGACY_DEMO_RUNNER=1` 명시 + 실발송 키(GOOGLE/SENDGRID)
   전무한 환경에서만 기동, 아니면 기동 거부 로그. DEPLOY.md 갱신.
   운영 러너는 여전히 꺼져 있음(환경변수는 운영자가 결정).
4. **022 자동 복원 부적절**: 수정 = 자동 변경 전면 제거.
   020은 정책 단가만 변경(사용량 불변)으로 재작성, 022는 no-op(무효화 기록),
   **024 신설**: 불확실 구간(020 적용 시각 이전 verified_at, 미청구) 행을
   `signup_usage_audit` 감사 큐에 수집 — 값은 건드리지 않고, **미해결 행은
   월마감 산입에서 제외**, 어드민이 증거와 함께 `POST /admin/usage-audit/{id}/resolve`
   로 수동 확정(발행된 청구서는 409로 보호). 이미 최초 버전 020/022가 실행된
   환경의 행도 같은 큐로 들어온다.
   검증: `test_uncertain_price_rows_are_audited_not_changed`
   (값 불변→산입 제외→수동 확정→그 가격으로 청구).
   ⚠️ 운영 실측은 여전히 외부 확인 필요: `GET /admin/usage-audit`(어드민)로
   운영의 감사 대상 행·현재 단가를 확인하고 개별 확정해 주세요.

## 신규 개발 (남은 범위 진행)

- **콘솔 '제품·캠페인' 페이지**: 제품 등록(소수 커미션)·프로필 저장(버전 표시)·
  어필리에이트 캠페인 개설·후보 보기(근거 리스트). E2E 5체크.
- **내부 커뮤니티 공개 표면** `/community/*` (routes_community.py):
  멤버십 검사 구현된 새 경로 — 크리에이터(해당 브랜드 멤버만)·브랜드(자기 셀만,
  공지 게시)·어드민. 원문+언어별 번역 동봉(원문 보존), 크리에이터는 notice 금지.
  레거시 /cells/* 는 계속 관리자 전용. 실제 Discord 연동 아님(내부 커뮤니티).
  검증: `test_community_api.py` 2종 + 크리에이터 UI E2E(태국어 게시→원문 보존
  →번역 동봉).
- **크리에이터 커뮤니티 UI**: 멤버십 셀 목록(로고)→대화 열람(내 언어 표시 +
  원문 병기)→게시(내 언어로 작성, 서버가 번역 저장).
- **월마감 러너 이관**: Gmail 운영 루프에 6시간 간격 close_months(비데모 브랜드,
  청구서 생성만·결제 없음), /runner/status.billing 노출.

## 증거 (사이클 2)

- services/api **86 passed** / tests_billing **13 passed** (감사·소수·핏 랭킹
  신규 5종 포함)
- Playwright E2E 9체크 통과(제품 페이지·12.5% 보존·후보 근거·커뮤니티 번역)
- 실행 안 한 것: 실카드 결제, 외부 수신자 발송, 새 권한 동의, 운영 러너 기동.

## 다음(미완)

- 선정·수수료 합의·샘플·콘텐츠 제출·TikTok 식별자/광고 코드(종류·권한 구분) 관리
- 크리에이터 캠페인 지원 UI(현재 API만), 담당자 1:1 DM 채널
- 결제/취소 대사 자동화(현재 reconcile 수동 트리거), NICEpay 실거래 검증(승인 필요)

---

# 사이클 3 — Codex 2차 검수 반영 + 협업 흐름 완성 (2026-09-21)

## 지적 → 수정 내역

1. **신규 브랜드 my-cells=[] (기본 커뮤니티 없음)**:
   - 코드: `ensure_default_cell(conn, brand_id, name)` 헬퍼(routes_community)
     — `cell-<brand>-main` "<브랜드명> 라운지"를 멱등 생성. 신청 승인
     (`/admin/applications/{id}/approve`)이 브랜드 INSERT 직후 호출.
   - 백필: **026_default_cells.sql** — 셀이 하나도 없는 기존 브랜드에만
     같은 규칙으로 멱등 생성(ON CONFLICT DO NOTHING, 기존 셀 불변).
   - 검증: `test_new_brand_default_cell_and_isolation` — 두 신규 브랜드를
     신청→승인→초대 수락으로 만들고, 승인 즉시 각자 기본 셀 1개, 서로의 셀
     접근 403, 신규 크리에이터는 합류한 브랜드 셀만 보임/게시 가능.
2. **ai.translate 장애 시 메시지 유실**:
   - **027_translation_state.sql**: cell_messages에 translation_state
     (done|pending|failed)+translation_attempts+pending 부분 인덱스.
   - post_message를 "원문 선저장(pending, translations={}) → 커밋 → 번역
     시도 → 성공 시 done"으로 재구성. 실패해도 200 + translationState 반환,
     가짜 번역을 만들지 않음.
   - 러너 재시도: `retry_pending_translations()`(FOR UPDATE SKIP LOCKED로
     중복 방지, 5회 초과 시 failed 확정) + runner_daemon `_translation_tick`
     (120초 간격, Gmail 실모드 여부와 무관하게 동작). /runner/status.translation.
   - UI: 번역 전 메시지는 "번역 준비 중/불가 — 원문 표시" 배지.
   - 검증(외부 호출 없음): `test_translate_failure_preserves_original`
     (translate를 TimeoutError로 monkeypatch → 원문 저장·pending → 장애 해제
     후 재시도 → done+번역 동봉), `test_translation_retry_gives_up_after_max`
     (5회 실패 → failed 확정, 중복 없음, 이후 재시도 중단).
3. **test_products의 products[0] 순서 의존**: isolation·campaign_and_candidates
   두 테스트 모두 목록 인덱스 대신 자체 생성한 productId 사용으로 수정.

## 신규 개발 — 캠페인 협업 흐름 (요구 5)

- **028_campaign_terms.sql**: 선정→수수료 합의→샘플→콘텐츠 제출→완료|거절
  상태머신. TikTok 코드 종류·권한 구분(스키마 주석에 명시):
  spark_code=광고 권한 코드(크리에이터 제출) / affiliate_link=판매 추적
  링크(브랜드 발급) / tiktok_handle=계정 식별자(합의 시 크리에이터 확인).
- **routes_collab.py**:
  - 브랜드: GET campaigns(지원·선정 수), GET applicants, POST select(수수료
    제안, 지원자만·중복 409), sample-shipped(합의 후만), affiliate-link
    (https만·합의 후만), complete(콘텐츠 제출 후만).
  - 크리에이터(/me/*): GET /me/campaigns(멤버십 브랜드의 open 캠페인+내 상태),
    GET /me/campaign-offers, agree(핸들 필수, 제안 수수료가 확정값)/거절,
    spark-code, content(https만). 모두 핸들러가 크리에이터 JWT 본인 행만 강제,
    main.py 미들웨어 allowlist에 정확 경로만 추가(그 외 /me/*는 관리자 전용
    유지 — `test_me_campaign_routes_require_creator_jwt`).
  - 전 단계 원장 기록(SELECTED/AGREED/SHIPPED/LINK/SPARK/CONTENT/COMPLETED).
- **담당자 1:1 DM**: `/community/dm/{brand}`(크리에이터 멱등 개설)·
  `/community/dm`(목록). visibility='dm' 셀 재사용 — 같은 브랜드의 다른
  크리에이터도 접근 403, my-cells에 남의 DM 미노출.
  검증: `test_dm_private_between_creator_and_brand`.
- **UI**: 크리에이터(캠페인 목록·지원, 오퍼 카드: 합의/거절→샘플·링크 표시→
  spark·콘텐츠 제출, 멤버십 카드 '담당자 DM'), 콘솔 제품 페이지(캠페인별
  지원자 보기→선정+수수료 제안→샘플 발송→링크 발급→완료 처리).
  로그인 후 새로고침 시 크리에이터 데이터 미로딩 버그도 이번에 수정
  (/auth/me 부트스트랩에서 loadCreatorData 호출).
- **결제/취소 대사 러너 이관**: `_reconcile_tick`(30분 간격) — NICEpay
  크리덴셜 설정 환경에서만, status='processing'+tid 청구서의 PG 거래를
  **조회**해 검증 통과 시 paid 확정/불일치 시 review 보류. 새 결제 생성 없음.
  /runner/status.reconcile. (크리덴셜 없는 환경에선 완전 무동작 — 실거래
  검증은 운영 승인 후 외부 확인 필요)

## 증거 (사이클 3)

- services/api **92 passed** / tests_billing **51 passed** (신규: 기본 셀
  격리·번역 장애 2종·DM 프라이버시·협업 완주·/me 경로 가드)
- **새 브랜드 2개 완주 테스트** `test_two_new_brands_full_campaign_journey`:
  joyone/joytwo 신청→승인(기본 셀)→초대 수락→제품(15.5%)·캠페인→크리에이터
  매직 로그인→합류→기본 셀 대화(태국어)→지원→선정(15.5 제안)→핸들 확인 합의
  (15.5 확정)→샘플 발송(송장)→링크 발급→spark 제출→콘텐츠 제출→완료,
  브랜드 간(지원자 조회 403·경로-소유 404·캠페인 목록·셀 접근) 격리, 원장
  이벤트 7종 확인.
- Playwright E2E: 사이클3 15체크(콘솔 협업 카드·지원→선정→합의→spark/콘텐츠
  →완료 UI 완주·DM 개설/게시/브랜드 수신·JS 에러 0) + 사이클2 9체크 회귀 통과.
- 빌드: console·creator-app·admin dist 재생성(sync-demo 후).
- 실행 안 한 것(금지 준수): 실카드 결제, 외부 수신자 발송, 새 보안권한 동의,
  운영 러너 기동, 비밀키 출력.

## 막힘/외부 필요

- Railway 배포 반영은 컨테이너 egress 제한으로 직접 확인 불가 — 배포 후
  `GET /health`(마이그레이션 026~028 적용), `GET /runner/status`
  (translation/reconcile 키), 콘솔 '제품·캠페인' 페이지의 "캠페인 지원자 ·
  협업 진행" 카드 노출을 확인해 주세요.
- NICEpay 대사 실동작은 운영 크리덴셜 환경에서만 검증 가능(조회성).

## 다음

- 정산(크리에이터 대금 지급) 화면·정책, 후보 추천→아웃리치 초안에 campaign
  terms 컨텍스트 연결 심화, Codex 3차 검수 지적 반영.

---

# 사이클 4 — Codex 3차 검수 반영 (2026-09-21)

## 지적 → 수정 내역

1. **지원 API 서버측 검사 부재 (미가입 200 / closed 200)**:
   `POST /campaigns/{id}/apply`(main.py)가 순서대로 검사 —
   OTP pending 401 → (AUTH_REQUIRED) 크리에이터 JWT 401 → 캠페인 존재 404 →
   status≠open 409 → 마감일 경과(Asia/Seoul 기준, 마감일 당일까지 허용) 409 →
   해당 브랜드 **멤버십** 없음 403. 재지원은 멱등(ON CONFLICT)이며 응답이
   DB의 **실제 상태**(applied/selected/…)와 alreadyApplied를 반환.
   - 기존 테스트 정합: 시드 cmp-1은 마감일(2026-09-15)이 이미 지나 409가
     정답이 됨 — allowlist·JWT 테스트를 cmp-2(마감 9/30)로 옮기고, 미가입
     403→합류→지원→재지원(실상태)→cmp-1 마감 409를 명시 검증.
2. **선정 정원/상태 정책·동시성**: select가 캠페인 행을 FOR UPDATE로 잠근 뒤
   상태(open/closed만 허용 — 취소·보관 409)와 capacity>0일 때 유효 선정 수
   (declined 제외) < capacity를 검사. 중복 선정은 기존 ON CONFLICT 409 유지.
   검증: `test_select_capacity_and_status_policy`(정원 1명 초과 409·cancelled
   409), `test_apply_server_side_guards`(404/403/409/멱등/selected 반영).
3. **불완전 번역이 done으로 저장**: `translation_complete(tr, source)` 공통
   판정 신설 — 모든 대상 언어가 비어있지 않게 존재해야 하고 "[xx·번역대기]"
   폴백 태그는 완료가 아님. **즉시 경로(post_message)와 러너 재시도가 같은
   함수**를 사용. 부분 결과는 `translations || new`로 병합 보존하되 상태는
   pending 유지, 재시도 한도 초과 시 failed(원문 보존). 키 없는 데모 폴백도
   이제 pending으로 정직하게 표시된다(E2E 기대값 갱신).
   검증(외부 호출 없음): `test_partial_or_empty_translation_stays_pending`
   — {}→pending, en만→병합+pending, 폴백 태그→pending, 완전 결과→done·병합
   갱신. 기존 장애 테스트는 회복 단계를 완전 결과 모사로 교체, 재시도 격리를
   위해 pending 사전 정리(_drain_pending).

## 증거 (사이클 4)

- services/api **95 passed** / tests_billing **51 passed** (신규 3종 포함,
  기존 146개 전부 회귀 통과)
- Playwright E2E: 사이클3 15체크 + 사이클2 9체크 재통과(신규 빌드 dist,
  DM 번역 상태는 키 없는 환경에서 pending으로 정직 표기).
- UI: 지원 실패 시 서버 사유(멤버십/마감/모집종료)를 토스트로 그대로 표시.
- 실행 안 한 것(금지 준수): 실카드 결제, 외부 수신자 발송, 새 보안권한 동의,
  운영 러너 기동, 비밀키 출력.

## 운영 미검증 (외부 확인 필요)

- 배포 후: 크리에이터 JWT 없이/멤버십 없이 `/campaigns/{id}/apply` 호출이
  401/403인지, closed·마감 경과 캠페인이 409인지 운영에서 재확인.
- 운영 DB의 기존 pending/과거 done 메시지 상태는 그대로 두었다(소급 변경
  없음). 새 메시지부터 완료 판정이 엄격해지며, ANTHROPIC 키가 없는 환경은
  번역이 pending→(5회 후) failed로 남는다 — 운영에 키가 설정돼 있는지 확인.
- 데모 시드 cmp-1(마감 9/15)은 의도적으로 만료 상태 — 데모에서 지원 버튼은
  cmp-2/cmp-3 기준으로 확인.

## 다음

- Codex 4차 검수 지적 반영, 정산(대금 지급) 정책·화면.

---

# 사이클 5 — Codex 4차 검수 반영: 지연 확정 사용량 추가 청구 (2026-09-21)

## 지적 → 수정 내역

**같은 월 선청구 후 감사 확정 시 UniqueViolation**
(재현: 2026-01 사용량 2건 중 1건 감사 보류 → 월마감이 나머지 1건 청구 →
보류건 50원 확정 → 재조회 시 close_months INSERT가
signup_invoices_brand_id_period_key 위반으로 실패)

- **029_invoice_supplements.sql**: signup_invoices에 `seq`(기본 0) 추가,
  UNIQUE(brand_id,period) 제거 → **UNIQUE(brand_id,period,seq)**.
  seq=0 본청구, 1부터 지연 확정분 '추가 청구'. 금액 검증은 012의
  CHECK(amount>0) 유지(단가 혼재 허용). 운영 DB에는 배포 시 auto-apply.
- **close_months**: 월 그룹마다 `COALESCE(MAX(seq),-1)+1`로 다음 seq를 정해
  새 청구서만 INSERT — **발행·결제된 청구서는 어떤 상태(paid/processing/
  review)든 절대 수정하지 않는다**. 기존 brand 단위 advisory lock이 seq
  산정과 INSERT를 직렬화(동시성)하고, 사용량 행의 invoice_id 연결이 같은
  트랜잭션에서 일어나므로 반복 호출에도 중복·누락 과금이 없다.
  추가 청구 발행은 원장에 `INVOICE_SUPPLEMENT_CREATED`로 기록.
- 응답에 `seq`/`supplement` 노출, 카드결제 goodsName에 '추가분' 표기,
  콘솔 청구 목록에 '추가분' 배지. 추가 청구서도 기존 결제·대사 흐름
  (1,000원 미만 카드 차단 포함)을 그대로 따른다.

## 검증 (사이클 5)

- 신규 회귀 2종 (tests_billing/test_payments.py, 검수 시나리오 그대로):
  - `test_same_month_late_resolution_creates_supplement`: 같은 달 2건 중
    1건 보류 → 선청구 5,000원 → **paid 처리(모사)** → 보류건 50원 증거 확정
    → 재조회: 기존 청구서 (5000,1,paid,seq0) 불변 + 추가 청구서 (50,1,open,
    seq1) 생성, 월 합계 5,050원 정확, 재조회 2회 반복에도 청구서 2장 그대로
    (멱등), 대상 사용량 전부 정확히 한 청구서에 연결.
  - `test_processing_invoice_untouched_by_supplement`: processing+tid
    청구서도 status·tid 불변, 추가 청구서만 생성.
- 전체: services/api **95 passed** / tests_billing **53 passed**,
  프론트 재빌드 후 E2E 사이클3 15체크 + 사이클2 9체크 재통과.
- 로컬 신선 DB에서 029 auto-apply 확인: seq 컬럼·새 UNIQUE 제약·
  schema_migrations 등록 확인(health ok).
- 실행 안 한 것(금지 준수): 실카드 결제(paid는 상태 모사), 외부 수신자 발송,
  새 보안권한 동의, 운영 러너 기동, 비밀키 출력.

## 오픈 전 미검증 항목 (5회 사이클 도달 ≠ 오픈 완료 — 별도 확인 필요)

1. **실배포 반영**: Railway 배포 후 /health(029 적용)·기존 운영 청구서의
   seq=0 기본값·콘솔 청구 화면 확인. (컨테이너 egress 제한으로 직접 확인 불가)
2. **NICEpay 실거래**: 승인·취소·대사(reconcile/_reconcile_tick)는 운영
   크리덴셜 + 소액 실거래 승인 전까지 미검증. 추가 청구서 결제도 동일.
3. **브랜드별 Gmail 자동화**: 실계정 OAuth 동의 후 수신 동기화 폴링·발송
   큐 재개·워밍업 한도의 운영 동작 미검증(로컬은 모사만).
4. **과금 감사 운영 실측**: 운영 DB의 signup_usage_audit 대상 행 확인·증거
   기반 확정은 어드민이 직접 수행해야 함(GET /admin/usage-audit).
5. **모바일 실기기**: 크리에이터 표면(지원·오퍼·DM·커뮤니티)의 iOS/Android
   실기기 브라우저 확인 미수행(뷰포트 축소 확인만).

## 다음

- Codex 5차 검수 지적 반영, 위 미검증 항목의 운영 확인 지원.

---

# 사이클 6 — Codex 5차 검수 반영: 마감-확정 경합의 누락 과금 (2026-09-21)

## 지적 → 수정 내역

**재현된 결함**: close_months의 집계 SELECT와 광범위 조건 UPDATE 사이에
별도 연결의 admin resolve(50원 확정)가 끼어들면, 확정된 행이 UPDATE 조건을
새로 통과해 "금액 5,000/1건" 청구서에 사용량 2건(5,050원)이 연결되고,
50원은 invoice_id가 채워져 영구 누락. 원인 = 스냅샷 불일치 +
resolve의 billing advisory lock 미사용.

수정(두 겹 방어, routes_payments.py):
1. **정확 연결**: 집계를 `_collect_billable()`로 분리 — 청구 대상 행을
   `FOR UPDATE`로 잠가 usage_id 목록으로 가져오고, 청구서 발행 후
   `UPDATE … WHERE usage_id = ANY(집계에 포함된 그 id들)`로만 연결.
   조건 재평가가 없으므로 청구서 금액 = 연결 사용량 합계가 항상 성립.
2. **잠금 순서 통일**: `billing_lock(conn, brand)` 공통 함수 —
   close_months와 usage_audit_resolve가 **같은 브랜드 advisory lock을
   같은 순서(advisory → 행 잠금)**로 획득. 마감 진행 중의 확정은 마감
   커밋 뒤로 직렬화되고(그 뒤 미청구 행이므로 정상 확정 → 다음 조회에서
   추가 청구), 이미 마감에 잡힌 행의 확정은 FOR UPDATE 대기 후
   invoice_id를 보고 409. 교착 없음(두 경로 모두 advisory 선획득).

## 검증 (사이클 6)

- **2연결+Event barrier 회귀** `test_concurrent_resolve_during_close_no_lost_billing`
  (검수 시나리오 그대로): `_collect_billable`를 barrier로 감싸 집계 직후
  일시정지 → 별도 스레드/연결에서 resolve 실행 → 재개. 결과: 본청구
  (5,000/1건/seq0)의 연결 사용량 정확히 {1건, 5,000원}, resolve는 잠금
  대기 후 200, 재조회에서 50원 추가 청구 발행, 미청구 잔여 0,
  **모든 청구서에서 amount = 연결 사용량 합계** 검증.
- **일반 동시 월마감 회귀** `test_concurrent_month_close_single_invoice`:
  두 스레드 동시 마감 → 둘 다 200, 청구서 정확히 1장(2건/10,000원),
  이중 발행·이중 연결 없음.
- **구버전 음성 대조(확증)**: 구 로직(광범위 UPDATE + resolve 무잠금)을
  같은 barrier로 돌려 검수와 동일한 손상(청구서 5,000/1건 ↔ 연결 2건/
  5,050원) 재현 확인 — 임시 파일로 실행 후 삭제(커밋 안 함), 새 회귀가
  이 결함 계열을 실제로 잡는다는 증거.
- 전체: services/api **95 passed** / tests_billing **55 passed**
  (발행 청구서 불변·멱등·추가청구 회귀 전부 재통과), 신선 DB 기동 후
  E2E 사이클3 15체크 재통과. 프론트 변경 없음(콘솔 JS 동일).
- 실행 안 한 것(금지 준수): 실카드 결제, 외부 수신자 발송, 새 보안권한
  동의, 운영 러너 기동, 비밀키 출력.

## 오픈 전 미검증 (변동 없음 — 5회 도달해도 오픈완료 아님)

과금 실거래(NICEpay)·운영 E2E(실배포 확인)·브랜드별 Gmail 실계정 자동화·
모바일 실기기 — 사이클 5 목록과 동일하게 외부 확인 필요.

## 다음

- Codex 추가 검수 지적 반영.

---

# 사이클 7 — Codex 6차 검수 반영: Gmail 수신 동기화 계정 선택 결함 (2026-09-21)

## 지적 → 수정 내역

**재현된 결함**: 같은 브랜드에 오래된 gmail.send 전용 연결 계정과 새
gmail.readonly 연결 계정이 함께 있으면, gmail_sync.sync가
`ORDER BY connected_at LIMIT 1`로 오래된 발송 전용 계정을 골라
"받은 메일 권한이 필요합니다" 409 — 유효한 읽기 계정이 있어도
자동 동기화(러너 포함)가 계속 실패.

수정(gmail_sync.py + routes_gmail.py):
- **읽기 계정만 대상**: 연결 계정 전체를 잠근 뒤 gmail.readonly 스코프가
  있는 **모든** 계정을 순회 동기화. 발송 전용 계정은 선택하지도, 손대지도
  않는다(커서·오류·스코프·상태 불변).
- **계정별 격리**: 커서(sync_page_token)·synced_at·sync_error를 계정별로
  기록. 한 계정의 토큰 만료·API 오류는 그 계정의 sync_error에만 남고
  나머지 읽기 계정은 계속 진행. 전 읽기 계정 실패 시에만 502.
  sync 응답에 계정별 결과(accounts[]) 포함. 엔드포인트의 "브랜드 전
  계정 sync_error 덮어쓰기"도 제거(격리 유지). 브랜드 격리는 기존
  brand_id 스코프·advisory lock(gmail-sync:<brand>) 그대로.
- **발송 우회 금지**: send_via_brand_gmail의 승인 계정 선택 로직은
  변경하지 않았다 — 읽기 스코프를 추가 요구하지 않고, 읽기 계정으로
  발송을 우회하지도 않는다(테스트로 고정).

## 검증 (사이클 7)

- 신규 회귀 3종 (tests_billing/test_outreach.py, 외부 HTTP는 가짜
  클라이언트 — 실계정 호출 없음):
  - `test_sync_skips_send_only_account_and_uses_readable`: 검수 시나리오
    그대로(오래된 send 전용 + 새 readonly) → 409가 아니라 읽기 계정으로
    imported 1, 메시지의 gmail_account_id=읽기 계정, 발송 전용 계정 불변,
    발송은 여전히 선착 승인 계정(From=sender@)으로 나감.
  - `test_sync_multiple_read_accounts_each_have_own_cursor`: 읽기 계정
    2개 각자 가져오기, 계정별 sync_page_token('page-2' vs '') 저장,
    재동기화 시 각자 커서에서 재개(pageToken 전달 검증)·중복 0.
  - `test_sync_one_expired_account_does_not_block_others`: 한 계정 갱신
    실패(502 모사) → 나머지 계정 정상 수입, 오류는 만료 계정에만 기록,
    전 계정 실패 시 502.
- 전체: services/api **95 passed** / tests_billing **58 passed**
  (기존 158개 전부 회귀 통과). 서버 로직만 변경(콘솔 JS 불변).
- 실행 안 한 것(금지 준수): 실계정 발송·실 Google API 호출, 실결제,
  새 보안권한 동의(스코프 요구 변화 없음), 비밀키 출력.

## 운영 미검증

실계정 다중 연결 상태의 운영 동기화(러너 GMAIL_OPS)는 여전히 운영
크리덴셜·실계정에서만 확인 가능 — 기존 미검증 목록에 포함 유지.

## 다음

- Codex 추가 검수 지적 반영.
