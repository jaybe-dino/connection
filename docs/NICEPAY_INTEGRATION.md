# The PR List — NICEpay 이식 조사

조사일: 2026-09-15. 상태: 가입당 5,000원 확정. 구독 플랜 제거·신규 검증 가입 집계 구현 및 로컬 검증 완료. 월말 합산·부가세 포함 확정. 청구서·NICEpay 결제창/승인/웹훅/조회 구현. 가맹점 설정 확인 전 실결제 비활성.

## 확인한 자료

- 사용자의 jay / Max 계정 Claude `glovek.space` 대화에 직접 질문하고 답변 확인.
- Claude 세션: https://claude.ai/epitaxy/session_012yB1gmQga7q51mZrdGKoLh
- 참조 저장소: `jaybe-dino/service2`, Claude 작업 브랜치 `claude/epic-edison-m35tv3`.
- 대상: `jaybe-dino/connection`, 기준 커밋 `168137c`.
- 기존 결제사: NICEpay 신 API. 서비스 코드에서는 V2라고 표기하지만 REST 경로는 `/v1/`.
- 기존 코드 파일: `src/lib/nicepay.ts`, `src/lib/payments.ts`, `src/app/api/payment/{start,return,subscribe,subscribe-mall,cancel,webhook}/route.ts`, `src/app/api/cron/subscribe/route.ts`.

## 기존 구현과 검증 범위

1. 단건: 주문 생성 → NICEpay 결제창 → 서버 금액 확인·승인 → 원장·이용권 저장.
2. 구독: 카드정보 서버 암호화 → 빌링키 발급 → 첫 회 즉시 청구 → 30일 주기 청구.
3. 해지: 빌링키 만료, 구독 상태 변경. 관리자 결제 취소/부분 취소 코드 존재.
4. 정기청구 실패 재시도 및 원장 코드 존재.
5. Claude는 카드 암호화·빌링키 발급 관련 실제 오류 수정 이력을 확인했다. 실제 자동 갱신 성공·웹훅 수신·현재 가맹점 운영 모드는 확인하지 못했다. 코드 존재를 운영 성공으로 간주하지 않는다.

## 그대로 복사하지 않을 부분

- 대상 API는 Python/FastAPI, 원본은 Next.js API Routes. 어댑터 동작을 포팅하고 기존 JWT/브랜드 소유권 검사와 결합한다.
- 원본 웹훅은 `x-nicepay-signature` + 별도 HMAC 키를 가정한다. 확인한 공식 신 API 문서는 본문의 `signature = hex(sha256(tid + amount + ediDate + SecretKey))` 검증과 금액 확인, `text/html`의 `OK` 응답을 명시한다. 실제 가맹점 API 계약에 맞춰 구현하고 서명 없는 알림으로 이용권을 부여하지 않는다.
- 결제창 인증 응답 서명은 `hex(sha256(authToken + clientId + amount + SecretKey))`. 승인 전 서버 주문번호·금액과 함께 검증한다.
- 원본의 결제창 응답 `bid` 폴백을 신뢰하지 않는다. 서버에서 검증된 빌링키만 저장한다.
- 승인/청구 시간 초과를 확정 실패로 취급하여 재청구하지 않는다. 미확정 주문으로 남기고 PG 조회로 조정한다.
- 원본의 금액 축소 토큰/테스트 가격·Glovek 상품·외부 어드민 전송은 대상 서비스에 복사하지 않는다.
- 빌링키는 서버에서 암호화 저장하며 원문 카드정보는 저장·로그·오류 응답에 포함하지 않는다.

## 대상 서비스 적용안

