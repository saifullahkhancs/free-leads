const leadService = require("../services/leadService");
const authService = require("../services/authService");
const quotaService = require("../services/quotaService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

function isRolePaid(user) {
  return user && (user.roles || []).some((r) => ["admin", "super_admin"].includes(r));
}

const resolveVisibility = async (user) => {
  if (user && isRolePaid(user)) {
    return {
      show_email: true,
      show_phone: true,
      show_linkedin: true,
      show_twitter: true,
      show_website: true,
      show_about: true,
      can_view_contact: true,
      is_paid: true,
    };
  }
  const userId = user?.id || null;
  const [hasPaid, plan] = await Promise.all([
    userId ? quotaService.hasActivePaidPlan(userId) : Promise.resolve(false),
    quotaService.getActivePlan(userId),
  ]);
  return {
    show_email: plan.show_email !== undefined ? Boolean(plan.show_email) : Boolean(plan.can_view_contact),
    show_phone: plan.show_phone !== undefined ? Boolean(plan.show_phone) : Boolean(plan.can_view_contact),
    show_linkedin: plan.show_linkedin !== undefined ? Boolean(plan.show_linkedin) : Boolean(plan.can_view_contact),
    show_twitter: plan.show_twitter !== undefined ? Boolean(plan.show_twitter) : Boolean(plan.can_view_contact),
    show_website: plan.show_website !== undefined ? Boolean(plan.show_website) : Boolean(plan.can_view_contact),
    show_about: plan.show_about !== undefined ? Boolean(plan.show_about) : Boolean(plan.can_view_contact),
    can_view_contact: Boolean(plan.can_view_contact),
    is_paid: !!hasPaid || Boolean(plan.can_view_contact),
  };
};

/** Query params are strings — normalize "true"/"1"/"" into a real boolean. */
function toBool(value) {
  if (value === undefined || value === null || value === "") return false;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

const getLeads = asyncHandler(async (req, res) => {
  const {
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
    limit,
    sort,
    lat,
    lon,
    radius,
  } = req.query;

  // Paid access = active paid subscription OR an admin/super_admin role.
  // Admins bypass quotas; regular users are checked by the requireQuota middleware.
  const [visibility, quotaStatus] = await Promise.all([
    resolveVisibility(req.user),
    quotaService.getQuotaStatus(req.user.id),
  ]);
  const is_paid = visibility.is_paid;

  const result = await leadService.getLeads({
    q,
    category: category || null,
    country_id: toInt(country_id),
    region_id: toInt(region_id),
    city_id: toInt(city_id),
    country_code: country_code || null,
    region: region || null,
    city: city || null,
    industry: industry || null,
    verified: toBool(verified),
    cursor: toInt(cursor),
    limit: Math.min(Math.max(toInt(limit) || 50, 1), 200),
    sort: sort || "recent",
    lat: lat ? parseFloat(lat) : null,
    lon: lon ? parseFloat(lon) : null,
    radius: radius ? parseFloat(radius) : 50000,
    is_paid,
    visibility,
  });

  res.json({
    status: "success",
    data: { ...result, quota: quotaStatus },
  });
});

/**
 * GET /api/leads/facets — filter options (category, industry, country, state,
 * city) with per-option result counts, scoped to whatever filters are already
 * applied so the dropdowns cascade. Cheap + not quota-gated: it only returns
 * aggregate counts, never lead contact data.
 */
const getFacets = asyncHandler(async (req, res) => {
  const facets = await leadService.getFacets({
    q: req.query.q || null,
    category: req.query.category || null,
    industry: req.query.industry || null,
    country_id: toInt(req.query.country_id),
    region_id: toInt(req.query.region_id),
    verified: toBool(req.query.verified),
  });

  // Suggest the signed-in user's own country/state/city (set on their profile)
  // so the UI can offer a one-click "leads in <your country>" filter, plus the
  // category/industry they picked as their interests so the directory can
  // pre-seed those two default filters as well.
  const [profile, interests] = req.user
    ? await Promise.all([
        authService.getProfileLocation(req.user.id),
        authService.getProfileInterests(req.user.id),
      ])
    : [null, null];
  const suggestion = {
    country: profile?.country || null,
    region: profile?.region || null,
    city: profile?.city || null,
  };
  const matchedCountry = suggestion.country
    ? facets.countries.find(
        (c) => String(c.value).toLowerCase() === String(suggestion.country).toLowerCase()
      )
    : null;

  const matchCount = (list, value) =>
    value
      ? list.find((x) => String(x.value).toLowerCase() === String(value).toLowerCase())?.count ?? null
      : null;

  res.json({
    status: "success",
    data: {
      ...facets,
      suggestion: {
        ...suggestion,
        country_id: matchedCountry?.id || null,
        count: matchedCountry?.count || 0,
      },
      interests: {
        category: interests?.category || null,
        industry: interests?.industry || null,
        categoryCount: matchCount(facets.categories, interests?.category),
        industryCount: matchCount(facets.industries, interests?.industry),
      },
    },
  });
});

const getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const visibility = await resolveVisibility(req.user);

  const lead = await leadService.getLeadById(parseInt(id, 10), visibility.is_paid, visibility);

  res.json({
    status: "success",
    data: lead,
  });
});

