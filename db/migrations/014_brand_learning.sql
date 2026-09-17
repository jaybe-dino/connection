CREATE TABLE brand_learning (
    learning_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_hash text NOT NULL,
    source_url text NOT NULL,
    state text NOT NULL DEFAULT 'processing',
    fields jsonb NOT NULL DEFAULT '{}',
    page_title text NOT NULL DEFAULT '',
    extracted_chars integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brand_learning_rate ON brand_learning(client_hash,created_at);
ALTER TABLE brand_applications ADD COLUMN learning_id uuid REFERENCES brand_learning(learning_id);
