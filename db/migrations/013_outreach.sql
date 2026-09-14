CREATE TABLE outreach_batches (
    batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id text NOT NULL REFERENCES brands(brand_id),
    subject text NOT NULL,
    body text NOT NULL,
    created_by text NOT NULL,
    approved_by text,
    approved_at timestamptz,
    state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outreach_recipients (
    recipient_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES outreach_batches(batch_id),
    email text NOT NULL,
    state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','review','blocked')),
    provider_id text,
    sent_at timestamptz,
    UNIQUE(batch_id,email)
);
CREATE INDEX outreach_batch_brand ON outreach_batches(brand_id,created_at DESC);
CREATE TABLE outreach_optouts (
    brand_id text NOT NULL REFERENCES brands(brand_id),
    email text NOT NULL,
    token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    opted_out_at timestamptz,
    PRIMARY KEY(brand_id,email)
);
ALTER TABLE mail_messages ADD COLUMN subject text NOT NULL DEFAULT '';
