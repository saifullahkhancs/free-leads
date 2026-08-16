-- Repair databases where PostGIS was installed AFTER migration 002 ran.
--
-- Migration 002 creates `leads.location` as GEOGRAPHY(POINT, 4326) when the
-- PostGIS extension is already available, and as TEXT otherwise. Installing
-- PostGIS later leaves the column as TEXT forever, which produced a genuinely
-- broken "Near Me": the API detected PostGIS, emitted
--   ST_DWithin(l.location, ST_MakePoint(...)::geography, radius)
-- against a TEXT column, and PostgreSQL aborted the request with
--   function st_dwithin(text, geography, numeric) does not exist
-- The frontend saw a failed search and rendered an empty result set, so the
-- radius filter looked like it simply never matched anything.
--
-- The application no longer trusts the extension alone (it checks the real
-- column type), but upgrading the column is still worth doing: it restores the
-- indexed geospatial search instead of the slower portable fallback.

DO $$
DECLARE
    location_udt TEXT;
BEGIN
    -- Nothing to do without PostGIS: the TEXT fallback is correct there.
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geography') THEN
        RAISE NOTICE 'PostGIS not installed: leaving leads.location as TEXT';
        RETURN;
    END IF;

    SELECT udt_name INTO location_udt
    FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'location';

    IF location_udt IS NULL THEN
        ALTER TABLE leads ADD COLUMN location GEOGRAPHY(POINT, 4326);
    ELSIF location_udt <> 'geography' THEN
        -- The column holds the "lon lat" text fallback (or nothing). Rebuild it
        -- as a real geography column straight from the portable coordinates,
        -- which are always authoritative.
        ALTER TABLE leads DROP COLUMN location;
        ALTER TABLE leads ADD COLUMN location GEOGRAPHY(POINT, 4326);
    END IF;

    -- Backfill every lead that has coordinates but no geography value, so no
    -- lead is invisible to the indexed radius search.
    UPDATE leads
    SET location = ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
    WHERE lat IS NOT NULL
      AND lon IS NOT NULL
      AND location IS NULL;

    CREATE INDEX IF NOT EXISTS idx_leads_location ON leads USING GIST (location);
END
$$;
