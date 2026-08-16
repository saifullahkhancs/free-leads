const { pool, query, withTransaction } = require("../config/db");
// Use the *streaming* parser (not csv-parse/sync) so we never materialize the
// whole file into an array of objects in memory. That full-array parse was the
// primary cause of "out of memory" crashes on large (1M+ row) uploads.
const { parse } = require("csv-parse");
const ApiError = require("../utils/ApiError");
const GeoMapper = require("../utils/GeoMapper");
const { hasPostGIS } = require("../utils/postgis");
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

/** Normalize an optional company headcount. Invalid/negative values stay empty. */
function normalizeEmployeeCount(value) {
  if (value === undefined || value === null || value === "") return null;
  const count = Number.parseInt(String(value).replace(/,/g, ""), 10);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

/** True when a usable lat/lon pair was supplied (0 is a valid coordinate). */
function hasGeo({ lat, lon }) {
  return (
    lat !== null &&
    lat !== undefined &&
    lon !== null &&
    lon !== undefined &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lon))
  );
}

/**
 * Build the shared `WHERE` clause for the lead queries.
 *
 * Both the row query and the pagination COUNT query go through this single
 * builder. They used to be written out twice by hand, which let them drift
 * apart (and the COUNT copy silently reused `$1/$2` for the geo search without
 * ever binding those values). Placeholders are numbered from the live `values`
 * array, so the caller can push its own parameters before calling this.
 *
 * @param f      the filter set (see getLeads)
 * @param values parameter array that gets appended to in place
 * @param geoPlaceholders reuse already-bound lon/lat placeholders (the row
 *        query binds them for the ST_Distance select); null to bind fresh ones.
 */
function buildLeadWhere(f, values, geoPlaceholders = null) {
  const push = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  let where = " WHERE l.is_active = TRUE";

  if (f.q) {
    where += ` AND l.search_vector @@ plainto_tsquery('english', ${push(f.q)})`;
  }

  if (hasGeo(f)) {
    const lonPh = geoPlaceholders ? geoPlaceholders.lonPh : push(Number(f.lon));
    const latPh = geoPlaceholders ? geoPlaceholders.latPh : push(Number(f.lat));
    const radiusPh = push(Number(f.radius) || 50000);
    where += ` AND l.location IS NOT NULL AND ST_DWithin(l.location, ST_MakePoint(${lonPh}, ${latPh})::geography, ${radiusPh})`;
  }

  // Location hierarchy — ids are exact and index-friendly, so they always win.
  if (f.country_id) where += ` AND l.country_id = ${push(f.country_id)}`;
  if (f.region_id) where += ` AND l.region_id = ${push(f.region_id)}`;
  if (f.city_id) where += ` AND l.city_id = ${push(f.city_id)}`;

  // Name-based fallbacks, used when the UI knows the label but not the id
  // (e.g. a country/city suggested from the signed-in user's profile). Without
  // these the filter would be dropped entirely and the search would look
  // "broken" — it would quietly return unfiltered results.
  if (!f.country_id && f.country_code) {
    where += ` AND upper(c.code) = upper(${push(String(f.country_code).trim())})`;
  }
  if (!f.country_id && !f.country_code && f.country) {
    where += ` AND lower(c.name) = lower(${push(String(f.country).trim())})`;
  }
  if (!f.region_id && f.region) {
    where += ` AND lower(r.name) = lower(${push(String(f.region).trim())})`;
  }
  if (!f.city_id && f.city) {
    where += ` AND lower(ci.name) = lower(${push(String(f.city).trim())})`;
  }

  if (f.category) where += ` AND l.category = ${push(String(f.category).trim())}`;
  if (f.industry) where += ` AND l.industry = ${push(String(f.industry).trim())}`;
  if (f.verified) where += " AND l.is_verified = TRUE";

  return where;
}

