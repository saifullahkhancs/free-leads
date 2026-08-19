-- Module additions — Dedup fingerprints, Google OAuth, phone column.
-- Translated from the WP plugins' SHA1 email-hash dedup + Google login.

-- ---------------------------------------------------------------------------
-- Leads: add a phone column and dedup fingerprint hashes.
-- hashes are CHAR(40) hex of a SHA-1 (or SHA-256) of the normalized value.
-- Rows with no value get a random hash so they're never treated as duplicates.
-- ---------------------------------------------------------------------------
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS phone         VARCHAR(40),
    ADD COLUMN IF NOT EXISTS email_hash    VARCHAR(40),
    ADD COLUMN IF NOT EXISTS phone_hash    VARCHAR(40),
    ADD COLUMN IF NOT EXISTS website_hash  VARCHAR(40),
    ADD COLUMN IF NOT EXISTS biz_hash      VARCHAR(40),
    ADD COLUMN IF NOT EXISTS is_duplicate  BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS duplicate_of  BIGINT;

-- Deprecated / Removed for performance to maximize lead capacity:
-- See Migration 015, schema.md and INDEX_SETTINGS.md
-- CREATE INDEX IF NOT EXISTS idx_leads_email_hash   ON leads (email_hash);
-- CREATE INDEX IF NOT EXISTS idx_leads_phone_hash   ON leads (phone_hash);
-- CREATE INDEX IF NOT EXISTS idx_leads_website_hash ON leads (website_hash);
-- CREATE INDEX IF NOT EXISTS idx_leads_biz_hash     ON leads (biz_hash);

-- Global dedup ledger — removed for initial scale-up; to be re-enabled in future.
-- CREATE TABLE IF NOT EXISTS lead_hashes (
--     id          BIGSERIAL PRIMARY KEY,
--     hash        VARCHAR(40) NOT NULL,
--     hash_type   VARCHAR(20) NOT NULL,      -- 'email'|'phone'|'website'|'biz'
--     lead_id     BIGINT REFERENCES leads(id) ON DELETE CASCADE,
--     created_at  TIMESTAMPTZ DEFAULT now()
-- );
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_hashes_type_hash ON lead_hashes (hash_type, hash);

-- ---------------------------------------------------------------------------
-- Users: Google OAuth link (only present when the account uses "Sign in with
-- Google"). A user may have both a password and a google_id.
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS google_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS google_email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);
