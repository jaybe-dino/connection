-- Existing approvals remain manual; only a new explicit send action opts a batch in.
ALTER TABLE outreach_batches ADD COLUMN auto_resume boolean NOT NULL DEFAULT false;
