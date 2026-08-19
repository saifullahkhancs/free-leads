-- Migration 014: Drop verified index on leads table
--
-- REMOVAL RATIONALE:
-- 1. `is_verified` is a low-cardinality boolean column. In a 5M+ row dataset,
--    Postgres query planner typically ignores full boolean B-tree indexes in favor of
--    Bitmap Index Scans on higher-cardinality filters (industry, country_id) or sequential scans.
-- 2. Every index adds write latency and memory overhead during bulk streaming CSV imports.
-- 3. Documented in INDEX_SETTINGS.md (retained in docs with status 'Removed from DB / Not Implemented').

DROP INDEX IF EXISTS idx_leads_verified;
