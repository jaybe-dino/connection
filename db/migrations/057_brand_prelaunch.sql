-- Prelaunch interest only: no membership, account, contract or billing side effects.
CREATE TABLE IF NOT EXISTS brand_prelaunch_applications (
 request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand text NOT NULL CHECK(length(trim(brand)) BETWEEN 1 AND 100),
 email text NOT NULL CHECK(length(email) <= 254),
 created_at timestamptz NOT NULL DEFAULT now(),
 consent_version text NOT NULL DEFAULT 'prelaunch-20261022',
 UNIQUE(email,brand)
);
