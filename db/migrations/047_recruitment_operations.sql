-- Additive only. No contacts imported, queued mail approved, or billing triggered.
ALTER TABLE outreach_batches ADD COLUMN offer_code text NOT NULL DEFAULT '';
CREATE TABLE recruitment_thread_tasks (
 thread_id uuid PRIMARY KEY REFERENCES mail_threads(thread_id),
 label text NOT NULL DEFAULT 'unreviewed' CHECK(label IN ('unreviewed','interested','paid_only','conditional','wrong_country','declined','optout','address_error','question','other')),
 owner_name text NOT NULL DEFAULT '',
 next_action text NOT NULL DEFAULT '',
 due_at timestamptz,
 note text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mail_delivery_feedback (
 feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_id uuid NOT NULL REFERENCES outreach_recipients(recipient_id),
 account_id uuid NOT NULL REFERENCES gmail_accounts(account_id),
 email text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('delivered','hard_bounce','complaint')),
 source_key text NOT NULL,
 evidence text NOT NULL,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,source_key,recipient_id,kind)
);
CREATE INDEX mail_feedback_email ON mail_delivery_feedback(email,kind);
CREATE INDEX mail_feedback_account_time ON mail_delivery_feedback(account_id,created_at);
CREATE TABLE outreach_contact_blocks (
 email text PRIMARY KEY,
 reason text NOT NULL CHECK(reason IN ('hard_bounce','complaint','manual_stop')),
 evidence text NOT NULL,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- No automatic unblock: an operator must separately review any correction.
CREATE TABLE recruitment_cost_entries (
 entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id text NOT NULL REFERENCES brands(brand_id),
 period_start date NOT NULL,
 period_end date NOT NULL CHECK(period_end>period_start),
 category text NOT NULL CHECK(category IN ('email','product','shipping','labor','other','revenue')),
 amount_krw numeric(16,2) NOT NULL CHECK(amount_krw>=0),
 evidence text NOT NULL,
 request_id uuid NOT NULL UNIQUE,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruitment_cost_period ON recruitment_cost_entries(brand_id,period_start,period_end);
CREATE INDEX outreach_recipient_normalized_email ON outreach_recipients(lower(email));
