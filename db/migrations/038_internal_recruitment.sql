ALTER TABLE brands ADD COLUMN is_internal boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION record_verified_signup_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO signup_usage (brand_id, creator_id, joined_at, unit_price)
    SELECT m.brand_id, m.creator_id, m.joined_at, p.unit_price
    FROM memberships m
    JOIN brands b ON b.brand_id = m.brand_id
    JOIN creators c ON c.creator_id = m.creator_id
    CROSS JOIN signup_billing_policy p
    WHERE c.creator_id = NEW.creator_id AND c.verified AND NOT b.is_demo AND NOT b.is_internal
      AND m.joined_at >= p.effective_at
    ON CONFLICT (brand_id, creator_id) DO NOTHING;
    RETURN NEW;
END;
$$;
