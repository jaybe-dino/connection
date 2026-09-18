-- Progress uses actual sending days, never calendar age. No invented delivery metrics.
ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS warmup_days integer NOT NULL DEFAULT 0;
ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS warmup_last_date date;
ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS sending_paused boolean NOT NULL DEFAULT false;
ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS pause_reason text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS outreach_ai_requests (
    request_id bigserial PRIMARY KEY,
    brand_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_ai_requests_brand_time ON outreach_ai_requests(brand_id,created_at);
