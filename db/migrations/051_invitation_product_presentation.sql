ALTER TABLE outreach_batches ADD COLUMN proposal_locale text NOT NULL DEFAULT '';
CREATE TABLE product_invitation_profiles (
 product_id uuid PRIMARY KEY REFERENCES brand_products(product_id),
 summary text NOT NULL DEFAULT '',
 image_url text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);
