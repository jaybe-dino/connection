-- Additive only. Existing inferred invitation times remain historical/unverified.
CREATE TABLE IF NOT EXISTS dispatch_import_events (
    event_id bigserial PRIMARY KEY,
    batch_id text NOT NULL REFERENCES dispatch_batches(batch_id),
    dispatch_id bigint NOT NULL REFERENCES dispatches(dispatch_id),
    evidence_hash text NOT NULL,
    source text NOT NULL DEFAULT 'operator_csv',
    state text NOT NULL,
    occurred_at timestamptz,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(batch_id, dispatch_id, evidence_hash)
);
