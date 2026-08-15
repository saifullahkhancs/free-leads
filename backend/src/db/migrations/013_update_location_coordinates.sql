-- Update existing leads' location column to use lat/lon coordinates
-- This migration updates the PostGIS location column for leads that have lat/lon coordinates

DO $$
BEGIN
    -- Check if PostGIS is available
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geography') THEN
        -- Update location column for leads that have lat/lon but no location
        UPDATE leads 
        SET location = ST_SetSRID(ST_MakePoint(lon, lat), 4326)
        WHERE lat IS NOT NULL 
          AND lon IS NOT NULL 
          AND (location IS NULL OR location = '');
    END IF;
END
$$;
