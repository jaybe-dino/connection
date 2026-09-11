-- 브랜드 발신 이메일 (BRAND_SENDER_PLAN.md §4)
-- 상태: unverified → email_verified → dns_pending → active → paused

CREATE TABLE IF NOT EXISTS brand_senders (
    sender_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        text NOT NULL,
    email           text NOT NULL,
    domain          text NOT NULL,
    kind            text NOT NULL DEFAULT 'outreach',   -- outreach | notify
    state           text NOT NULL DEFAULT 'unverified',
    from_name       text NOT NULL DEFAULT '',
    reply_to        text NOT NULL DEFAULT '',
    signature       text NOT NULL DEFAULT '',
    verify_code     text,                               -- 6자리 소유 확인 코드
    dns_records     jsonb NOT NULL DEFAULT '[]',        -- 표시용 SPF/DKIM/DMARC
    esp_ref         text,                               -- ESP 도메인 인증 ID
    warmup_started_at timestamptz,
    bounce_rate     real NOT NULL DEFAULT 0,
    complaint_rate  real NOT NULL DEFAULT 0,
    open_rate       real NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    verified_at     timestamptz,
    UNIQUE (brand_id, email)
);

CREATE TABLE IF NOT EXISTS sender_events (
    event_id   bigserial PRIMARY KEY,
    sender_id  uuid NOT NULL REFERENCES brand_senders(sender_id),
    type       text NOT NULL,          -- registered | verified | dns_ok | paused | resumed
    detail     text NOT NULL DEFAULT '',
    at         timestamptz NOT NULL DEFAULT now()
);
