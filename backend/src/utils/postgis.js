/**
 * PostGIS availability helper.
 *
 * The `leads.location` column is created as GEOGRAPHY(POINT, 4326) when the
 * PostGIS extension is present, and falls back to a TEXT column ("lon lat")
 * on plain PostgreSQL (e.g. the bundled docker-compose `postgres:15` image).
 *
 * Callers that need to write coordinates into `location` use this helper to
 * pick the right SQL: the PostGIS functions (`ST_MakePoint`/`ST_SetSRID`) do
 * not exist on a plain PostgreSQL server, so using them unconditionally made
 * every geocode/import-with-coordinates UPDATE fail with
 * "function st_makepoint(...) does not exist".
 */

const { pool } = require("../config/db");

let cached = null;

async function hasPostGIS() {
  if (cached !== null) return cached;
  try {
    const { rows } = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geography') AS has_postgis"
    );
    cached = Boolean(rows[0] && rows[0].has_postgis);
  } catch {
    // If we can't inspect the catalog (e.g. transient connection error),
    // assume no PostGIS so writes fall back to the TEXT location column.
    cached = false;
  }
  return cached;
}

/** For tests / callers that already know the answer — bypasses the cache. */
function setPostGIS(value) {
  cached = Boolean(value);
}

module.exports = { hasPostGIS, setPostGIS };
