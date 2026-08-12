const { pool, query, withTransaction } = require("../config/db");
const { parse } = require("csv-parse/sync");
const ApiError = require("../utils/ApiError");
const GeoMapper = require("../utils/GeoMapper");
const dedupService = require("./dedupService");
const quotaService = require("./quotaService");
const auditService = require("./auditService");

/**
 * Map a free-text industry onto one of the broad directory categories, so an
 * import that only supplies `industry` still lands in the right category
 * filter. Mirrors the backfill rules in migration 006.
 */
const CATEGORY_RULES = [
  // Order matters: the first matching rule wins, so the more specific
  // hospitality/education buckets are tested before the broad ones.
  ["Hospitality & Food", /travel|hospitalit|hotel|restaurant|\bfood\b|beverage|tourism|catering/i],
  ["Healthcare", /health|biotech|medical|pharma|clinic|hospital\b|hospitals|wellness|dental|care\b/i],
  ["Technology", /software|saas|cloud|devtool|information tech|\btech\b|artificial intelligence|machine learning|\bai\b|\bdata\b|cyber|telecom|semiconductor/i],
  ["Finance", /fintech|bank|financ|capital|equity|insur|invest|accounting|venture/i],
  ["Marketing & Media", /market|\bmedia\b|advertis|publish|broadcast|public relations|\bpr\b/i],
  ["Design & Creative", /design|creative|\bagency\b|\barts\b|photograph|architect|entertainment|music|film/i],
  ["Retail & E-commerce", /retail|commerce|consumer|\bshop|\bstore|fashion|apparel|grocer/i],
  ["Real Estate & Construction", /real estate|property|construct|realty|building/i],
  ["Education", /education|edtech|school|universit|training|academ|\bcollege\b/i],
  ["Industrial & Logistics", /manufact|industrial|logistic|transport|energy|mining|automotive|agricultur|shipping|aerospace/i],
  ["Legal & Government", /legal|\blaw\b|attorney|government|public sector|nonprofit|\bngo\b|defense/i],
];

function deriveCategory(industry) {
  const value = String(industry || "").trim();
  if (!value) return null;
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(value)) return category;
  }
  return "Professional Services";
}

/**
 * Get leads with keyset pagination and filters.
 *
 * Supported filters:
 *  - q            full-text query (name / company / headline)
 *  - category     top-level bucket, e.g. "Technology"
 *  - industry     specific industry inside a category
 *  - country_id / region_id / city_id   cascading location hierarchy
 *  - country_code / region / city       same, but by name (used by the UI when
 *                                       it only knows the label, e.g. from the
 *                                       user's saved profile location)
 *  - verified     true  -> verified leads only
 *  - lat/lon/radius  "Near Me" geo radius search (needs PostGIS)
 *  - sort         "recent" | "name" | "company" | "verified" | "distance"
 */
