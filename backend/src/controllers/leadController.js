const leadService = require("../services/leadService");
const quotaService = require("../services/quotaService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

function isRolePaid(user) {
  return user && (user.roles || []).some((r) => ["admin", "super_admin"].includes(r));
}

const getLeads = asyncHandler(async (req, res) => {
  const { q, country_id, region_id, city_id, industry, cursor, limit, lat, lon, radius } = req.query;

  // Paid access = active paid subscription OR an admin/super_admin role.
  // Admins bypass quotas; regular users are checked by the requireQuota middleware.
  const [hasPaid, quotaStatus] = await Promise.all([
    req.user && !isRolePaid(req.user)
      ? quotaService.hasActivePaidPlan(req.user.id)
      : Promise.resolve(isRolePaid(req.user)),
    quotaService.getQuotaStatus(req.user.id),
  ]);
  const is_paid = !!hasPaid;

  const result = await leadService.getLeads({
    q,
    country_id: country_id ? parseInt(country_id, 10) : null,
    region_id: region_id ? parseInt(region_id, 10) : null,
    city_id: city_id ? parseInt(city_id, 10) : null,
    industry,
    cursor: cursor ? parseInt(cursor, 10) : null,
    limit: limit ? parseInt(limit, 10) : 50,
    lat: lat ? parseFloat(lat) : null,
    lon: lon ? parseFloat(lon) : null,
    radius: radius ? parseFloat(radius) : 50000,
    is_paid,
  });

  res.json({
    status: "success",
    data: { ...result, quota: quotaStatus },
  });
});

const getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const is_paid = isRolePaid(req.user)
    ? true
    : await quotaService.hasActivePaidPlan(req.user.id);

  const lead = await leadService.getLeadById(parseInt(id, 10), is_paid);

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
    country_id: req.query.country_id ? parseInt(req.query.country_id, 10) : null,
    region_id: req.query.region_id ? parseInt(req.query.region_id, 10) : null,
    city_id: req.query.city_id ? parseInt(req.query.city_id, 10) : null,
    industry: req.query.industry,
    limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
  };

  const result = await leadService.exportLeads({
    userId: req.user.id,
    isAdmin: isRolePaid(req.user),
    filters,
    format,
    ip: req.ip,
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
  getLeadById,
  exportLeads,
  createLead,
  importLeads,
  ingestLeads,
  getStats,
};
