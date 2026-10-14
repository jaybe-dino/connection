ALTER TABLE gmail_accounts ADD COLUMN last_send_at timestamptz;
CREATE TABLE gmail_delivery_events (
 event_id bigserial PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES gmail_accounts(account_id),
 provider_message_id text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,provider_message_id)
);
CREATE INDEX gmail_delivery_window ON gmail_delivery_events(account_id,accepted_at);
INSERT INTO gmail_delivery_events(account_id,provider_message_id,accepted_at)
 SELECT gmail_account_id,gmail_message_id,created_at FROM mail_messages
 WHERE direction='out' AND state='sent' AND gmail_account_id IS NOT NULL
 AND gmail_message_id IS NOT NULL ON CONFLICT DO NOTHING;
ALTER TABLE outreach_batches ADD COLUMN sending_paused boolean NOT NULL DEFAULT false;
