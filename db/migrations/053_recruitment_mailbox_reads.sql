-- Read state is shared by the operations team, independent for each mailbox/contact.
CREATE TABLE recruitment_mailbox_reads (
 account_id uuid NOT NULL REFERENCES gmail_accounts(account_id),
 email text NOT NULL CHECK(email=lower(trim(email))),
 last_read_msg_id bigint NOT NULL DEFAULT 0,
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,email)
);
CREATE INDEX mail_messages_mailbox_contact ON mail_messages(gmail_account_id,thread_id,msg_id);
ALTER TABLE gmail_accounts ADD COLUMN sent_sync_page_token text NOT NULL DEFAULT '';
ALTER TABLE gmail_accounts ADD COLUMN sent_sync_error text NOT NULL DEFAULT '';