const getLeads = async ({
  q,
  category,
  country_id,
  region_id,
  city_id,
  country_code,
  region,
  city,
  industry,
  verified,
  cursor,
  lat,
  lon,
  radius = 50000, // 50km default
  limit = 50,
  sort = "recent",
  is_paid = false,
  visibility = null, // per-plan field visibility flags from resolveVisibility()
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
      l.category,
      l.phone,
      c.name as country_name,
      c.code as country_code,
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

  const showEmail = visibility ? Boolean(visibility.show_email) : is_paid;
  const showPhone = visibility ? Boolean(visibility.show_phone) : is_paid;
  const showLinkedin = visibility ? Boolean(visibility.show_linkedin) : is_paid;
  const showTwitter = visibility ? Boolean(visibility.show_twitter) : is_paid;
  const showWebsite = visibility ? Boolean(visibility.show_website) : is_paid;
  const showAbout = visibility ? Boolean(visibility.show_about) : is_paid;

  const emailCol = showEmail
    ? "l.email"
    : "CASE WHEN l.email IS NULL THEN NULL ELSE overlay(l.email placing '****' from 2 for position('@' in l.email) - 2) END";
  const phoneCol = showPhone ? "l.phone" : "NULL";
  const linkedinCol = showLinkedin ? "l.linkedin_url" : "NULL";
  const twitterCol = showTwitter ? "l.twitter_url" : "NULL";
  const facebookCol = showTwitter ? "l.facebook_url" : "NULL";
  const websiteCol = showWebsite ? "l.website_url" : "NULL";
  const aboutCol = showAbout ? "l.about" : "NULL";

  queryText += `,
    ${emailCol} as email,
    ${phoneCol} as phone,
    ${linkedinCol} as linkedin_url,
    ${twitterCol} as twitter_url,
    ${facebookCol} as facebook_url,
    ${websiteCol} as website_url,
    ${aboutCol} as about
  `;

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

  // Name-based location filters (used when the UI knows the label but not the id,
  // e.g. the country suggestion derived from the signed-in user's profile).
  if (!country_id && country_code) {
    queryText += ` AND upper(c.code) = upper($${paramIndex})`;
    values.push(String(country_code).trim());
    paramIndex++;
  }

  if (!region_id && region) {
    queryText += ` AND lower(r.name) = lower($${paramIndex})`;
    values.push(String(region).trim());
    paramIndex++;
  }

  if (!city_id && city) {
    queryText += ` AND lower(ci.name) = lower($${paramIndex})`;
    values.push(String(city).trim());
    paramIndex++;
  }

  if (category) {
    queryText += ` AND l.category = $${paramIndex}`;
    values.push(category);
    paramIndex++;
  }

  if (industry) {
    queryText += ` AND l.industry = $${paramIndex}`;
    values.push(industry);
    paramIndex++;
  }

  if (verified) {
    queryText += ` AND l.is_verified = TRUE`;
  }

  // Keyset pagination — only valid for the stable id ordering. For the other
  // sort modes we fall back to offset-free "first page" semantics (the client
  // asks for a bigger limit instead), which keeps the query correct.
  const keysetSort = !sort || sort === "recent" || sort === "id";
  if (cursor && keysetSort) {
    queryText += ` AND l.id > $${paramIndex}`;
    values.push(cursor);
    paramIndex++;
  }

  const ORDER_BY = {
    name: "l.full_name ASC, l.id ASC",
    company: "l.company_name ASC NULLS LAST, l.id ASC",
    verified: "l.is_verified DESC, l.id ASC",
    newest: "l.created_at DESC NULLS LAST, l.id DESC",
    distance: lat && lon ? "distance ASC" : "l.id ASC",
  };
  queryText += ` ORDER BY ${ORDER_BY[sort] || "l.id ASC"} LIMIT $${paramIndex}`;
  values.push(limit);

  const { rows } = await pool.query(queryText, values);

  const nextCursor =
    keysetSort && rows.length === limit ? rows[rows.length - 1].id : null;

  return {
    leads: rows,
    nextCursor,
  };
};

/**
 * Faceted filter options for the search page.
 *
 * Everything is scoped to the *currently applied* filters so the dropdowns
 * cascade: picking a category narrows the industries, picking a country narrows
 * the states, picking a state narrows the cities. Each option carries its own
 * result count so the UI can show "Technology (1,204)".
 */
const getFacets = async ({ q, category, industry, country_id, region_id, verified } = {}) => {
  // Shared WHERE builder — `skip` lets a facet exclude its own dimension so the
  // list of options doesn't collapse to the single selected value.
  const buildWhere = (skip = []) => {
    const values = [];
    let idx = 1;
    let where = " WHERE l.is_active = TRUE";

    if (q) {
      where += ` AND l.search_vector @@ plainto_tsquery('english', $${idx++})`;
      values.push(q);
    }
    if (category && !skip.includes("category")) {
      where += ` AND l.category = $${idx++}`;
      values.push(category);
    }
    if (industry && !skip.includes("industry")) {
      where += ` AND l.industry = $${idx++}`;
      values.push(industry);
    }
    if (country_id && !skip.includes("country")) {
      where += ` AND l.country_id = $${idx++}`;
      values.push(country_id);
    }
    if (region_id && !skip.includes("region")) {
      where += ` AND l.region_id = $${idx++}`;
      values.push(region_id);
    }
    if (verified && !skip.includes("verified")) {
      where += " AND l.is_verified = TRUE";
    }
    return { where, values };
  };

  const facetQuery = async (selectExpr, joins, groupExpr, skip, having = "") => {
    const { where, values } = buildWhere(skip);
    const { rows } = await pool.query(
      `SELECT ${selectExpr}, COUNT(*)::int AS count
       FROM leads l ${joins} ${where} ${having}
       GROUP BY ${groupExpr}
       ORDER BY COUNT(*) DESC, value ASC
       LIMIT 300`,
      values
    );
    return rows;
  };

  const [categories, industries, countries, regions, cities, totals] = await Promise.all([
    // Categories: independent of the selected category/industry.
    facetQuery("l.category AS value", "", "l.category", ["category", "industry"],
      "AND l.category IS NOT NULL AND l.category <> ''"),

    // Industries: scoped to the chosen category, but not to itself.
    facetQuery("l.industry AS value", "", "l.industry", ["industry"],
      "AND l.industry IS NOT NULL AND l.industry <> ''"),

    // Countries: scoped to category/industry, not to the chosen country.
    facetQuery(
      "c.id AS id, c.name AS value, c.code AS code",
      "JOIN countries c ON l.country_id = c.id",
      "c.id, c.name, c.code",
      ["country", "region"]
    ),

    // States/regions: only meaningful once a country is chosen.
    country_id
      ? facetQuery(
          "r.id AS id, r.name AS value",
          "JOIN regions r ON l.region_id = r.id",
          "r.id, r.name",
          ["region"]
        )
      : Promise.resolve([]),

    // Cities: only meaningful once a country (and usually a state) is chosen.
    country_id
      ? facetQuery(
          "ci.id AS id, ci.name AS value",
          "JOIN cities ci ON l.city_id = ci.id",
          "ci.id, ci.name",
          []
        )
      : Promise.resolve([]),

    (async () => {
      const { where, values } = buildWhere();
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE l.is_verified)::int AS verified
         FROM leads l ${where}`,
        values
      );
      return rows[0] || { total: 0, verified: 0 };
    })(),
  ]);

  return {
    categories: categories.filter((r) => r.value),
    industries: industries.filter((r) => r.value),
    countries,
    regions,
    cities,
    totals,
  };
};

/**
 * Get a single lead by ID
 */
const getLeadById = async (id, is_paid = false, visibility = null) => {
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

  const showEmail = visibility ? Boolean(visibility.show_email) : is_paid;
  const showPhone = visibility ? Boolean(visibility.show_phone) : is_paid;
  const showLinkedin = visibility ? Boolean(visibility.show_linkedin) : is_paid;
  const showTwitter = visibility ? Boolean(visibility.show_twitter) : is_paid;
  const showWebsite = visibility ? Boolean(visibility.show_website) : is_paid;
  const showAbout = visibility ? Boolean(visibility.show_about) : is_paid;

  if (!showEmail) {
    lead.email = lead.email ? lead.email.replace(/(.).+(@.+)/, "$1****$2") : null;
  }
  if (!showPhone) lead.phone = null;
  if (!showLinkedin) lead.linkedin_url = null;
  if (!showTwitter) {
    lead.twitter_url = null;
    lead.facebook_url = null;
  }
  if (!showWebsite) lead.website_url = null;
  if (!showAbout) lead.about = null;

  return lead;
};

/**
 * Server-side, gated export.
 * Enforces: login (auth middleware) + format whitelist + plan row cap +
 * daily export quota + audit log.
 * Supports formats: csv, json (plans only advertise formats we can produce).
 */
const exportLeads = async ({ userId, isAdmin, filters = {}, format = "csv", ip, visibility = null }) => {
  const plan = await quotaService.getActivePlan(userId);
  const allowedFormats = (plan.allowed_formats || ["csv"]).map((f) => String(f).toLowerCase());
  let fmt = String(format || "").toLowerCase();

  if (fmt === "csv" && allowedFormats.includes("excel") && !allowedFormats.includes("csv")) {
    fmt = "excel";
  }

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

  const { leads } = await getLeads({ ...filters, limit: rowLimit, is_paid: true, visibility });

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

  if (format === "pdf") {
    if (leads.length === 0) {
      return { content: "FreeLeads Export Report\n\nNo records found.", contentType: "text/plain; charset=utf-8", ext: "txt" };
    }
    const report = [`FreeLeads Export Report (${leads.length} records)\nGenerated: ${new Date().toISOString().slice(0, 10)}\n`];
    leads.forEach((l, i) => {
      report.push(`${i + 1}. ${l.full_name || "Lead"} | ${l.job_title || ""} | ${l.company_name || ""} | ${l.email || ""}`);
    });
    return { content: report.join("\n"), contentType: "text/plain; charset=utf-8", ext: "txt" };
  }

  if (format === "excel") {
    if (leads.length === 0) {
      return { content: "\uFEFF", contentType: "text/csv; charset=utf-8", ext: "csv" };
    }
    const headers = Object.keys(leads[0]).join(",");
    const rows = leads.map((lead) =>
      Object.values(lead)
        .map((val) => `"${(val || "").toString().replace(/"/g, '""')}"`)
        .join(",")
    );
    return { content: "\uFEFF" + [headers, ...rows].join("\r\n"), contentType: "text/csv; charset=utf-8", ext: "csv" };
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
       industry, category, company_name, job_title, source, is_verified,
       email_hash, phone_hash, website_hash, biz_hash
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, FALSE,
             $18,$19,$20,$21)
     RETURNING id, full_name, email, phone, company_name, industry, category, created_at`,
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
      data.category || deriveCategory(data.industry),
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
const insertLeadBatch = async (client, rows, fingerprints = []) => {
  if (rows.length === 0) return [];
  const cols = Array.from({ length: 21 }, () => []);

  rows.forEach(({ record, cityId, regionId, countryId, fp: rowFp }, rowIndex) => {
    // Fingerprints are computed by the dedup pass and handed in positionally;
    // fall back to a per-row fp (single-record callers) or recompute.
    const fp = rowFp || fingerprints[rowIndex] || dedupService.fingerprint(record);
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
      record.category || deriveCategory(record.industry),
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
       industry, category, company_name, job_title, source,
       email_hash, phone_hash, website_hash, biz_hash
     )
     SELECT * FROM UNNEST(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
       $7::text[], $8::text[], $9::text[], $10::int[], $11::int[], $12::int[],
       $13::text[], $14::text[], $15::text[], $16::text[], $17::text[],
       $18::text[], $19::text[], $20::text[], $21::text[]
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
 * Public, aggregate-only lead coverage for the marketing landing page.
 *
 * This intentionally returns no person or contact fields. Keeping the query in
 * the service also means the "top countries" list always reflects the active
 * database rather than a manually maintained marketing list.
 */
const getLandingStats = async () => {
  const [totalRes, countriesRes] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS total_leads
      FROM leads
      WHERE is_active = TRUE
    `),
    pool.query(`
      SELECT
        c.id,
        c.name,
        c.code,
        COUNT(l.id)::int AS lead_count,
        COUNT(l.id) FILTER (WHERE l.is_verified = TRUE)::int AS verified_count,
        COUNT(DISTINCT l.city_id)::int AS city_count
      FROM leads l
      INNER JOIN countries c ON c.id = l.country_id
      WHERE l.is_active = TRUE
      GROUP BY c.id, c.name, c.code
      ORDER BY lead_count DESC, c.name ASC
      LIMIT 12
    `),
  ]);

  return {
    total_leads: totalRes.rows[0]?.total_leads || 0,
    top_countries: countriesRes.rows,
  };
};

/**
 * Aggregated stats for the dashboard overview.
 */
const getStats = async () => {
  const [countsRes, industriesRes, categoriesRes, recentRes] = await Promise.all([
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
    pool.query(
      `SELECT DISTINCT category FROM leads
       WHERE category IS NOT NULL AND category <> ''
       ORDER BY category ASC LIMIT 100`
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
    categories: categoriesRes.rows.map((r) => r.category).filter(Boolean),
    recentLeads: recentRes.rows,
  };
};

module.exports = {
  getLeads,
  getFacets,
  getLeadById,
  exportLeads,
  createLead,
  importLeadsCsv,
  ingestLeads,
  getLandingStats,
  getStats,
  deriveCategory,
};
