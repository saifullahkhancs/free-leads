/**
 * fixCountries — one-time data cleanup for the `countries` table.
 *
 * Before countryNormalizer existed, lead imports could create junk rows:
 *   - "America"   -> inserted with code "AM"  (or worse: RENAMED Armenia's
 *                    row to "America" via ON CONFLICT DO UPDATE)
 *   - "United States" -> inserted as a second US row with a made-up code
 *   - "USA" / "u.s.a." / "England" -> same problem
 *
 * This script scans every country row, resolves its name through the same
 * normalizer used at import time, and:
 *   1. renames rows whose code is canonical but whose name is not
 *      (e.g. the US row got renamed to "US" by the old bug),
 *   2. merges alias rows into the canonical row — reassigning leads,
 *      moving regions (and their cities) over, then deleting the duplicate,
 *   3. reports everything it did. Idempotent: run it as many times as you like.
 *
 * Usage: npm run fix:countries
 */
const { pool } = require("../config/db");
const { cleanName, normalizeCountry, canonicalName } = require("../utils/countryNormalizer");

async function mergeCountry(client, junkId, canonId) {
  const report = { leads: 0, regions: 0, cities: 0 };

  // Leads point at the junk country -> canonical.
  const leads = await client.query(
    "UPDATE leads SET country_id = $1 WHERE country_id = $2",
    [canonId, junkId]
  );
  report.leads = leads.rowCount;

  // Move each region over, re-pointing its cities, merging name duplicates.
  const { rows: junkRegions } = await client.query(
    "SELECT id, name FROM regions WHERE country_id = $1",
    [junkId]
  );
  for (const r of junkRegions) {
    const { rows } = await client.query(
      `INSERT INTO regions (country_id, name) VALUES ($1, $2)
       ON CONFLICT (country_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [canonId, r.name]
    );
    const moved = await client.query(
      `UPDATE cities SET region_id = $1, country_id = $2 WHERE region_id = $3`,
      [rows[0].id, canonId, r.id]
    );
    await client.query("DELETE FROM regions WHERE id = $1", [r.id]);
    report.regions += 1;
    report.cities += moved.rowCount;
  }

  // Cities on the junk country with no region (region_id NULL) -> canonical.
  const nullRegionCities = await client.query(
    "UPDATE cities SET country_id = $1 WHERE country_id = $2 AND region_id IS NULL",
    [canonId, junkId]
  );
  report.cities += nullRegionCities.rowCount;

  await client.query("DELETE FROM countries WHERE id = $1", [junkId]);
  return report;
}

async function fixCountries({ closePool = true } = {}) {
  const { rows } = await pool.query("SELECT id, name, code FROM countries ORDER BY id");
  const byCode = new Map(rows.map((r) => [r.code.toUpperCase(), r]));
  let renamed = 0;
  let merged = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const row of rows) {
      const code = row.code.toUpperCase();
      const key = cleanName(row.name);

      // 1) Canonical code but non-canonical name (old rename bug).
      const canonical = canonicalName(code);
      if (canonical && cleanName(canonical) !== key) {
        await client.query("UPDATE countries SET name = $1 WHERE id = $2", [canonical, row.id]);
        console.log(`RENAMED  #${row.id} ${row.name} (${code}) -> ${canonical}`);
        renamed++;
        continue;
      }

      // 2) Name resolves to an alias of a DIFFERENT country -> merge.
      const norm = normalizeCountry(row.name, null);
      if (norm && norm.code !== code) {
        const canon = byCode.get(norm.code);
        if (!canon) {
          console.log(`SKIP     #${row.id} ${row.name}: canonical ${norm.code} row not in table`);
          continue;
        }
        const rep = await mergeCountry(client, row.id, canon.id);
        console.log(
          `MERGED   #${row.id} ${row.name} (${code}) -> ${canon.name} (${norm.code}) ` +
          `[leads:${rep.leads} regions:${rep.regions} cities:${rep.cities}]`
        );
        merged++;
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log(`\nDone. ${renamed} renamed, ${merged} merged into canonical rows.`);
  if (closePool) await pool.end();
}

module.exports = { fixCountries };

if (require.main === module) {
  fixCountries().catch((err) => {
    console.error("fixCountries failed:", err);
    process.exit(1);
  });
}
