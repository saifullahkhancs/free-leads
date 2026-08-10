const { pool } = require("../config/db");
const { parse } = require("csv-parse/sync");
const ApiError = require("../utils/ApiError");
const GeoMapper = require("../utils/GeoMapper");

/**
 * Get leads with keyset pagination and filters
 */
const getLeads = async ({
  q,
  country_id,
  region_id,
  city_id,
  industry,
  cursor,
  lat,
  lon,
  radius = 50000, // 50km default
  limit = 50,
  is_paid = false,
}) => {
  const values = [];
  let paramIndex = 1;

  let query = `
    SELECT 
      l.id,
      l.full_name,
      l.headline,
      l.company_name,
      l.job_title,
      l.industry,
      c.name as country_name,
      r.name as region_name,
      ci.name as city_name,
      l.is_verified,
      l.created_at
  `;

  if (lat && lon) {
    query += `, ST_Distance(l.location, ST_MakePoint($${paramIndex}, $${paramIndex + 1})::geography) as distance `;
    values.push(lon, lat);
    paramIndex += 2;
  }

  // Add sensitive fields only if is_paid is true
  if (is_paid) {
    query += `,
      l.email,
      l.linkedin_url,
      l.twitter_url,
      l.facebook_url,
      l.website_url,
      l.about
    `;
  } else {
    // Masked fields for free tier
    query += `,
      CASE 
        WHEN l.email IS NULL THEN NULL 
        ELSE overlay(l.email placing '****' from 2 for position('@' in l.email) - 2) 
      END as email,
      NULL as linkedin_url,
      NULL as twitter_url,
      NULL as facebook_url,
      NULL as website_url,
      NULL as about
    `;
  }

  query += `
    FROM leads l
    LEFT JOIN countries c ON l.country_id = c.id
    LEFT JOIN regions r ON l.region_id = r.id
    LEFT JOIN cities ci ON l.city_id = ci.id
    WHERE l.is_active = TRUE
  `;

  if (q) {
    query += ` AND l.search_vector @@ plainto_tsquery('english', $${paramIndex})`;
    values.push(q);
    paramIndex++;
  }

  if (lat && lon) {
    query += ` AND ST_DWithin(l.location, ST_MakePoint($1, $2)::geography, $${paramIndex})`;
    values.push(radius);
    paramIndex++;
  }

  if (country_id) {
    query += ` AND l.country_id = $${paramIndex}`;
    values.push(country_id);
    paramIndex++;
  }

  if (region_id) {
    query += ` AND l.region_id = $${paramIndex}`;
    values.push(region_id);
    paramIndex++;
  }

  if (city_id) {
    query += ` AND l.city_id = $${paramIndex}`;
    values.push(city_id);
    paramIndex++;
  }

  if (industry) {
    query += ` AND l.industry = $${paramIndex}`;
    values.push(industry);
    paramIndex++;
  }

  // Keyset pagination
  if (cursor) {
    query += ` AND l.id > $${paramIndex}`;
    values.push(cursor);
    paramIndex++;
  }

  query += ` ORDER BY l.id ASC LIMIT $${paramIndex}`;
  values.push(limit);

  const { rows } = await pool.query(query, values);
  
  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

  return {
    leads: rows,
    nextCursor,
  };
};

/**
 * Get a single lead by ID
 */
const getLeadById = async (id, is_paid = false) => {
  let query = `
    SELECT 
      l.*,
      c.name as country_name,
      r.name as region_name,
      ci.name as city_name
    FROM leads l
    LEFT JOIN countries c ON l.country_id = c.id
    LEFT JOIN regions r ON l.region_id = r.id
    LEFT JOIN cities ci ON l.city_id = ci.id
    WHERE l.id = $1 AND l.is_active = TRUE
  `;

  const { rows } = await pool.query(query, [id]);
  const lead = rows[0];

  if (!lead) {
    throw new ApiError(404, "Lead not found");
  }

  if (!is_paid) {
    // Mask sensitive fields
    lead.email = lead.email ? lead.email.replace(/(.).+(@.+)/, "$1****$2") : null;
    lead.linkedin_url = null;
    lead.twitter_url = null;
    lead.facebook_url = null;
    lead.website_url = null;
    lead.about = null;
  }

  return lead;
};

/**
 * Export leads to CSV
 * (In a real app, this would be a background job)
 */
const exportLeads = async (filters, is_paid = false) => {
  if (!is_paid) {
    throw new ApiError(403, "Only paid users can export leads");
  }

  const { leads } = await getLeads({ ...filters, limit: 10000, is_paid: true });
  
  // Convert to CSV
  if (leads.length === 0) return "";

  const headers = Object.keys(leads[0]).join(",");
  const rows = leads.map(lead => 
    Object.values(lead).map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(",")
  );

  return [headers, ...rows].join("\n");
};

/**
 * Resolve a free-text location (country/region/city) to geo IDs using the
 * standardized geo tables. Unknown entries are auto-created by GeoMapper.
 */
const resolveLocation = async (geoMapper, { country, country_code, region, city }) => {
  const countryId = country ? await geoMapper.getCountryId(country, country_code) : null;
  const regionId = countryId && region ? await geoMapper.getRegionId(countryId, region) : null;
  const cityId = countryId && city ? await geoMapper.getCityId(countryId, regionId, city) : null;
  return { cityId, regionId, countryId };
};

/**
 * Create a single lead (manual entry).
 * @param {object} data - { full_name, headline, about, email, linkedin_url,
 *   twitter_url, facebook_url, website_url, country, country_code, region,
 *   city, industry, company_name, job_title, source }
 */
