const { pool, query, withTransaction } = require("../config/db");
const { parse } = require("csv-parse/sync");
const ApiError = require("../utils/ApiError");
const GeoMapper = require("../utils/GeoMapper");
const dedupService = require("./dedupService");
const quotaService = require("./quotaService");
const auditService = require("./auditService");

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

  let queryText = `
    SELECT
      l.id,
      l.full_name,
      l.headline,
      l.company_name,
      l.job_title,
      l.industry,
      l.phone,
      c.name as country_name,
      r.name as region_name,
      ci.name as city_name,
      l.is_verified,
      l.created_at
  `;

  if (lat && lon) {
    queryText += `, ST_Distance(l.location, ST_MakePoint($${paramIndex}, $${paramIndex + 1})::geography) as distance `;
    values.push(lon, lat);
    paramIndex += 2;
  }

  // Add sensitive fields only if is_paid is true
  if (is_paid) {
    queryText += `,
      l.email,
      l.linkedin_url,
      l.twitter_url,
      l.facebook_url,
      l.website_url,
      l.about
    `;
  } else {
    // Masked fields for free tier
    queryText += `,
      CASE
        WHEN l.email IS NULL THEN NULL
        ELSE overlay(l.email placing '****' from 2 for position('@' in l.email) - 2)
      END as email,
      NULL as linkedin_url,
      NULL as twitter_url,
      NULL as facebook_url,
      NULL as website_url,
      NULL as about,
      NULL as phone
    `;
  }

  queryText += `
    FROM leads l
    LEFT JOIN countries c ON l.country_id = c.id
    LEFT JOIN regions r ON l.region_id = r.id
    LEFT JOIN cities ci ON l.city_id = ci.id
    WHERE l.is_active = TRUE
  `;

  if (q) {
    queryText += ` AND l.search_vector @@ plainto_tsquery('english', $${paramIndex})`;
    values.push(q);
    paramIndex++;
  }

  if (lat && lon) {
    queryText += ` AND ST_DWithin(l.location, ST_MakePoint($1, $2)::geography, $${paramIndex})`;
    values.push(radius);
    paramIndex++;
  }

  if (country_id) {
    queryText += ` AND l.country_id = $${paramIndex}`;
    values.push(country_id);
    paramIndex++;
  }

  if (region_id) {
    queryText += ` AND l.region_id = $${paramIndex}`;
    values.push(region_id);
    paramIndex++;
  }

  if (city_id) {
    queryText += ` AND l.city_id = $${paramIndex}`;
    values.push(city_id);
    paramIndex++;
  }

  if (industry) {
    queryText += ` AND l.industry = $${paramIndex}`;
    values.push(industry);
    paramIndex++;
  }

  // Keyset pagination
  if (cursor) {
    queryText += ` AND l.id > $${paramIndex}`;
    values.push(cursor);
    paramIndex++;
  }

  queryText += ` ORDER BY l.id ASC LIMIT $${paramIndex}`;
  values.push(limit);

  const { rows } = await pool.query(queryText, values);

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
  let queryText = `
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

  const { rows } = await pool.query(queryText, [id]);
  const lead = rows[0];

  if (!lead) {
    throw new ApiError(404, "Lead not found");
  }

  if (!is_paid) {
    // Mask sensitive fields
    lead.email = lead.email ? lead.email.replace(/(.).+(@.+)/, "$1****$2") : null;
    lead.phone = null;
    lead.linkedin_url = null;
    lead.twitter_url = null;
    lead.facebook_url = null;
    lead.website_url = null;
    lead.about = null;
  }

  return lead;
};

/**
 * Server-side, gated export.
 * Enforces: login (auth middleware) + format whitelist + plan row cap +
 * daily export quota + audit log.
 * Supports formats: csv, json (plans only advertise formats we can produce).
 */
const exportLeads = async ({ userId, isAdmin, filters = {}, format = "csv", ip }) => {
  const plan = await quotaService.getActivePlan(userId);
  const allowedFormats = (plan.allowed_formats || ["csv"]).map((f) => String(f).toLowerCase());
  const fmt = String(format).toLowerCase();

  if (!allowedFormats.includes(fmt)) {
    throw new ApiError(
      403,
      `Export format "${fmt}" is not available on your plan. Allowed: ${allowedFormats.join(", ")}`,
      { code: "FORMAT_NOT_ALLOWED", allowedFormats }
    );
  }

  const maxRows = plan.max_export_per_req || 100;
  const requested = filters.limit ? parseInt(filters.limit, 10) : maxRows;
  const rowLimit = Math.max(1, Math.min(requested, maxRows));

  // Check + increment the daily export quota up front (admin bypasses limits).
  const quota = await quotaService.checkAndIncrement(userId, "export", rowLimit, {
    isAdmin,
    ip,
  });

  const { leads } = await getLeads({ ...filters, limit: rowLimit, is_paid: true });

  auditService.log({
    actorId: userId,
    action: "lead_export",
    entityType: "lead",
    metadata: { count: leads.length, format: fmt, plan: plan.code, requested: rowLimit },
    ip,
  });

  const serialized = serializeLeads(leads, fmt);
  return {
    content: serialized.content,
    contentType: serialized.contentType,
    filename: `freeleads_export_${new Date().toISOString().slice(0, 10)}.${serialized.ext}`,
    count: leads.length,
    quota,
  };
};

function serializeLeads(leads, format) {
  if (format === "json") {
    return { content: JSON.stringify(leads, null, 2), contentType: "application/json", ext: "json" };
  }

  // csv (default)
  if (leads.length === 0) {
    return { content: "", contentType: "text/csv", ext: "csv" };
  }
  const headers = Object.keys(leads[0]).join(",");
  const rows = leads.map((lead) =>
    Object.values(lead)
      .map((val) => `"${(val || "").toString().replace(/"/g, '""')}"`)
      .join(",")
  );
  return { content: [headers, ...rows].join("\n"), contentType: "text/csv", ext: "csv" };
}

