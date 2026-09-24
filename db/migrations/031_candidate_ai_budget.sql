-- Count attempted evaluations, including provider failures, separately from cache.
ALTER TABLE candidate_ai_scores ADD COLUMN IF NOT EXISTS input_hash text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS candidate_ai_usage (
    usage_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_id text NOT NULL REFERENCES brands(brand_id),
    quantity integer NOT NULL CHECK(quantity > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_ai_usage_brand_day ON candidate_ai_usage(brand_id,created_at);