const createLead = async (data) => {
  if (!data || !data.full_name || !String(data.full_name).trim()) {
    throw new ApiError(400, "full_name is required");
  }

  const geoMapper = new GeoMapper();
  await geoMapper.init();
  const { cityId, regionId, countryId } = await resolveLocation(geoMapper, data);

  const { rows } = await pool.query(
    `INSERT INTO leads (
       full_name, headline, about, email, linkedin_url, twitter_url,
       facebook_url, website_url, city_id, region_id, country_id,
       industry, company_name, job_title, source, is_verified
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, FALSE)
     RETURNING id, full_name, email, company_name, industry, created_at`,
    [
      String(data.full_name).trim(),
      data.headline || null,
      data.about || null,
      data.email || null,
      data.linkedin_url || null,
      data.twitter_url || null,
      data.facebook_url || null,
      data.website_url || null,
      cityId,
      regionId,
      countryId,
      data.industry || null,
      data.company_name || null,
      data.job_title || null,
      data.source || "manual",
    ]
  );

  return rows[0];
};

/**
 * Insert lead rows in a single UNNEST-based batch (no per-row INSERT loops —
 * see rules.md §3).
 */
const insertLeadBatch = async (batch, client) => {
  const query = `
    INSERT INTO leads (
      full_name, headline, about, email, linkedin_url, twitter_url, 
      facebook_url, website_url, city_id, region_id, country_id, 
      industry, company_name, job_title, source
    )
    SELECT * FROM UNNEST(
      $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], 
      $7::text[], $8::text[], $9::int[], $10::int[], $11::int[], 
      $12::text[], $13::text[], $14::text[], $15::text[]
    )
  `;

  const columns = [[], [], [], [], [], [], [], [], [], [], [], [], [], [], []];
  batch.forEach((row) => {
    row.forEach((val, i) => columns[i].push(val));
  });

  await client.query(query, columns);
};

/**
 * Import leads from raw CSV text.
 * Expected columns (all optional except full_name):
 *   full_name, headline, about, email, linkedin_url, twitter_url, facebook_url,
 *   website_url, country, country_code, region, city, industry, company_name,
 *   job_title
 * Returns { imported, failed, errors }.
 */
const importLeadsCsv = async (csvText, source = "csv_upload") => {
  let records;
  try {
    records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    throw new ApiError(400, `Could not parse CSV: ${err.message}`);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new ApiError(400, "CSV file is empty or has no data rows");
  }

  const geoMapper = new GeoMapper();
  await geoMapper.init();

  const BATCH_SIZE = 1000;
  const errors = [];
  let batch = [];
  let imported = 0;

  const flushBatch = async (client) => {
    if (batch.length === 0) return;
    await insertLeadBatch(batch, client);
    imported += batch.length;
    batch = [];
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const [index, record] of records.entries()) {
      const rowNumber = index + 2; // +1 header, +1 zero-index
      if (!record.full_name || !String(record.full_name).trim()) {
        errors.push({ row: rowNumber, error: "missing full_name" });
        continue;
      }

      try {
        const { cityId, regionId, countryId } = await resolveLocation(geoMapper, record);
        batch.push([
          String(record.full_name).trim(),
          record.headline || null,
          record.about || null,
          record.email || null,
          record.linkedin_url || null,
          record.twitter_url || null,
          record.facebook_url || null,
          record.website_url || null,
          cityId,
          regionId,
          countryId,
          record.industry || null,
          record.company_name || null,
          record.job_title || null,
          source,
        ]);

        if (batch.length >= BATCH_SIZE) {
          await flushBatch(client);
        }
      } catch (err) {
        errors.push({ row: rowNumber, error: err.message });
      }
    }

    await flushBatch(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    imported,
    failed: errors.length,
    total: records.length,
    errors,
  };
};

/**
 * Aggregated stats for the dashboard overview, plus the distinct list of
 * industries (for filter dropdowns) and a few recent leads.
 */
const getStats = async () => {
  const [countsRes, industriesRes, recentRes] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM leads WHERE is_active = TRUE)                  AS total_leads,
        (SELECT COUNT(*) FROM leads WHERE is_verified = TRUE)                AS verified_leads,
        (SELECT COUNT(DISTINCT industry) FROM leads WHERE industry IS NOT NULL) AS industries,
        (SELECT COUNT(*) FROM countries)                                     AS countries,
        (SELECT COUNT(*) FROM regions)                                       AS regions,
        (SELECT COUNT(*) FROM cities)                                        AS cities,
        (SELECT COUNT(*) FROM leads WHERE created_at >= now() - interval '7 days') AS leads_last_7_days,
        (SELECT COUNT(*) FROM leads WHERE created_at >= now() - interval '30 days') AS leads_last_30_days
    `),
    pool.query(
      `SELECT DISTINCT industry FROM leads
       WHERE industry IS NOT NULL AND industry <> ''
       ORDER BY industry ASC LIMIT 200`
    ),
    pool.query(`
      SELECT l.id, l.full_name, l.headline, l.company_name, l.industry,
             l.is_verified, l.created_at,
             c.name AS country_name, r.name AS region_name, ci.name AS city_name
      FROM leads l
      LEFT JOIN countries c ON l.country_id = c.id
      LEFT JOIN regions r ON l.region_id = r.id
      LEFT JOIN cities ci ON l.city_id = ci.id
      WHERE l.is_active = TRUE
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT 6
    `),
  ]);

  return {
    counts: countsRes.rows[0],
    industries: industriesRes.rows.map((r) => r.industry).filter(Boolean),
    recentLeads: recentRes.rows,
  };
};

module.exports = {
  getLeads,
  getLeadById,
  exportLeads,
  createLead,
  importLeadsCsv,
  getStats,
};
