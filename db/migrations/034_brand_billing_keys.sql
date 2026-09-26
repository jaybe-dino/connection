-- 034: 브랜드 카드 자동청구 — 암호화 빌링키 + 청구서별 영구 청구 시도 기록.
-- bid는 Fernet(TOKEN_ENC_KEY) 암호문만 저장한다(평문 저장 금지, fail-closed).
-- 카드 원문(cardNo/idNo/cardPw)은 어떤 컬럼에도 저장하지 않는다.
CREATE TABLE brand_billing_keys (
    brand_id text PRIMARY KEY REFERENCES brands(brand_id),
    bid_enc text NOT NULL,
    card_label text NOT NULL DEFAULT '',            -- PG 응답의 카드사명 등 표시용
    state text NOT NULL DEFAULT 'active'
        CHECK (state IN ('active','expire_pending','expired')),
    consent_version text NOT NULL,                   -- 동의문 버전
    consent_at timestamptz NOT NULL DEFAULT now(),   -- 동의 시각
    consent_user_id text NOT NULL,                   -- 동의 주체(등록자)
    expire_requested_at timestamptz,                 -- 해지 요청(자동청구 즉시 중단)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 청구서당 자동청구 시도는 평생 1회 — PK가 재시도·중복 청구를 구조적으로 막고,
-- 기록은 삭제하지 않는다. order_date는 승인 응답 유실 시
-- GET /v1/payments/find/{orderId}?orderDate= 대사에 쓰는 원주문일이다.
CREATE TABLE invoice_charge_attempts (
    invoice_id text PRIMARY KEY REFERENCES signup_invoices(invoice_id),
    brand_id text NOT NULL,
    order_id text NOT NULL,
    order_date text NOT NULL CHECK (order_date ~ '^[0-9]{8}$'),
    outcome text NOT NULL DEFAULT 'pending'
        CHECK (outcome IN ('pending','paid','failed','review')),
    fail_code text NOT NULL DEFAULT '',
    fail_msg text NOT NULL DEFAULT '',
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);
CREATE INDEX invoice_charge_attempts_brand ON invoice_charge_attempts(brand_id);
