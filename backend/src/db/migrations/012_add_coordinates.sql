-- Add lat and lon columns for geocoding support
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;

-- Add indexes for coordinate-based queries
CREATE INDEX IF NOT EXISTS idx_leads_lat_lon ON leads (lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;