/**
 * Get leads with keyset pagination and filters.
 *
 * Supported filters:
 *  - q            full-text query (name / company / headline)
 *  - category     top-level bucket, e.g. "Technology"
 *  - industry     specific industry inside a category
 *  - country_id / region_id / city_id   cascading location hierarchy
 *  - country / country_code / region / city   same, but by name (used by the
 *                                       UI when it only knows the label, e.g.
 *                                       from the user's saved profile location)
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
  country,
  country_code,
  region,
  city,
  industry,
  verified,
  cursor,
  offset = 0,
  lat,
  lon,
  radius = 50000, // 50km default
  limit = 50,
  sort = "recent",
  is_paid = false,
  visibility = null, // per-plan field visibility flags from resolveVisibility()
}) => {
  const filterSet = {
    q,
    category,
    industry,
    country_id,
    region_id,
    city_id,
    country,
    country_code,
    region,
    city,
    verified,
    lat,
    lon,
    radius,
  };
  const geoActive = hasGeo(filterSet);

  const values = [];

  let queryText = `
    SELECT
      l.id,
      l.full_name,
      l.headline,
      l.company_name,
      l.job_title,
      l.num_employees,
      l.industry,
      l.category,
      l.phone,
      l.lat,
      l.lon,
      c.name as country_name,
      c.code as country_code,
      r.name as region_name,
      ci.name as city_name,
      l.is_verified,
      l.created_at
  `;

  // Bind lon/lat once up front so both the distance projection and the
  // ST_DWithin filter below can reference the very same placeholders.
  let geoPlaceholders = null;
  if (geoActive) {
    values.push(Number(lon), Number(lat));
    geoPlaceholders = { lonPh: `$${values.length - 1}`, latPh: `$${values.length}` };
    queryText += `, ST_Distance(l.location, ST_MakePoint(${geoPlaceholders.lonPh}, ${geoPlaceholders.latPh})::geography) as distance `;
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

  const FROM_JOINS = `
    FROM leads l
    LEFT JOIN countries c ON l.country_id = c.id
    LEFT JOIN regions r ON l.region_id = r.id
    LEFT JOIN cities ci ON l.city_id = ci.id
  `;

  queryText += FROM_JOINS + buildLeadWhere(filterSet, values, geoPlaceholders);

  // Keyset pagination — only valid for the stable id ordering. For the other
  // sort modes we fall back to offset-free "first page" semantics (the client
  // asks for a bigger limit instead), which keeps the query correct.
  const keysetSort = !sort || sort === "recent" || sort === "id";
  if (cursor && keysetSort) {
    values.push(cursor);
    queryText += ` AND l.id > $${values.length}`;
  }

  const ORDER_BY = {
    // "recent" is the UI default and must actually order by recency.
    recent: "l.created_at DESC NULLS LAST, l.id DESC",
    name: "l.full_name ASC, l.id ASC",
    company: "l.company_name ASC NULLS LAST, l.id ASC",
    verified: "l.is_verified DESC, l.id ASC",
    newest: "l.created_at DESC NULLS LAST, l.id DESC",
    distance: geoActive ? "distance ASC" : "l.id ASC",
  };
  // Keyset paging walks `l.id > cursor`, so it only works with the id ordering.
  const orderBy = cursor && keysetSort ? "l.id ASC" : ORDER_BY[sort] || "l.id ASC";
  values.push(limit);
  queryText += ` ORDER BY ${orderBy} LIMIT $${values.length}`;

  // Add offset for offset-based pagination
  if (offset > 0) {
    values.push(offset);
    queryText += ` OFFSET $${values.length}`;
  }

  const { rows } = await pool.query(queryText, values);

  // Total count for pagination. Built from the *same* WHERE builder as the row
  // query above so the two can never disagree.
  //
  // NOTE: this block previously declared `const countQuery` and then appended
  // to it with `+=`, which threw "Assignment to constant variable" on every
  // request that reached it — i.e. every unpaginated search. The route 500'd,
  // the UI fell back to its bundled demo dataset, and so *every* filter
  // (country, industry, category, …) appeared to do nothing.
  let total = null;
  if (offset > 0 || cursor === null || cursor === undefined) {
    const countValues = [];
    const countQuery =
      `SELECT COUNT(*)::int AS total ${FROM_JOINS} ` +
      buildLeadWhere(filterSet, countValues);

    const { rows: countRows } = await pool.query(countQuery, countValues);
    total = countRows[0]?.total ?? 0;
  }

  const nextCursor =
    keysetSort && rows.length === limit ? rows[rows.length - 1].id : null;

  return {
    leads: rows,
    nextCursor,
    total,
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
const getFacets = async ({
  q,
  category,
  industry,
  country_id,
  region_id,
  city_id,
  country,
  country_code,
  region,
  city,
  verified,
} = {}) => {
  // Shared WHERE builder — `skip` lets a facet exclude its own dimension so the
  // list of options doesn't collapse to the single selected value.
  const buildWhere = (skip = []) => {
    const values = [];
    const push = (value) => {
      values.push(value);
      return `$${values.length}`;
    };
    let where = " WHERE l.is_active = TRUE";

    if (q) {
      where += ` AND l.search_vector @@ plainto_tsquery('english', ${push(q)})`;
    }
    if (category && !skip.includes("category")) {
      where += ` AND l.category = ${push(String(category).trim())}`;
    }
    if (industry && !skip.includes("industry")) {
      where += ` AND l.industry = ${push(String(industry).trim())}`;
    }
    if (!skip.includes("country")) {
      // Accept the country by id, ISO code or name — the directory sometimes
      // only knows the label (profile-derived filters), and dropping it here
      // made the state/city lists ignore the selected country entirely.
      if (country_id) {
        where += ` AND l.country_id = ${push(country_id)}`;
      } else if (country_code) {
        where += ` AND upper(c.code) = upper(${push(String(country_code).trim())})`;
      } else if (country) {
        where += ` AND lower(c.name) = lower(${push(String(country).trim())})`;
      }
    }
    if (!skip.includes("region")) {
      if (region_id) {
        where += ` AND l.region_id = ${push(region_id)}`;
      } else if (region) {
        where += ` AND lower(r.name) = lower(${push(String(region).trim())})`;
      }
    }
    if (!skip.includes("city")) {
      if (city_id) {
        where += ` AND l.city_id = ${push(city_id)}`;
      } else if (city) {
        where += ` AND lower(ci.name) = lower(${push(String(city).trim())})`;
      }
    }
    if (verified && !skip.includes("verified")) {
      where += " AND l.is_verified = TRUE";
    }
    return { where, values };
  };

  // The location tables are always joined so the WHERE clause can filter on
  // `c.code` / `r.name` / `ci.name` regardless of which facet is being built.
  // `requiredJoin` upgrades the relevant LEFT JOIN to an INNER JOIN so a facet
  // never emits a NULL bucket for rows without that location level.
  const FACET_JOINS = (requiredJoin = null) => `
    ${requiredJoin === "country" ? "JOIN" : "LEFT JOIN"} countries c ON l.country_id = c.id
    ${requiredJoin === "region" ? "JOIN" : "LEFT JOIN"} regions r ON l.region_id = r.id
    ${requiredJoin === "city" ? "JOIN" : "LEFT JOIN"} cities ci ON l.city_id = ci.id
  `;

  const facetQuery = async (selectExpr, requiredJoin, groupExpr, skip, having = "") => {
    const { where, values } = buildWhere(skip);
    const { rows } = await pool.query(
      `SELECT ${selectExpr}, COUNT(*)::int AS count
       FROM leads l ${FACET_JOINS(requiredJoin)} ${where} ${having}
       GROUP BY ${groupExpr}
       ORDER BY COUNT(*) DESC, value ASC
       LIMIT 300`,
      values
    );
    return rows;
  };

  const [categories, industries, countries, regions, cities, totals] = await Promise.all([
    // Categories: independent of the selected category/industry.
    facetQuery("l.category AS value", null, "l.category", ["category", "industry"],
      "AND l.category IS NOT NULL AND l.category <> ''"),

    // Industries: scoped to the chosen category, but not to itself.
    facetQuery("l.industry AS value", null, "l.industry", ["industry"],
      "AND l.industry IS NOT NULL AND l.industry <> ''"),

    // Countries: scoped to category/industry, not to the chosen country
    // (or the region/city *inside* that country, which would collapse the list).
    facetQuery(
      "c.id AS id, c.name AS value, c.code AS code",
      "country",
      "c.id, c.name, c.code",
      ["country", "region", "city"]
    ),

    // States/regions: always available so the State filter can be used on its
    // own. Scoped to the chosen country (and any other filters), but never to
    // the selected region/city, so the list doesn't collapse to one entry.
    facetQuery(
      "r.id AS id, r.name AS value",
      "region",
      "r.id, r.name",
      ["region", "city"]
    ),

    // Cities: always available so the City filter can be used on its own.
    // Scoped to the chosen country + region, but not to the selected city.
    facetQuery(
      "ci.id AS id, ci.name AS value",
      "city",
      "ci.id, ci.name",
      ["city"]
    ),

    (async () => {
      const { where, values } = buildWhere();
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE l.is_verified)::int AS verified
         FROM leads l ${FACET_JOINS()} ${where}`,
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
const resolveLocation = async (geoMapper, { country, country_code, region, city, lat: recordLat, lon: recordLon }) => {
  const countryId = country ? await geoMapper.getCountryId(country, country_code) : null;
  const regionId = countryId && region ? await geoMapper.getRegionId(countryId, region) : null;
  const cityId = countryId && city ? await geoMapper.getCityId(countryId, regionId, city) : null;

  // Use coordinates from record if provided, otherwise null
  let lat = recordLat ? parseFloat(recordLat) : null;
  let lon = recordLon ? parseFloat(recordLon) : null;

  return { cityId, regionId, countryId, lat, lon };
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
  const { cityId, regionId, countryId, lat, lon } = await resolveLocation(geoMapper, {
    country: data.country,
    country_code: data.country_code,
    region: data.region,
    city: data.city,
    lat: data.lat,
    lon: data.lon
  });
  const fp = dedupService.fingerprint(data);

  const { rows } = await pool.query(
    `INSERT INTO leads (
       full_name, headline, about, email, phone, linkedin_url, twitter_url,
       facebook_url, website_url, city_id, region_id, country_id,
       industry, category, company_name, job_title, num_employees, source, is_verified,
       email_hash, phone_hash, website_hash, biz_hash, lat, lon
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, FALSE,
             $19,$20,$21,$22,$23,$24)
     RETURNING id, full_name, email, phone, company_name, num_employees, industry, category, created_at`,
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
      normalizeEmployeeCount(data.num_employees),
      data.source || "manual",
      fp.email_hash,
      fp.phone_hash,
      fp.website_hash,
      fp.biz_hash,
      lat,
      lon,
    ]
  );

  await dedupService.recordHashes(rows[0].id, fp);
  return rows[0];
};

/**
 * Insert lead rows in a single UNNEST-based batch (no per-row INSERT loops).
 * rows: [{ record, cityId, regionId, countryId, lat, lon, fp }]
 * Returns the array of inserted lead ids.
 */
