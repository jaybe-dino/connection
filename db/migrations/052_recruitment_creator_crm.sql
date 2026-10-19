ALTER TABLE mail_messages ADD COLUMN sent_at timestamptz;
CREATE TABLE recruitment_contacts (
 contact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE CHECK(email=lower(trim(email))),
 owner_name text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','waiting_creator','waiting_internal','complete','on_hold')),
 next_action text NOT NULL DEFAULT '', due_at timestamptz,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE recruitment_contact_notes (
 note_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contact_id uuid NOT NULL REFERENCES recruitment_contacts(contact_id),
 request_id uuid NOT NULL UNIQUE, body text NOT NULL, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mail_reply_draft_requests (
 request_id uuid PRIMARY KEY, thread_id uuid NOT NULL REFERENCES mail_threads(thread_id),
 input_hash text NOT NULL, msg_id bigint NOT NULL REFERENCES mail_messages(msg_id),
 created_by text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Existing sent outreach is enough to identify a company-managed contact, not a verified person.
INSERT INTO recruitment_contacts(email)
SELECT DISTINCT lower(trim(t.creator_email)) FROM mail_threads t
WHERE t.brand_id='dino-recruitment' AND t.creator_email LIKE '%@%'
AND EXISTS(SELECT 1 FROM mail_messages m WHERE m.thread_id=t.thread_id AND m.direction='out' AND m.state='sent' AND m.gmail_account_id IS NOT NULL)
ON CONFLICT(email) DO NOTHING;
CREATE TABLE recruitment_contact_events (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 contact_id uuid NOT NULL REFERENCES recruitment_contacts(contact_id),
 kind text NOT NULL, detail jsonb NOT NULL, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_pool_email ON creator_pool(lower(trim(email))) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_thread_email ON mail_threads(brand_id,lower(trim(creator_email)));
CREATE INDEX crm_notes_contact ON recruitment_contact_notes(contact_id,created_at DESC);
CREATE INDEX crm_events_contact ON recruitment_contact_events(contact_id,event_id DESC);
CREATE INDEX crm_message_activity ON mail_messages(thread_id,COALESCE(sent_at,created_at),msg_id);
