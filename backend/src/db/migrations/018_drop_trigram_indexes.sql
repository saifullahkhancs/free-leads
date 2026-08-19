-- Migration 018: Disable fuzzy company/name indexes until they are needed.
--
-- The current lead search uses the GIN index on `search_vector`; it does not
-- issue ILIKE or trigram-similarity predicates against `company_name` or
-- `full_name`. Keeping these two large GIN indexes would therefore consume disk
-- space and add write amplification to every lead insert/update without helping
-- the current query path.

DROP INDEX IF EXISTS idx_leads_company_trgm;
DROP INDEX IF EXISTS idx_leads_full_name_trgm;

-- Future re-enable definitions (requires the pg_trgm extension, which migration
-- 002 keeps installed):
-- CREATE INDEX CONCURRENTLY idx_leads_company_trgm
--   ON leads USING GIN (company_name gin_trgm_ops);
-- CREATE INDEX CONCURRENTLY idx_leads_full_name_trgm
--   ON leads USING GIN (full_name gin_trgm_ops);
