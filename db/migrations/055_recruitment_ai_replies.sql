-- Paid generation reservation prevents duplicate calls after ambiguous network results.
CREATE TABLE recruitment_ai_replies (
 request_id uuid PRIMARY KEY,
 contact_id uuid NOT NULL REFERENCES recruitment_contacts(contact_id),
 reply_to_msg_id bigint NOT NULL REFERENCES mail_messages(msg_id),
 account_id uuid NOT NULL REFERENCES gmail_accounts(account_id),
 created_by text NOT NULL,
 input_hash text NOT NULL,
 context_ids jsonb NOT NULL,
 state text NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','complete','failed')),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruitment_ai_replies_created ON recruitment_ai_replies(created_at);
