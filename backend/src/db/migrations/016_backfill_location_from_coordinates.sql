-- Backfill the geospatial `location` column from the portable lat/lon
-- coordinates for leads that have coordinates but no location value.
--
-- Migration 013 attempted this but was disabled: its `location = ''`
-- comparison is invalid when the column is a PostGIS GEOGRAPHY (there is no
-- geography = text operator), so the statement failed on exactly the systems
-- where the backfill mattered. This version inspects the actual column type
-- and handles both branches explicitly.
--
-- Why it matters: "Near Me" searches on PostGIS installs are served by the
-- indexed `location` column. Leads whose coordinates were written directly
-- into lat/lon (manual SQL, older imports) otherwise stay invisible to every
-- radius search until they are re-saved one by one.

DO $$
DECLARE
    location_udt TEXT;
BEGIN
    SELECT udt_name INTO location_udt
    FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'location';

    IF location_udt = 'geography' THEN
        UPDATE leads
        SET location = ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
        WHERE lat IS NOT NULL
          AND lon IS NOT NULL
          AND location IS NULL;
    ELSE
        -- Plain-PostgreSQL fallback: the location column is TEXT ("lon lat").
        UPDATE leads
        SET location = lon::text || ' ' || lat::text
        WHERE lat IS NOT NULL
          AND lon IS NOT NULL
          AND (location IS NULL OR location = '');
    END IF;
END
$$;
