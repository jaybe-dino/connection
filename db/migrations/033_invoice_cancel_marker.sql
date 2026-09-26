-- Persist signed cancellation evidence independently of response arrival order.
ALTER TABLE signup_invoices ADD COLUMN cancel_reported_at timestamptz;
