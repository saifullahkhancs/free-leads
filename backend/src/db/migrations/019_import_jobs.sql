-- 019_import_jobs.sql
-- Background CSV import jobs (Redis/BullMQ queue). The HTTP request only
-- uploads the file and enqueues a job; a worker processes it in batches and
-- writes live progress here, so big imports can never hit a gateway timeout.

CREATE TABLE IF NOT EXISTS import_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    filename      TEXT,
    file_path     TEXT,
    source        TEXT NOT NULL DEFAULT 'csv_upload',
    -- queued | processing | completed | failed | cancelled
    status        TEXT NOT NULL DEFAULT 'queued',
    -- { limit, offset, fieldMapping } as sent by the client
    options       JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_rows    BIGINT,
    processed     BIGINT NOT NULL DEFAULT 0,
    imported      BIGINT NOT NULL DEFAULT 0,
    skipped       BIGINT NOT NULL DEFAULT 0,
    failed        BIGINT NOT NULL DEFAULT 0,
    -- first N row-level errors, capped by IMPORT_JOB_MAX_ERRORS
    errors        JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_user_created
    ON import_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status
    ON import_jobs (status)
    WHERE status IN ('queued', 'processing');
