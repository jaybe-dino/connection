-- Preserve issued invoices; apply the introductory price to unbilled usage.
ALTER TABLE signup_billing_policy DROP CONSTRAINT signup_billing_policy_unit_price_check;
ALTER TABLE signup_billing_policy ADD CHECK (unit_price > 0);
ALTER TABLE signup_billing_policy ALTER COLUMN unit_price SET DEFAULT 50;
ALTER TABLE signup_usage DROP CONSTRAINT signup_usage_unit_price_check;
ALTER TABLE signup_usage ADD CHECK (unit_price > 0);
ALTER TABLE signup_invoices DROP CONSTRAINT signup_invoices_check;
ALTER TABLE signup_invoices ADD CHECK (amount > 0);
UPDATE signup_billing_policy SET unit_price = 50;
UPDATE signup_usage SET unit_price = 50 WHERE invoice_id IS NULL;
