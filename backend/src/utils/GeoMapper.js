const { pool } = require("../config/db");

class GeoMapper {
  constructor() {
    this.countries = new Map(); // name -> id
    this.countriesByCode = new Map(); // code -> id
    this.regions = new Map();   // countryId:name -> id
    this.cities = new Map();    // regionId:countryId:name -> id
  }

  async init() {
    // Pre-load existing geo data
    const countries = await pool.query("SELECT id, name, code FROM countries");
    countries.rows.forEach(c => {
      this.countries.set(c.name.toLowerCase(), c.id);
      this.countriesByCode.set(c.code.toUpperCase(), c.id);
    });

    const regions = await pool.query("SELECT id, country_id, name FROM regions");
    regions.rows.forEach(r => this.regions.set(`${r.country_id}:${r.name.toLowerCase()}`, r.id));

    const cities = await pool.query("SELECT id, region_id, country_id, name FROM cities");
    cities.rows.forEach(c => this.cities.set(`${c.region_id}:${c.country_id}:${c.name.toLowerCase()}`, c.id));
  }

  async getCountryId(name, code) {
    const nameKey = name.toLowerCase();
    const codeKey = code ? code.toUpperCase() : null;

    // Try code first (most reliable)
    if (codeKey && this.countriesByCode.has(codeKey)) return this.countriesByCode.get(codeKey);
    // Try name
    if (this.countries.has(nameKey)) return this.countries.get(nameKey);

    // If not found, only insert if we have at least a name
    const { rows } = await pool.query(
      "INSERT INTO countries (name, code) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id",
      [name, code || name.substring(0, 2).toUpperCase()]
    );
    const id = rows[0].id;
    this.countries.set(nameKey, id);
    if (code) this.countriesByCode.set(code.toUpperCase(), id);
    return id;
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
