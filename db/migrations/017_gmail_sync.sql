CREATE TABLE gmail_oauth_states (
 state_hash text PRIMARY KEY, brand_id text NOT NULL,
 expires_at timestamptz NOT NULL, used_at timestamptz
);
ALTER TABLE gmail_accounts ADD COLUMN sync_page_token text NOT NULL DEFAULT '';
ALTER TABLE gmail_accounts ADD COLUMN synced_at timestamptz;
ALTER TABLE gmail_accounts ADD COLUMN sync_error text NOT NULL DEFAULT '';
ALTER TABLE mail_messages ADD COLUMN gmail_account_id uuid REFERENCES gmail_accounts(account_id);
ALTER TABLE mail_messages ADD COLUMN gmail_message_id text;
ALTER TABLE mail_messages ADD COLUMN gmail_thread_id text;
ALTER TABLE mail_messages ADD COLUMN rfc_message_id text;
CREATE UNIQUE INDEX mail_messages_gmail_unique ON mail_messages(gmail_account_id,gmail_message_id) WHERE gmail_message_id IS NOT NULL;
