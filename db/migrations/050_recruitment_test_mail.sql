-- Separate operator test ledger. Never enrolled into outreach/creator billing.
CREATE TABLE recruitment_test_mail (
 request_id uuid PRIMARY KEY,
 input_hash text NOT NULL,
 mapping_id uuid NOT NULL REFERENCES recruitment_mappings(mapping_id),
 account_id uuid NOT NULL REFERENCES gmail_accounts(account_id),
 recipient text NOT NULL,
 subject text NOT NULL,
 body text NOT NULL,
 state text NOT NULL CHECK(state IN ('sending','accepted','review','not_sent','demo')),
 provider_id text,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Repair missing default rooms only for existing company-managed customer brands.
-- Existing room names, messages, membership guards and billing are preserved.
INSERT INTO cells(cell_id,brand_id,name,visibility,member_count)
SELECT 'cell-'||b.brand_id||'-main',b.brand_id,b.name||' 라운지','apply_approve',0
FROM recruitment_brand_setup s JOIN brands b USING(brand_id)
WHERE NOT b.is_internal AND NOT b.is_demo AND b.suspended_at IS NULL
ON CONFLICT(cell_id) DO NOTHING;
