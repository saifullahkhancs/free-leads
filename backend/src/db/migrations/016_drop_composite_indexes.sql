-- Migration 016: Drop composite indexes on leads table
--
-- REMOVAL RATIONALE:
-- 1. Maximizing lead storage capacity and bulk ingestion throughput at 5M+ scale.
-- 2. Eliminates 5 composite B-Tree indexes:
--    - idx_leads_country_city (country_id, city_id)
--    - idx_leads_active_country (is_active, country_id)
--    - idx_leads_active_region (is_active, region_id)
--    - idx_leads_active_city (is_active, city_id)
--    - idx_leads_category_industry (category, industry)
-- 3. Standalone indexes on country_id, region_id, city_id, category, and industry remain active.
-- 4. Documented in schema.md and INDEX_SETTINGS.md (retained in documentation with status 'Removed from DB').

DROP INDEX IF EXISTS idx_leads_country_city;
DROP INDEX IF EXISTS idx_leads_active_country;
DROP INDEX IF EXISTS idx_leads_active_region;
DROP INDEX IF EXISTS idx_leads_active_city;
DROP INDEX IF EXISTS idx_leads_category_industry;
