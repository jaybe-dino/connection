-- Reusable preparation plans only. Does not schedule or approve mail sending.
CREATE TABLE recruitment_repeat_plans (
 plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL, definition jsonb NOT NULL,
 cadence text NOT NULL CHECK(cadence IN ('weekly','monthly')),
 next_prepare_on date NOT NULL,
 revision integer NOT NULL DEFAULT 1,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE TABLE recruitment_multi_saves (
 request_id uuid PRIMARY KEY, input_hash text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