// ---------------------------------------------------------------------------
// Location resolution
// ---------------------------------------------------------------------------
const resolveLocation = async (geoMapper, { country, country_code, region, city }) => {
  const countryId = country ? await geoMapper.getCountryId(country, country_code) : null;
  const regionId = countryId && region ? await geoMapper.getRegionId(countryId, region) : null;
  const cityId = countryId && city ? await geoMapper.getCityId(countryId, regionId, city) : null;
  return { cityId, regionId, countryId };
};

/**
 * Create a single lead (manual entry).
 */
const createLead = async (data) => {
  if (!data || !data.full_name || !String(data.full_name).trim()) {
    throw new ApiError(400, "full_name is required");
  }

  const geoMapper = new GeoMapper();
  await geoMapper.init();
  const { cityId, regionId, countryId } = await resolveLocation(geoMapper, data);
  const fp = dedupService.fingerprint(data);

  const { rows } = await pool.query(
    `INSERT INTO leads (
       full_name, headline, about, email, phone, linkedin_url, twitter_url,
       facebook_url, website_url, city_id, region_id, country_id,
       industry, company_name, job_title, source, is_verified,
       email_hash, phone_hash, website_hash, biz_hash
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, FALSE,
             $17,$18,$19,$20)
     RETURNING id, full_name, email, phone, company_name, industry, created_at`,
    [
      String(data.full_name).trim(),
      data.headline || null,
      data.about || null,
      data.email || null,
      data.phone || null,
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
      fp.email_hash,
      fp.phone_hash,
      fp.website_hash,
      fp.biz_hash,
    ]
  );

  await dedupService.recordHashes(rows[0].id, fp);
  return rows[0];
};

/**
 * Insert lead rows in a single UNNEST-based batch (no per-row INSERT loops).
 * rows: [{ record, cityId, regionId, countryId, fp }]
 * Returns the array of inserted lead ids.
 */
const insertLeadBatch = async (client, rows) => {
  if (rows.length === 0) return [];
  const cols = Array.from({ length: 20 }, () => []);

  rows.forEach(({ record, cityId, regionId, countryId, fp }) => {
    const v = [
      String(record.full_name || "").trim() || null,
      record.headline || null,
      record.about || null,
      record.email || null,
      record.phone || null,
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
      record.source || "csv_upload",
      fp.email_hash,
      fp.phone_hash,
      fp.website_hash,
      fp.biz_hash,
    ];
    v.forEach((val, i) => cols[i].push(val));
  });

  const { rows: inserted } = await client.query(
    `INSERT INTO leads (
       full_name, headline, about, email, phone, linkedin_url, twitter_url,
       facebook_url, website_url, city_id, region_id, country_id,
       industry, company_name, job_title, source,
       email_hash, phone_hash, website_hash, biz_hash
     )
     SELECT * FROM UNNEST(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
       $7::text[], $8::text[], $9::text[], $10::int[], $11::int[], $12::int[],
       $13::text[], $14::text[], $15::text[], $16::text[],
       $17::text[], $18::text[], $19::text[], $20::text[]
     )
     RETURNING id`,
    cols
  );
  return inserted.map((r) => r.id);
};

