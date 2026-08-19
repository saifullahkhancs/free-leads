-- Migration 015: Drop lead_hashes table and hash indexes on leads table
--
-- REMOVAL RATIONALE:
-- 1. Maximizing lead storage capacity and bulk import throughput for 5M+ scale.
-- 2. Eliminates 4 B-Tree indexes on leads (idx_leads_email_hash, idx_leads_phone_hash,
--    idx_leads_website_hash, idx_leads_biz_hash), saving 4 million index node writes per 1M rows imported.
-- 3. Drops the global ledger table `lead_hashes` and its unique index `uq_lead_hashes_type_hash`.
-- 4. Retained in documentation (schema.md and INDEX_SETTINGS.md) as "To be included in future".

DROP TABLE IF EXISTS lead_hashes CASCADE;
DROP INDEX IF EXISTS idx_leads_email_hash;
DROP INDEX IF EXISTS idx_leads_phone_hash;
DROP INDEX IF EXISTS idx_leads_website_hash;
DROP INDEX IF EXISTS idx_leads_biz_hash;
