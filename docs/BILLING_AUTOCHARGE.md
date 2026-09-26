# 카드 자동청구 (NICEpay 빌링키) 모듈 명세

glovek(service2@9c53250)의 NICEpay V2 카드등록→빌링키→정기청구 설계를
theprlist의 **달력월 후불 청구서** 모델로 이식한 것. 공식 규격은
nicepayments/nicepay-manual `api/payment-subscribe.md`,
`api/status-transaction.md` 기준.

## theprlist에 맞게 바꾼 것 (glovek 그대로가 아님)

| glovek 원본 | theprlist 이식 |
|---|---|
| 정액 플랜(pro 89k)·무료체험 | **없음** — 검증가입 5,000원(VAT 포함)/명, 고정료 0원 |
| 등록 직후 첫 달 즉시 청구 | **등록 시 청구 0원** — 빌키 발급만 |
| next_charge_at 주기 청구 | 기존 월마감 청구서(open)의 금액을 그대로 청구 |
| 실패 시 익일 자동 재승인, 3회 후 past_due | **자동 재시도 없음** — 청구서당 시도 평생 1회(영구 기록) |
| resultCode '0000'만으로 성공 판정 | 기존 `nicepay.payment_valid`(서명+금액+orderId+tid) + 취소표식 검증 |
| 자체 HMAC 웹훅(NICEPAY_WEBHOOK_SECRET) | **미복사** — 기존 서명 검증 웹훅/대사 방식 유지 |
| bid 평문 DB 저장 | Fernet(TOKEN_ENC_KEY) 암호문만. **키 없거나 불량이면 fail-closed**(등록 자체 거부, 평문 폴백 없음) |

## 환경변수 (전부 기본 off — 설정 전에는 아무 동작 없음)

| 변수 | 의미 |
|---|---|
| `NICEPAY_BILLING_ENABLED=1` | 카드 등록/해지 표면 활성. off면 콘솔에 입력창 대신 "준비 중" 표시, API는 503 |
| `NICEPAY_AUTOCHARGE_ENABLED=1` | 러너 자동청구 잡 활성. 등록만 켜고 청구는 끈 운영 가능 |
| `NICEPAY_BILLING_ENC_MODE=A2` | encData를 AES256/CBC로(기본 AES128/ECB). 둘 다 공식 예시 벡터로 단위테스트 고정 |
| `TOKEN_ENC_KEY` | bid 암호화 Fernet 키(기존 Gmail 토큰 키 재사용). **없으면 등록/청구 모두 거부** |
| (기존) `NICEPAY_ENABLED/CLIENT_KEY/SECRET_KEY` | 수동 결제와 공유 |

## 모듈

- `services/api/api/nicepay_billing.py` — encData 암호화(AES128 ECB
  PKCS7 hex / A2 AES256 CBC), `regist`/`charge`/`expire`/`find`
  (signData 포함, 호스트 allowlist·타임아웃·PaymentUnavailable 은 기존
  `nicepay.request`와 동일 규칙), fail-closed `enc_bid/dec_bid`.
- `db/migrations/034` — `brand_billing_keys`(브랜드당 1카드, 동의
  버전/시각/주체 기록) + `invoice_charge_attempts`(**invoice_id PK** =
  청구서당 자동청구 시도 평생 1회, `order_date` 원주문일 보관).
- `routes_payments.py` — `GET/POST/DELETE /brands/{b}/billing/card`,
  `autocharge_tick()`, reconcile 확장(tid 유실 시
  `GET /v1/payments/find/{orderId}?orderDate=` 로 복구).
- `runner_daemon.py` — `autocharge` 잡(시간당 1회, /runner/status jobs에
  활성/사유 노출. 기본 "차단됨(NICEPAY_AUTOCHARGE_ENABLED=0)").

## 수동 결제 vs 자동청구

| | 수동(기존, 유지) | 자동청구(신규) |
|---|---|---|
| 트리거 | 브랜드가 청구서의 [카드 결제] 클릭 → AUTHNICE 결제창 | 러너가 지난달 open 청구서를 스캔 |
| 승인 | /payments/return → 사전 GET 검증 → POST 승인 | 빌키 `POST /v1/subscribe/{bid}/payments` |
| orderId | invoice_id | invoice_id (동일 — 결제된 orderId는 PG가 재호출 거부 → PG측 이중승인도 차단) |
| paid 확정 | `settle` (서명·금액·orderId·tid·취소표식) | **같은 `settle`** |
| 실패 | review/재시도 안내 | 확정거절→open 복귀+안내(재시도 없음), 모호→review+find 대사 |

## 안전 규칙 요약

- 카드 원문(cardNo/idNo/cardPw)은 encData 생성에만 사용 — DB/로그/원장/
  오류응답 어디에도 없음. 등록 API는 pydantic 검증을 쓰지 않고 직접
  파싱해 **422 입력 반향 자체를 차단**. UI는 submit 즉시 입력을 비우고
  localStorage 미사용(단위테스트로 고정).
- 등록/해지는 브랜드 소유 계정 본인만(403: 타 브랜드·관리자·admin key).
  관리자는 상태 조회만 가능.
- 해지: `expire_pending` 커밋으로 **로컬 자동청구 즉시 중단** → PG 빌키
  삭제. PG 실패 시에도 청구는 멈춰 있고 같은 버튼으로 안전 재시도.
  미결제 청구서는 유지(수동 결제 가능).
- 자동청구 제외: 데모 브랜드, 현재월, 1,000원 미만(0원 포함),
  cancel_reported_at 표식, 이미 attempt가 있는 청구서, processing/paid.
- 동시성: 청구 전 FOR UPDATE + attempt INSERT(PK) 선점 — 반복 tick·다중
  워커·수동 결제 경쟁에서 중복 청구 0 (회귀 고정).

## 검증 상태

- 격리 테스트: tests_billing/test_autocharge.py 17건(공식 매뉴얼 암호화
  벡터 2건 포함) + 기존 결제 65건 그린. 실브라우저 8체크(flags off/on).
- **운영 실증 없음**: 실카드 등록·실빌키 발급·실자동청구·실해지는
  수행하지 않았다(상시 금지). 운영 활성화는 소유자가 NICEpay 계약에
  빌키(정기) 결제가 포함되어 있는지 확인 후 flags를 켜고, 소액 1건으로
  Codex 검수를 거친다.
