const leadService = require("../services/leadService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const getLeads = asyncHandler(async (req, res) => {
  const { q, country_id, region_id, city_id, industry, cursor, limit, lat, lon, radius } = req.query;
  
  // Simple check for paid access: admins/super_admins get full access.
  // In Module 3, this will also check the user's active subscription.
  const is_paid = req.user && (req.user.roles.includes("admin") || req.user.roles.includes("super_admin"));

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
    data: result,
  });
});

const getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const is_paid = req.user && (req.user.roles.includes("admin") || req.user.roles.includes("super_admin"));

  const lead = await leadService.getLeadById(parseInt(id, 10), is_paid);

  res.json({
    status: "success",
    data: lead,
  });
});

const exportLeads = asyncHandler(async (req, res) => {
  const is_paid = req.user && (req.user.roles.includes("admin") || req.user.roles.includes("super_admin"));

  const csv = await leadService.exportLeads(req.query, is_paid);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=leads.csv");
  res.status(200).send(csv);
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
  getStats,
};
