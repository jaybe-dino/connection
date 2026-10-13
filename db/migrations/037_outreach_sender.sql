-- Preserve existing drafts. Sender is selected explicitly before approval.
ALTER TABLE outreach_batches ADD COLUMN gmail_account_id uuid REFERENCES gmail_accounts(account_id);
CREATE INDEX outreach_sender ON outreach_batches(gmail_account_id);