const insertLeadBatch = async (client, rows, fingerprints = []) => {
  if (rows.length === 0) return [];
  const cols = Array.from({ length: 24 }, () => []);

  rows.forEach(({ record, cityId, regionId, countryId, lat, lon, fp: rowFp }, rowIndex) => {
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
      normalizeEmployeeCount(record.num_employees),
      record.source || "csv_upload",
      fp.email_hash,
      fp.phone_hash,
      fp.website_hash,
      fp.biz_hash,
      lat,
      lon,
    ];
    v.forEach((val, i) => cols[i].push(val));
  });

  const { rows: inserted } = await client.query(
    `INSERT INTO leads (
       full_name, headline, about, email, phone, linkedin_url, twitter_url,
       facebook_url, website_url, city_id, region_id, country_id,
       industry, category, company_name, job_title, num_employees, source,
       email_hash, phone_hash, website_hash, biz_hash, lat, lon
     )
     SELECT * FROM UNNEST(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
       $7::text[], $8::text[], $9::text[], $10::int[], $11::int[], $12::int[],
       $13::text[], $14::text[], $15::text[], $16::text[], $17::int[], $18::text[],
       $19::text[], $20::text[], $21::text[], $22::text[], $23::float[], $24::float[]
     )
     RETURNING id`,
    cols
  );

  // Update the geospatial `location` column for records that have coordinates.
  // On PostGIS it is a GEOGRAPHY(POINT, 4326); on plain PostgreSQL it is a
  // TEXT fallback ("lon lat"), where ST_MakePoint/ST_SetSRID do not exist.
  const coordinates = rows.map((row, index) => ({
    id: inserted[index].id,
    lat: row.lat,
    lon: row.lon
  })).filter(coord => coord.lat != null && coord.lon != null);

  if (coordinates.length > 0) {
    const postgis = await hasPostGIS();
    for (const coord of coordinates) {
      if (postgis) {
        await client.query(
          `UPDATE leads SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
          [coord.lon, coord.lat, coord.id]
        );
      } else {
        await client.query(
          `UPDATE leads SET location = $1 WHERE id = $2`,
          [`${coord.lon} ${coord.lat}`, coord.id]
        );
      }
    }
  }

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
 *
 * Records are consumed from a caller-provided (async) iterable and only one
 * batch is held in memory at a time, so memory use stays bounded no matter how
 * large the source file is.
 *
 * options:
 *   - limit:  maximum number of DATA rows to import (counted after `offset`).
 *             0 / Infinity means "import everything".
 *   - offset: number of DATA rows to skip from the start of the source
 *             (lets you re-import a range, e.g. rows 100001–200000).
 *   - onProgress: optional callback(rowsAttempted) fired per imported row.
 *
 * Returns { imported, skipped, failed, total, errors } where `total` is the
 * number of data rows in the whole source (not just the imported window).
 */
const bulkInsertFromIterable = async (
  getIterator,
  source = "csv_upload",
  { limit = Infinity, offset = 0, fieldMapping = null, onProgress } = {}
) => {
  // A non-positive limit means "no limit" (import everything).
  if (!(limit > 0)) limit = Infinity;
  if (!(offset > 0)) offset = 0;
  const validatedMapping = fieldMapping ? validateFieldMapping(fieldMapping) : null;

  const geoMapper = new GeoMapper();
  await geoMapper.init();

  const BATCH_SIZE = 1000;
  const errors = [];
  const seen = new Set(); // fingerprints seen earlier in THIS call
  let batch = [];
  let imported = 0;
  let skipped = 0;
  let dataRows = 0;   // every data row seen in the source (drives `total`)
  let attempted = 0;  // rows we actually tried to import (after offset, before limit)
  let offsetLeft = offset;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for await (const record of getIterator()) {
      dataRows += 1;
      const displayRow = dataRows + 1; // +1 because row 1 is the header

      // Skip the first `offset` data rows (they do NOT count against `limit`).
      if (offsetLeft > 0) {
        offsetLeft -= 1;
        continue;
      }

      // Once the requested `limit` has been reached, stop importing but keep
      // counting so the response's `total` still reflects the whole file.
      if (attempted >= limit) continue;
      attempted += 1;
      if (onProgress) onProgress(attempted);

      // Re-map arbitrary CSV columns to the standard lead fields when a
      // field mapping was provided.
      const mapped = validatedMapping ? mapRecord(record, validatedMapping) : record;

      if (!mapped.full_name || !String(mapped.full_name).trim()) {
        errors.push({ row: displayRow, error: "missing full_name" });
        continue;
      }
      try {
        const { cityId, regionId, countryId, lat, lon } = await resolveLocation(geoMapper, {
          country: mapped.country,
          country_code: mapped.country_code,
          region: mapped.region,
          city: mapped.city,
          lat: mapped.lat,
          lon: mapped.lon
        });
        batch.push({ record: { ...mapped, source }, cityId, regionId, countryId, lat, lon });
        if (batch.length >= BATCH_SIZE) {
          await flushBatch(client);
        }
      } catch (err) {
        errors.push({ row: displayRow, error: err.message });
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
    // Pair survivors back with their geo ids and coordinates.
    const survivorSet = new Set(survivors);
    const survivorRows = batch.filter((b) => survivorSet.has(b.record));
    const survivorFp = fingerprints;
    const ids = await insertLeadBatch(client, survivorRows, survivorFp);
    await recordHashesBatch(client, ids, survivorFp);
    imported += ids.length;
    batch = [];
  }

  return { imported, skipped, failed: errors.length, total: dataRows, errors };
};

/**
 * Insert records from an in-memory array (used by the external ingest API).
 */
const bulkInsertRecords = async (records, source = "csv_upload", options = {}) => {
  return bulkInsertFromIterable(
    function* () {
      yield* records;
    },
    source,
    options
  );
};

/**
 * Import leads from raw CSV text (editor/admin/super_admin).
 * The CSV is parsed as a stream (row-by-row) rather than `csv-parse/sync`,
 * which used to build an array of every row in memory — the cause of
 * "out of memory" on large uploads. `limit`/`offset` let you read only a
 * window of rows from the file (e.g. the first 50 000 rows, or rows
 * 100001–200000). `fieldMapping` (optional) re-maps arbitrary CSV columns
 * to the standard lead fields before import.
 */
const importLeadsCsv = async (csvText, source = "csv_upload", options = {}) => {
  if (!csvText || typeof csvText !== "string" || !csvText.trim()) {
    throw new ApiError(400, "CSV content is required (send { csv: '<text>' })");
  }

  const parser = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  async function* records() {
    try {
      for await (const record of parser) {
        yield record;
      }
    } catch (err) {
      throw new ApiError(400, `Could not parse CSV: ${err.message}`);
    }
  }

  return bulkInsertFromIterable(records, source, options);
};

/**
 * Import leads from a Readable stream (multipart file upload). The file is
 * streamed straight into the CSV parser — it is never buffered in memory.
 */
const importLeadsFromStream = async (input, source = "csv_upload", options = {}) => {
  const parser = input.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })
  );

  async function* records() {
    try {
      for await (const record of parser) {
        yield record;
      }
    } catch (err) {
      throw new ApiError(400, `Could not parse CSV: ${err.message}`);
    }
  }

  return bulkInsertFromIterable(records, source, options);
};

/** Standard destination fields accepted by the lead importer. */
const IMPORTABLE_FIELDS = new Set([
  "full_name", "headline", "about", "email", "phone", "linkedin_url",
  "twitter_url", "facebook_url", "website_url", "company_name", "job_title",
  "num_employees", "industry", "country", "country_code", "region", "city", "lat", "lon",
]);

/** Validate and normalize mapping once before the streaming row loop. */
function validateFieldMapping(mapping) {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new ApiError(400, "Field mapping must be an object");
  }

  const validated = {};
  for (const [dbField, config] of Object.entries(mapping)) {
    if (!IMPORTABLE_FIELDS.has(dbField) || !config || typeof config !== "object") continue;
    if (config.type === "single" && typeof config.csvField === "string" && config.csvField) {
      validated[dbField] = { type: "single", csvField: config.csvField };
    } else if (config.type === "combined" && Array.isArray(config.csvFields)) {
      const csvFields = config.csvFields.filter((field) => typeof field === "string" && field).slice(0, 50);
      if (csvFields.length) {
        validated[dbField] = {
          type: "combined",
          csvFields,
          separator: config.separator === "comma" ? "comma" : "space",
        };
      }
    }
  }

  if (!validated.full_name) {
    throw new ApiError(400, "The required full_name field must be mapped");
  }
  return validated;
}

/** Map one arbitrary CSV record to explicitly selected database fields. */
function mapRecord(record, mapping) {
  const mapped = {};
  for (const [dbField, config] of Object.entries(mapping)) {
    if (config.type === "single") {
      mapped[dbField] = record[config.csvField];
      continue;
    }
    const separator = config.separator === "comma" ? ", " : " ";
    mapped[dbField] = config.csvFields
      .map((field) => record[field])
      .filter((value) => value != null && String(value).trim() !== "")
      .map((value) => String(value).trim())
      .join(separator);
  }
  return mapped;
}

/** Apply mapping to an in-memory array (used by legacy callers). */
function applyFieldMapping(records, mapping) {
  const validated = validateFieldMapping(mapping);
  return records.map((record) => mapRecord(record, validated));
}

/**
 * Parse CSV and return column headers and sample data
 * Supports row range (startRow, endRow) for memory-efficient processing of large files
 */
const parseCsvHeaders = async (csvText, startRow = 0, endRow = null) => {
  if (!csvText || typeof csvText !== "string" || !csvText.trim()) {
    throw new ApiError(400, "CSV content is required");
  }

  const parser = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    skip_records_with_error: true,
  });
  
  const sampleData = [];
  let headers = [];
  let totalRows = 0;
  let currentRow = 0;
  const slicedRecords = [];
  const maxPreviewRows = 5;

  try {
    for await (const record of parser) {
      if (!headers.length) headers = Object.keys(record);
      
      // Always collect first few rows for preview
      if (sampleData.length < maxPreviewRows) {
        sampleData.push(record);
      }
      
      // Collect rows in the specified range
      if (startRow <= currentRow && (endRow === null || currentRow < endRow)) {
        slicedRecords.push(record);
      }
      
      // Stop counting after a reasonable limit for very large files
      // to avoid memory issues during preview
      if (totalRows < 1000000) {
        totalRows += 1;
      } else if (totalRows === 1000000) {
        totalRows = 1000000; // Cap at 1M+ for display
      }
      
      currentRow += 1;
      
      // Stop early if we've collected enough rows and don't need the total count
      if (endRow !== null && currentRow >= endRow && totalRows >= 1000000) {
        break;
      }
    }
  } catch (err) {
    throw new ApiError(400, `Could not parse CSV: ${err.message}`);
  }

  if (!totalRows) throw new ApiError(400, "CSV file is empty or no data rows");
  
  const result = { headers, sampleData, totalRows };
  
  // Include sliced records if a range was specified
  if (startRow > 0 || endRow !== null) {
    result.slicedRecords = slicedRecords;
    result.actualRows = slicedRecords.length;
  }
  
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

const getLeadForManagement = async (id) => {
  const { rows } = await pool.query(
    `SELECT l.*, c.name AS country, c.code AS country_code,
            r.name AS region, ci.name AS city
     FROM leads l
     LEFT JOIN countries c ON c.id = l.country_id
     LEFT JOIN regions r ON r.id = l.region_id
     LEFT JOIN cities ci ON ci.id = l.city_id
     WHERE l.id = $1`,
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Lead not found");
  return rows[0];
};

/** Update a lead and remap its location hierarchy and dedup fingerprints. */
const updateLead = async (id, data) => {
  const current = await getLeadForManagement(id);
  const merged = { ...current, ...data };
  if (!String(merged.full_name || "").trim()) {
    throw new ApiError(400, "full_name is required");
  }

  const lat = merged.lat === "" || merged.lat == null ? null : Number(merged.lat);
  const lon = merged.lon === "" || merged.lon == null ? null : Number(merged.lon);
  if ((lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
      (lon != null && (!Number.isFinite(lon) || lon < -180 || lon > 180))) {
    throw new ApiError(400, "Coordinates are invalid (latitude -90..90, longitude -180..180)");
  }

  const geoMapper = new GeoMapper();
  await geoMapper.init();
  const location = await resolveLocation(geoMapper, {
    country: merged.country,
    country_code: merged.country_code,
    region: merged.region,
    city: merged.city,
    lat,
    lon,
  });
  const employeeCount = normalizeEmployeeCount(merged.num_employees);
  const fp = dedupService.fingerprint(merged);

  await withTransaction(async (client) => {
    const postgis = await hasPostGIS();
    const locationSql = location.lat != null && location.lon != null
      ? (postgis ? "ST_SetSRID(ST_MakePoint($27, $26), 4326)::geography" : "$27::text || ' ' || $26::text")
      : "NULL";
    await client.query(
      `UPDATE leads SET
        full_name=$2, headline=$3, about=$4, email=$5, phone=$6,
        linkedin_url=$7, twitter_url=$8, facebook_url=$9, website_url=$10,
        city_id=$11, region_id=$12, country_id=$13, industry=$14, category=$15,
        company_name=$16, job_title=$17, num_employees=$18, source=$19, is_verified=$20,
        is_active=$21, email_hash=$22, phone_hash=$23, website_hash=$24,
        biz_hash=$25, lat=$26, lon=$27, location=${locationSql}, updated_at=now()
       WHERE id=$1`,
      [id, String(merged.full_name).trim(), merged.headline || null, merged.about || null,
       merged.email || null, merged.phone || null, merged.linkedin_url || null,
       merged.twitter_url || null, merged.facebook_url || null, merged.website_url || null,
       location.cityId, location.regionId, location.countryId, merged.industry || null,
       merged.category || deriveCategory(merged.industry), merged.company_name || null,
       merged.job_title || null, employeeCount, merged.source || "manual", Boolean(merged.is_verified),
       merged.is_active !== false, fp.email_hash, fp.phone_hash, fp.website_hash,
       fp.biz_hash, location.lat, location.lon]
    );
    await client.query("DELETE FROM lead_hashes WHERE lead_id = $1", [id]);
  });
  await dedupService.recordHashes(id, fp);
  return getLeadForManagement(id);
};

module.exports = {
  getLeads,
  getFacets,
  getLeadById,
  getLeadForManagement,
  updateLead,
  exportLeads,
  createLead,
  importLeadsCsv,
  importLeadsFromStream,
  ingestLeads,
  parseCsvHeaders,
  getLandingStats,
  getStats,
  deriveCategory,
};
