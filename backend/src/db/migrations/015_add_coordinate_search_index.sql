-- Speed up the plain-PostgreSQL fallback used by the "Near Me" search.
--
-- PostGIS deployments continue to use the GiST index on leads.location. The
-- bundled postgres:15 image has no PostGIS, so radius searches first narrow by
-- latitude and then calculate exact Haversine distance from lat/lon.
CREATE INDEX IF NOT EXISTS idx_leads_active_lat_lon
  ON leads (lat, lon)
  WHERE is_active = TRUE AND lat IS NOT NULL AND lon IS NOT NULL;
