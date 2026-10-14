ALTER TABLE outreach_batches ADD COLUMN target_brand_id text REFERENCES brands(brand_id);
