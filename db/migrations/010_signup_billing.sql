-- Usage accounting only. No PG charge is triggered by this migration.
-- Historical/demo memberships must never become chargeable retroactively.
CREATE TABLE signup_billing_policy (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    effective_at timestamptz NOT NULL DEFAULT now(),
    unit_price integer NOT NULL DEFAULT 5000 CHECK (unit_price = 5000)
);
INSERT INTO signup_billing_policy (singleton) VALUES (true);

CREATE TABLE signup_usage (
    usage_id bigserial PRIMARY KEY,
    brand_id text NOT NULL REFERENCES brands(brand_id),
    creator_id text NOT NULL REFERENCES creators(creator_id),
    joined_at timestamptz NOT NULL,
    verified_at timestamptz NOT NULL DEFAULT now(),
    unit_price integer NOT NULL CHECK (unit_price = 5000),
    UNIQUE (brand_id, creator_id)
);
CREATE INDEX signup_usage_brand_date ON signup_usage (brand_id, verified_at);

CREATE FUNCTION record_verified_signup_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO signup_usage (brand_id, creator_id, joined_at, unit_price)
    SELECT m.brand_id, m.creator_id, m.joined_at, p.unit_price
    FROM memberships m
    JOIN brands b ON b.brand_id = m.brand_id
    JOIN creators c ON c.creator_id = m.creator_id
    CROSS JOIN signup_billing_policy p
    WHERE c.creator_id = NEW.creator_id AND c.verified AND NOT b.is_demo
      AND m.joined_at >= p.effective_at
    ON CONFLICT (brand_id, creator_id) DO NOTHING;
    RETURN NEW;
END;
$$;
CREATE TRIGGER membership_signup_usage AFTER INSERT ON memberships
    FOR EACH ROW EXECUTE FUNCTION record_verified_signup_usage();
CREATE TRIGGER creator_verified_signup_usage AFTER UPDATE OF verified ON creators
    FOR EACH ROW WHEN (NEW.verified AND NOT OLD.verified)
    EXECUTE FUNCTION record_verified_signup_usage();

ALTER TABLE brands ALTER COLUMN plan SET DEFAULT 'per_signup';
ALTER TABLE brand_applications ALTER COLUMN plan SET DEFAULT 'per_signup';
UPDATE brands SET plan = 'per_signup';
UPDATE brand_applications SET plan = 'per_signup' WHERE status = 'pending';
