const { pool } = require("../config/db");
const { cleanName, cleanCode, normalizeCountry, canonicalName } = require("./countryNormalizer");

class GeoMapper {
  constructor() {
    this.countries = new Map(); // cleaned name -> id
    this.countriesByCode = new Map(); // code -> id
    this.regions = new Map();   // countryId:name -> id
    this.cities = new Map();    // regionId:countryId:name -> id
  }

  async init() {
    // Pre-load existing geo data
    const countries = await pool.query("SELECT id, name, code FROM countries");
    countries.rows.forEach(c => {
      this.countries.set(c.name.toLowerCase(), c.id);
      // Also index by cleaned name so "United States of America" and
      // "United  States. of America" both hit the same row.
      const cleaned = cleanName(c.name);
      if (cleaned) this.countries.set(cleaned, c.id);
      this.countriesByCode.set(c.code.toUpperCase(), c.id);
    });

    const regions = await pool.query("SELECT id, country_id, name FROM regions");
    regions.rows.forEach(r => this.regions.set(`${r.country_id}:${r.name.toLowerCase()}`, r.id));

    const cities = await pool.query("SELECT id, region_id, country_id, name FROM cities");
    cities.rows.forEach(c => this.cities.set(`${c.region_id}:${c.country_id}:${c.name.toLowerCase()}`, c.id));
  }

  /**
   * Resolve a country to its row id. "US", "usa", "u.s.a.", "America",
   * "United States" and "United States of America" all land on the SAME row.
   *
   * 1. clean code -> ISO code -> canonical row (or insert canonical if the
   *    table isn't seeded yet)
   * 2. cleaned name -> alias table -> canonical code -> same as above
   * 3. cleaned name -> existing row in the table
   * 4. fallback: insert with a collision-safe generated code — never
   *    renaming/overwriting an existing country row.
   */
  async getCountryId(name, code) {
    const rawName = String(name || "").trim();
    if (!rawName && !code) return null;
    const key = cleanName(rawName);

    const norm = normalizeCountry(rawName, code);
    const canonCode = norm ? norm.code : null;

    if (canonCode) {
      const existing = this.countriesByCode.get(canonCode);
      if (existing) {
        // Alias hit ("America") — remember the alias name for instant
        // hits on subsequent rows of the same import.
        if (key) this.countries.set(key, existing);
        return existing;
      }
      // Countries table not seeded for this code — insert the canonical row.
      const insertName = canonicalName(canonCode) || rawName.slice(0, 120);
      const { rows } = await pool.query(
        `INSERT INTO countries (name, code) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [insertName, canonCode]
      );
      const id = rows[0].id;
      this.countries.set(cleanName(insertName), id);
      if (key) this.countries.set(key, id);
      this.countriesByCode.set(canonCode, id);
      return id;
    }

    // Cleaned exact-name match against existing rows.
    if (key && this.countries.has(key)) return this.countries.get(key);

    // Last resort: insert the raw name with a collision-safe code. We never
    // use ON CONFLICT ... DO UPDATE SET name here — the old code could
    // silently RENAME Armenia (code AM) to "America" when an import said
    // "America". On conflict we just look the code up instead.
    const fallbackCode = this._freeCode(key || "XX");
    const { rows } = await pool.query(
      `INSERT INTO countries (name, code) VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING RETURNING id`,
      [rawName.slice(0, 120), fallbackCode]
    );
    let id = rows[0] ? rows[0].id : null;
    if (!id) {
      // Race: another process inserted the code between our check and insert.
      const { rows: sel } = await pool.query(
        "SELECT id FROM countries WHERE code = $1 LIMIT 1",
        [fallbackCode]
      );
      id = sel[0] ? sel[0].id : null;
    }
    if (!id) return null; // give up — the lead keeps a NULL country
    if (key) this.countries.set(key, id);
    this.countriesByCode.set(fallbackCode, id);
    return id;
  }

  /**
   * Pick a 2-char code that does not collide with any known country.
   * Prefers the first two letters of the cleaned name ("wakanda" -> "WA"),
   * then "X" + first letter, then "XX", then "X1".."X9" as a last resort.
   */
  _freeCode(key) {
    const letters = key.replace(/[^a-z]/g, "").toUpperCase();
    const candidates = [];
    if (letters.length >= 2) candidates.push(letters.slice(0, 2));
    if (letters.length >= 1) candidates.push(`X${letters[0]}`);
    candidates.push("XX");
    for (const c of candidates) {
      if (!this.countriesByCode.has(c)) return c;
    }
    let n = 1;
    while (this.countriesByCode.has(`X${n}`)) n++;
    return `X${n}`;
  }

  async getRegionId(countryId, name) {
    if (!name) return null;
    const key = `${countryId}:${name.toLowerCase()}`;
    if (this.regions.has(key)) return this.regions.get(key);

    const { rows } = await pool.query(
      "INSERT INTO regions (country_id, name) VALUES ($1, $2) ON CONFLICT (country_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
      [countryId, name]
    );
    const id = rows[0].id;
    this.regions.set(key, id);
    return id;
  }

  async getCityId(countryId, regionId, name) {
    if (!name) return null;
    const key = `${regionId}:${countryId}:${name.toLowerCase()}`;
    if (this.cities.has(key)) return this.cities.get(key);

    // No unique constraint on cities other than ID, but we want to avoid duplicates in our mapping
    let { rows } = await pool.query(
      "SELECT id FROM cities WHERE country_id = $1 AND (region_id = $2 OR (region_id IS NULL AND $2 IS NULL)) AND name = $3",
      [countryId, regionId, name]
    );

    if (rows.length > 0) {
      const id = rows[0].id;
      this.cities.set(key, id);
      return id;
    }

    ({ rows } = await pool.query(
      "INSERT INTO cities (country_id, region_id, name) VALUES ($1, $2, $3) RETURNING id",
      [countryId, regionId, name]
    ));
    const id = rows[0].id;
    this.cities.set(key, id);
    return id;
  }
}

module.exports = GeoMapper;