/** Multi-row insert of dedup fingerprints into the global ledger. */
const recordHashesBatch = async (client, ids, fingerprints) => {
  const entries = [];
  ids.forEach((leadId, i) => {
    const fp = fingerprints[i];
    entries.push(
      ["email", fp.email_hash, leadId],
      ["phone", fp.phone_hash, leadId],
      ["website", fp.website_hash, leadId],
      ["biz", fp.biz_hash, leadId]
    );
  });
  if (entries.length === 0) return;
  const typeArr = [];
  const hashArr = [];
  const leadArr = [];
  entries.forEach(([t, h, lid]) => {
    typeArr.push(t);
    hashArr.push(h);
    leadArr.push(lid);
  });
  await client.query(
    `INSERT INTO lead_hashes (hash_type, hash, lead_id)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::bigint[])
     ON CONFLICT (hash_type, hash) DO NOTHING`,
    [typeArr, hashArr, leadArr]
  );
};

/**
 * Shared bulk-insert pipeline: geo-mapping + global dedup + UNNEST batch insert,
 * all inside one transaction. Used by both CSV import and the external ingest API.
 * records: array of flat objects with lead fields (email/phone/website_url/etc.).
 * Returns { imported, skipped, failed, total, errors }.
 */
const bulkInsertRecords = async (records, source = "csv_upload") => {
  const geoMapper = new GeoMapper();
  await geoMapper.init();

  const BATCH_SIZE = 1000;
  const errors = [];
  const seen = new Set(); // fingerprints seen earlier in THIS call
  let batch = [];
  let imported = 0;
  let skipped = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const [index, record] of records.entries()) {
      if (!record.full_name || !String(record.full_name).trim()) {
        errors.push({ row: index + 2, error: "missing full_name" });
        continue;
      }
      try {
        const { cityId, regionId, countryId } = await resolveLocation(geoMapper, record);
        batch.push({ record: { ...record, source }, cityId, regionId, countryId });
        if (batch.length >= BATCH_SIZE) {
          await flushBatch(client);
        }
      } catch (err) {
        errors.push({ row: index + 2, error: err.message });
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

  async function flushBatch(client) {
    if (batch.length === 0) return;
    const { survivors, skipped: s, fingerprints } = await dedupService.filterDuplicates(
      batch.map((b) => b.record),
      { seen }
    );
    skipped += s;
    if (survivors.length === 0) {
      batch = [];
      return;
    }
    // Pair survivors back with their geo ids.
    const survivorSet = new Set(survivors);
    const survivorRows = batch.filter((b) => survivorSet.has(b.record));
    const survivorFp = fingerprints;
    const ids = await insertLeadBatch(client, survivorRows, survivorFp);
    await recordHashesBatch(client, ids, survivorFp);
    imported += ids.length;
    batch = [];
  }

  return { imported, skipped, failed: errors.length, total: records.length, errors };
};

/**
 * Import leads from raw CSV text (editor/admin/super_admin).
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

  const result = await bulkInsertRecords(records, source);
  return result;
};

/**
 * External ingest — machine-to-machine. Accepts either an array of records
 * or { category: [records...] } grouping (category is ignored for the person
 * model but preserved as a source tag).
 */
const ingestLeads = async (payload, source = "ingest") => {
  let records = [];
  if (Array.isArray(payload)) {
    records = payload;
  } else if (payload && typeof payload === "object") {
    for (const [category, items] of Object.entries(payload)) {
      if (Array.isArray(items)) {
        items.forEach((r) => {
          records.push(typeof r === "object" && r !== null ? { ...r, category } : {});
        });
      }
    }
  }
  if (records.length === 0) {
    throw new ApiError(400, "ingest payload is empty");
  }
  return bulkInsertRecords(records, source);
};

/**
 * Aggregated stats for the dashboard overview.
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
        (SELECT COUNT(*) FROM leads WHERE created_at >= now() - interval '30 days') AS leads_last_30_days,
        (SELECT COUNT(*) FROM leads WHERE is_duplicate = TRUE)               AS duplicate_leads
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
  ingestLeads,
  getStats,
};
