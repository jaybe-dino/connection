-- Additive: existing batches/joins/billing remain unchanged.
ALTER TABLE recruitment_mappings ADD COLUMN campaign_id text REFERENCES campaigns(campaign_id);
ALTER TABLE outreach_batches ADD COLUMN campaign_id text REFERENCES campaigns(campaign_id);
CREATE TABLE recruitment_application_links (
 link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_hash text NOT NULL UNIQUE,
 recipient_id uuid NOT NULL UNIQUE REFERENCES outreach_recipients(recipient_id),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE recruitment_applications (
 application_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 link_id uuid NOT NULL REFERENCES recruitment_application_links(link_id),
 creator_id text NOT NULL REFERENCES creators(creator_id),
 brand_id text NOT NULL REFERENCES brands(brand_id),
 product_id uuid REFERENCES brand_products(product_id),
 campaign_id text REFERENCES campaigns(campaign_id),
 status text NOT NULL DEFAULT 'applied' CHECK(status='applied'),
 applied_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(link_id,creator_id)
);
CREATE INDEX recruitment_application_brand ON recruitment_applications(brand_id,applied_at DESC);
