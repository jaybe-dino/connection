CREATE TABLE recruitment_mappings (
 mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id text NOT NULL REFERENCES brands(brand_id),
 name text NOT NULL CHECK(length(btrim(name))>0),
 target_brand_id text NOT NULL REFERENCES brands(brand_id),
 product_id uuid NOT NULL REFERENCES brand_products(product_id),
 gmail_account_id uuid REFERENCES gmail_accounts(account_id),
 owner_name text NOT NULL DEFAULT '',
 country text NOT NULL DEFAULT '',
 language text NOT NULL DEFAULT '',
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','paused','archived')),
 subject text NOT NULL DEFAULT '',
 body text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruitment_mapping_workspace ON recruitment_mappings(workspace_id,updated_at DESC);
