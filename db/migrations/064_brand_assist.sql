-- 콘솔 DM·회신 AI 초안 요청 기록(브랜드별 일일 한도) + 본인 연결 메일함 테스트 발송 원장.
CREATE TABLE IF NOT EXISTS brand_ai_draft_requests (
    request_id  bigserial PRIMARY KEY,
    brand_id    text NOT NULL REFERENCES brands(brand_id),
    kind        text NOT NULL CHECK (kind IN ('dm','reply')),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_ai_draft_requests_brand_time ON brand_ai_draft_requests(brand_id, created_at);

-- 발송 시도 전에 먼저 기록 — 결과를 모르면(review) 자동 재발송하지 않는다.
CREATE TABLE IF NOT EXISTS brand_test_mail (
    request_id  uuid PRIMARY KEY,
    brand_id    text NOT NULL REFERENCES brands(brand_id),
    account_id  uuid NOT NULL,
    recipient   text NOT NULL,
    subject     text NOT NULL,
    input_hash  text NOT NULL,
    state       text NOT NULL CHECK (state IN ('sending','sent','review','blocked')),
    provider_id text,
    created_by  text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_test_mail_brand_time ON brand_test_mail(brand_id, created_at DESC);
