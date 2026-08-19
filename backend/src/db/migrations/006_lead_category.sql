-- Module 6 — Lead category + faceted search support
-- Adds a `category` dimension (broader bucket above `industry`, e.g. "Technology",
-- "Healthcare", "Finance") so the directory can offer Category → Industry →
-- Country → State → City filtering, and indexes the columns the facet queries hit.

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS category VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_leads_category ON leads (category);
-- Removed for capacity/ingest optimization: See Migration 016 & INDEX_SETTINGS.md
-- CREATE INDEX IF NOT EXISTS idx_leads_category_industry ON leads (category, industry);
-- Deprecated & Removed: idx_leads_verified removed to optimize bulk import throughput and avoid low-cardinality index overhead.
-- See Migration 014 and INDEX_SETTINGS.md.
-- CREATE INDEX IF NOT EXISTS idx_leads_verified ON leads (is_verified);

-- Composite indexes removed for capacity/ingest optimization (See Migration 016 & INDEX_SETTINGS.md):
-- CREATE INDEX IF NOT EXISTS idx_leads_active_country ON leads (is_active, country_id);
-- CREATE INDEX IF NOT EXISTS idx_leads_active_region  ON leads (is_active, region_id);
-- CREATE INDEX IF NOT EXISTS idx_leads_active_city    ON leads (is_active, city_id);

-- Backfill a sensible category for existing rows from their industry so the
-- new filter is never empty on an already-populated database. Order matches
-- the CATEGORY_RULES list in leadService.js (first match wins).
UPDATE leads
SET category = CASE
    WHEN industry ILIKE '%travel%'  OR industry ILIKE '%hospitalit%'
      OR industry ILIKE '%hotel%'   OR industry ILIKE '%restaurant%'
      OR industry ILIKE '%food%'    OR industry ILIKE '%beverage%'
      OR industry ILIKE '%tourism%' OR industry ILIKE '%catering%'   THEN 'Hospitality & Food'
    WHEN industry ILIKE '%health%'  OR industry ILIKE '%biotech%'
      OR industry ILIKE '%medical%' OR industry ILIKE '%pharma%'
      OR industry ILIKE '%clinic%'  OR industry ILIKE '%wellness%'
      OR industry ILIKE '%dental%'                                   THEN 'Healthcare'
    WHEN industry ILIKE '%software%' OR industry ILIKE '%saas%'
      OR industry ILIKE '%cloud%'    OR industry ILIKE '%devtool%'
      OR industry ILIKE '%tech%'     OR industry ILIKE '%artificial intelligence%'
      OR industry ILIKE '%cyber%'    OR industry ILIKE '%telecom%'
      OR industry ILIKE '%data%'     OR industry ILIKE '%semiconductor%' THEN 'Technology'
    WHEN industry ILIKE '%fintech%'  OR industry ILIKE '%bank%'
      OR industry ILIKE '%financ%'   OR industry ILIKE '%capital%'
      OR industry ILIKE '%equity%'   OR industry ILIKE '%insur%'
      OR industry ILIKE '%invest%'   OR industry ILIKE '%accounting%'
      OR industry ILIKE '%venture%'                                  THEN 'Finance'
    WHEN industry ILIKE '%market%'   OR industry ILIKE '%media%'
      OR industry ILIKE '%advertis%' OR industry ILIKE '%publish%'
      OR industry ILIKE '%broadcast%'                                THEN 'Marketing & Media'
    WHEN industry ILIKE '%design%'   OR industry ILIKE '%creative%'
      OR industry ILIKE '%agency%'   OR industry ILIKE '%photograph%'
      OR industry ILIKE '%architect%' OR industry ILIKE '%entertainment%'
      OR industry ILIKE '%music%'    OR industry ILIKE '%film%'      THEN 'Design & Creative'
    WHEN industry ILIKE '%retail%'   OR industry ILIKE '%commerce%'
      OR industry ILIKE '%consumer%' OR industry ILIKE '%shop%'
      OR industry ILIKE '%store%'    OR industry ILIKE '%fashion%'
      OR industry ILIKE '%apparel%'  OR industry ILIKE '%grocer%'    THEN 'Retail & E-commerce'
    WHEN industry ILIKE '%real estate%' OR industry ILIKE '%property%'
      OR industry ILIKE '%construct%'   OR industry ILIKE '%realty%'
      OR industry ILIKE '%building%'                                 THEN 'Real Estate & Construction'
    WHEN industry ILIKE '%education%' OR industry ILIKE '%edtech%'
      OR industry ILIKE '%school%'    OR industry ILIKE '%universit%'
      OR industry ILIKE '%training%'  OR industry ILIKE '%academ%'
      OR industry ILIKE '%college%'                                  THEN 'Education'
    WHEN industry ILIKE '%manufact%'  OR industry ILIKE '%industrial%'
      OR industry ILIKE '%logistic%'  OR industry ILIKE '%transport%'
      OR industry ILIKE '%energy%'    OR industry ILIKE '%mining%'
      OR industry ILIKE '%automotive%' OR industry ILIKE '%agricultur%'
      OR industry ILIKE '%shipping%'  OR industry ILIKE '%aerospace%' THEN 'Industrial & Logistics'
    WHEN industry ILIKE '%legal%'     OR industry ILIKE '%law%'
      OR industry ILIKE '%attorney%'  OR industry ILIKE '%government%'
      OR industry ILIKE '%public sector%' OR industry ILIKE '%nonprofit%'
      OR industry ILIKE '%defense%'                                  THEN 'Legal & Government'
    WHEN industry IS NOT NULL AND industry <> ''                     THEN 'Professional Services'
    ELSE NULL
END
WHERE category IS NULL;
