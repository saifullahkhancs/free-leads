-- Module 2 — Leads Data Layer
-- Mirrors Section 3.1 (Location hierarchy, Leads) and Section 3.2 (Indexing)

-- ---------------------------------------------------------------------------
-- Location hierarchy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS countries (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(120) NOT NULL,
    code    CHAR(2) UNIQUE NOT NULL          -- ISO 3166-1 alpha-2
);

CREATE TABLE IF NOT EXISTS regions (
    id          SERIAL PRIMARY KEY,
    country_id  INT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
    name        VARCHAR(120) NOT NULL,
    UNIQUE (country_id, name)
);

CREATE TABLE IF NOT EXISTS cities (
    id          SERIAL PRIMARY KEY,
    region_id   INT REFERENCES regions(id) ON DELETE CASCADE,
    country_id  INT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
    name        VARCHAR(120) NOT NULL
);

-- ---------------------------------------------------------------------------
-- PostGIS (optional) — the `location` column uses GEOGRAPHY when the PostGIS
-- extension is available. On plain PostgreSQL (e.g. the bundled docker-compose
-- `postgres:15` image or embedded dev databases) we fall back to a TEXT column
-- so the rest of the schema still applies. Geo radius searches require PostGIS.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PostGIS extension unavailable: falling back to TEXT location column';
END
$$;

-- ---------------------------------------------------------------------------
-- Leads (the core dataset)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
    id              BIGSERIAL PRIMARY KEY,
    full_name       VARCHAR(255) NOT NULL,
    headline        VARCHAR(255),
    about           TEXT,
    email           VARCHAR(255),
    linkedin_url    VARCHAR(500),
    twitter_url     VARCHAR(500),
    facebook_url    VARCHAR(500),
    website_url     VARCHAR(500),
    city_id         INT REFERENCES cities(id) ON DELETE SET NULL,
    region_id       INT REFERENCES regions(id) ON DELETE SET NULL,
    country_id      INT REFERENCES countries(id) ON DELETE SET NULL,
    industry        VARCHAR(150),
    company_name    VARCHAR(255),
    job_title       VARCHAR(255),
    source          VARCHAR(100),          -- where the record was ingested from
    -- `location` is added below: GEOGRAPHY(POINT, 4326) with PostGIS,
    -- otherwise a TEXT fallback ("lon lat") so migrations succeed anywhere.
    is_verified     BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    search_vector   TSVECTOR              -- generated column for full-text search
);

-- Add the geospatial column: GEOGRAPHY(POINT, 4326) when PostGIS is present,
-- otherwise a plain TEXT fallback so migrations apply on vanilla PostgreSQL.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geography') THEN
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326);
    ELSE
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS location TEXT;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Indexing strategy (critical at 5M rows)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_country_id    ON leads (country_id);
CREATE INDEX IF NOT EXISTS idx_leads_region_id     ON leads (region_id);
CREATE INDEX IF NOT EXISTS idx_leads_city_id       ON leads (city_id);
CREATE INDEX IF NOT EXISTS idx_leads_industry      ON leads (industry);
CREATE INDEX IF NOT EXISTS idx_leads_country_city  ON leads (country_id, city_id);

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_leads_search_vector ON leads USING GIN (search_vector);

-- Geospatial index for "Near Me" searches (only possible with PostGIS)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geography') THEN
        CREATE INDEX IF NOT EXISTS idx_leads_location ON leads USING GIST (location);
    END IF;
END
$$;

-- pg_trgm for partial name/company search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_leads_company_trgm  ON leads USING GIN (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_full_name_trgm ON leads USING GIN (full_name gin_trgm_ops);

-- Location indexes
CREATE INDEX IF NOT EXISTS idx_regions_country     ON regions (country_id);
CREATE INDEX IF NOT EXISTS idx_cities_region       ON cities (region_id);

-- Trigger to update search_vector
CREATE OR REPLACE FUNCTION leads_search_vector_update() RETURNS trigger AS $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.full_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.company_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.headline, '')), 'C');
  return new;
end
$$ LANGUAGE plpgsql;

CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE
ON leads FOR EACH ROW EXECUTE FUNCTION leads_search_vector_update();