- 주문 접두어 `PRLIST`, 주문번호는 충돌 방지를 위한 충분한 무작위 식별자를 포함.
- 주문·거래·구독은 `brand_id` 기준으로 저장하고 회원은 자신의 브랜드만 조회/변경.
- 결제금액은 서버 상품 설정에서 결정. 클라이언트가 금액을 지정하지 않음.
- 고유 주문번호/PG 거래번호와 원자적 상태 전이로 콜백·웹훅·정기청구 중복 처리 방지.
- 콘솔에 요금제/결제 내역/갱신일/해지 화면을 연결하고 현재 데모 정산 수치와 실제 거래를 분리.
- 콜백 예정: `https://api.theprlist.net/payments/return`
- 웹훅 예정: `https://api.theprlist.net/payments/webhook`
- 결과 화면 예정: `https://console.theprlist.net/` 내 결제 결과 화면.
- 비밀키는 Railway 서버 환경변수에서만 사용. 새 도메인이 기존 가맹점에 추가 가능한지 또는 별도 상점이 필요한지는 NICEpay 계정/계약에서 확인 필요.

## 먼저 확정할 상품 조건

사용자가 Starter/Growth/Enterprise 없이 가입 1명당 5,000원으로 확정했다. 브랜드별 검증 가입 기준은 기존 기획을 유지하며, 같은 브랜드의 동일 크리에이터는 한 번만 집계한다.

- 결제 주기: 월말 합산, 다음 달 청구서에서 사용자가 카드 결제. 자동 카드 청구 방식은 아직 구현하지 않음.
- 부가세 포함 1명당 5,000원.
- 현재 집계 금액은 단가 × 가입 수이며 최종 청구 금액이 아니다.
- 신규 `signup_usage`는 정책 적용 이후의 비데모 검증 가입만 기록한다. 기존 멤버십을 소급 청구하지 않는다.
- 현재 사이트의 데모 가입 버튼은 실제 멤버십 생성과 연결돼 있지 않다. 결제 완성에는 실가입/검증 이벤트 연결도 필요하다.
- `GET /brands/{brand_id}/billing`은 브랜드 인증 후 누적 건수·이용금액을 반환한다. 현재 `collectionEnabled=false`다.
- 로컬 PostgreSQL 검증: 신규 검증 가입, 뒤늦은 검증, 중복/재가입/재검증, 데모 제외, 기존 가입 소급 제외, 3건=15,000원 통과.
- signup/console 빌드 및 두 runtime JavaScript 문법 검사 통과.

청구서는 한국 시간 기준 마감된 월만 발행한다. 조회 시 미발행 월을 마감하며 월·브랜드별 유일 제약으로 중복을 방지한다. 현재는 사용자가 청구서의 카드 결제 버튼을 누르는 방식이며 저장 카드 자동청구나 자동 환불은 없다.

NICEPAY_ENABLED=1, NICEPAY_CLIENT_KEY, NICEPAY_SECRET_KEY를 서버에 등록해야 결제창이 활성화된다. The PR List의 가맹점/추가 도메인 사용 가능 여부는 PG에서 확인 후 설정한다. SDK는 NICEpay Server 승인 방식이다. returnUrl은 고정 API 도메인만 사용한다. 공식 본문 서명·서버 거래 조회·주문 금액을 확인하며 응답 불확실 시 처리 상태를 유지하고 재승인하지 않는다.

검증: tests_billing/test_payments.py의 PostgreSQL/PG 모의 8개 테스트 통과. 실제 PG 승인·취소 테스트는 미실시. 이전 가입 데모 버튼과 실가입/검증 프로필 연결은 별도 미완성이므로 UI 클릭을 실제 청구 증거로 사용하지 않는다.

## 공식 기술 자료

- https://github.com/nicepayments/nicepay-manual/blob/main/api/payment-window-server.md
- https://github.com/nicepayments/nicepay-manual/blob/main/api/payment-subscribe.md
- https://github.com/nicepayments/nicepay-manual/blob/main/api/hook.md
- https://github.com/nicepayments/nicepay-manual/blob/main/api/status-transaction.md

## 구현 후 검증 항목

타 브랜드 접근 차단, 서버 가격 변조 방어, 콜백/웹훅 서명 오류·금액 불일치 거부, 동일 거래 중복 수신, 승인 후 DB 저장 실패/시간 초과 조정, 갱신 작업 동시 실행, 해지 후 청구 방지, PG 실패 시 이용권 미부여를 테스트한다. 최종적으로 별도 승인받은 테스트 거래의 결제·이용권·취소 상태를 PG와 대조한다.