/**
 * POST /api/leads/export — server-side, gated export.
 * Enforces login + format whitelist + plan row cap + daily export quota + audit.
 * Admins/super_admins bypass the quota (usage still tracked).
 */
const exportLeads = asyncHandler(async (req, res) => {
  const format = String(req.query.format || req.body?.format || "csv").toLowerCase();
  const filters = {
    q: req.query.q,
    category: req.query.category || null,
    country_id: toInt(req.query.country_id),
    region_id: toInt(req.query.region_id),
    city_id: toInt(req.query.city_id),
    country_code: req.query.country_code || null,
    region: req.query.region || null,
    city: req.query.city || null,
    industry: req.query.industry || null,
    verified: toBool(req.query.verified),
    sort: req.query.sort || "recent",
    lat: req.query.lat ? parseFloat(req.query.lat) : null,
    lon: req.query.lon ? parseFloat(req.query.lon) : null,
    radius: req.query.radius ? parseFloat(req.query.radius) : 50000,
    limit: toInt(req.query.limit) || undefined,
  };

  const visibility = await resolveVisibility(req.user);

  const result = await leadService.exportLeads({
    userId: req.user.id,
    isAdmin: isRolePaid(req.user),
    filters,
    format,
    ip: req.ip,
    visibility,
  });

  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.status(200).send(result.content);
});

/**
 * POST /api/leads/ingest — external machine-to-machine ingest.
 * Auth handled by requireIngestAuth middleware (Bearer + timestamp + nonce + HMAC).
 */
const ingestLeads = asyncHandler(async (req, res) => {
  const result = await leadService.ingestLeads(req.body?.data ?? req.body, "ingest");
  res.status(201).json({ status: "success", data: result });
});

/**
 * POST /api/leads — create a single lead manually (editor/admin/super_admin).
 */
const createLead = asyncHandler(async (req, res) => {
  const lead = await leadService.createLead(req.body);
  res.status(201).json({
    status: "success",
    data: lead,
  });
});

/**
 * POST /api/leads/import — bulk import leads from raw CSV text (editor/admin/super_admin).
 */
const importLeads = asyncHandler(async (req, res) => {
  const { csv, source } = req.body || {};

  if (!csv || typeof csv !== "string" || !csv.trim()) {
    throw new ApiError(400, "CSV content is required (send { csv: '<text>' })");
  }

  const result = await leadService.importLeadsCsv(csv, source || "csv_upload");

  res.json({
    status: "success",
    data: result,
  });
});

/**
 * GET /api/leads/stats — dashboard overview numbers.
 */
const getStats = asyncHandler(async (req, res) => {
  const stats = await leadService.getStats();
  res.json({
    status: "success",
    data: stats,
  });
});

module.exports = {
  getLeads,
  getFacets,
  getLeadById,
  exportLeads,
  createLead,
  importLeads,
  ingestLeads,
  getStats,
};
