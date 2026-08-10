-- Module 3 — User Profile (name + map-picked location)
-- Adds location fields to `users` so a user can pick an exact spot on a map
-- and have city / region (province/state) / country auto-filled via reverse
-- geocoding. Plain columns (no PostGIS requirement) keep it portable.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS location_lat      DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_lng      DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_city     VARCHAR(150),
    ADD COLUMN IF NOT EXISTS location_region   VARCHAR(150),  -- province / state / county
    ADD COLUMN IF NOT EXISTS location_country  VARCHAR(150),
    ADD COLUMN IF NOT EXISTS location_label    VARCHAR(300);  -- human-readable address

CREATE INDEX IF NOT EXISTS idx_users_location
    ON users (location_country, location_region, location_city);
