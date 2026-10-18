-- Additive import ledger. Rollback excludes this job's unused pool rows, never deletes contacts.
CREATE TABLE pool_import_jobs (
 job_id uuid PRIMARY KEY, source_name text NOT NULL, source_sha256 text NOT NULL,
 source_note text NOT NULL, expected_rows integer NOT NULL CHECK(expected_rows BETWEEN 1 AND 600000),
 processed_rows integer NOT NULL DEFAULT 0, inserted_rows integer NOT NULL DEFAULT 0,
 skipped_rows integer NOT NULL DEFAULT 0, error_rows integer NOT NULL DEFAULT 0,
 next_chunk integer NOT NULL DEFAULT 0, state text NOT NULL DEFAULT 'importing'
 CHECK(state IN ('importing','complete','excluded')), created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pool_import_chunks (
 job_id uuid NOT NULL REFERENCES pool_import_jobs, chunk_index integer NOT NULL,
 payload_hash text NOT NULL, result jsonb NOT NULL, PRIMARY KEY(job_id,chunk_index)
);
CREATE TABLE pool_import_members (
 job_id uuid NOT NULL REFERENCES pool_import_jobs, creator_id uuid NOT NULL REFERENCES creator_pool,
 PRIMARY KEY(job_id,creator_id)
);
CREATE TABLE recruitment_brand_setup (
 brand_id text PRIMARY KEY REFERENCES brands, company_email text NOT NULL,
 countries text[] NOT NULL DEFAULT '{}', owner_name text NOT NULL DEFAULT '',
 source_note text NOT NULL, missing_fields text[] NOT NULL DEFAULT '{}',
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
