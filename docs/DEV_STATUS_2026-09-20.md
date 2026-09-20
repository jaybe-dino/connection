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
