-- Product/brand/sender assignments are immutable snapshots on saved drafts.
ALTER TABLE outreach_batches ADD COLUMN product_id uuid REFERENCES brand_products(product_id);
ALTER TABLE outreach_batches ADD COLUMN product_name text;
ALTER TABLE outreach_batches ADD COLUMN mapping_key text;
ALTER TABLE outreach_recipients ADD COLUMN personalized_subject text;
ALTER TABLE outreach_recipients ADD COLUMN personalized_body text;
CREATE TABLE outreach_bulk_saves (
    brand_id text NOT NULL REFERENCES brands(brand_id),
    request_id uuid NOT NULL,
    input_hash text NOT NULL,
    batch_ids jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brand_id, request_id)
);
