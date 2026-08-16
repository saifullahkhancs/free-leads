/**
 * PostGIS availability helper.
 *
 * The `leads.location` column is created as GEOGRAPHY(POINT, 4326) when the
 * PostGIS extension is present, and falls back to a TEXT column ("lon lat")
 * on plain PostgreSQL (e.g. the bundled docker-compose `postgres:15` image).
 *
 * Callers that need to read/write coordinates through `location` use this
 * helper to pick the right SQL: the PostGIS functions (`ST_MakePoint`,
 * `ST_SetSRID`, `ST_DWithin`) either do not exist at all, or — worse — exist
 * while `leads.location` is still TEXT.
 *
 * IMPORTANT: this used to answer "does the geography TYPE exist?", which is
 * the wrong question. A database where PostGIS was installed *after* migration
 * 002 ran still has a TEXT `location` column, and every "Near Me" search then
 * emitted `ST_DWithin(l.location, ...)` against TEXT and failed with
 *   function st_dwithin(text, geography, numeric) does not exist
 * The whole /api/leads request 500'd, and the directory rendered an empty
 * result set — i.e. "Near Me finds no leads" even though the leads had
 * perfectly good coordinates. We now check the actual column type, so the
 * portable lat/lon (Haversine) path is used whenever `location` is not a
 * geography column.
 */

const { pool } = require("../config/db");

let cached = null;

async function hasPostGIS() {
  if (cached !== null) return cached;
  try {
    const { rows } = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'geography') AS has_type,
              (SELECT udt_name
                 FROM information_schema.columns
                WHERE table_name = 'leads' AND column_name = 'location'
                LIMIT 1) AS location_udt`
    );
    const row = rows[0] || {};
    // Usable only when BOTH the type exists and `leads.location` really is a
    // geography column. Anything else (TEXT fallback, missing column) means
    // the portable coordinate path must be used.
    cached = Boolean(row.has_type) && String(row.location_udt || "") === "geography";
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

/** Drop the memoized answer (used after migrations change the column type). */
function resetPostGIS() {
  cached = null;
}

module.exports = { hasPostGIS, setPostGIS, resetPostGIS };
