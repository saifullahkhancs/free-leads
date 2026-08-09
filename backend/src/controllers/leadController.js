const leadService = require("../services/leadService");
const asyncHandler = require("../utils/asyncHandler");

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

module.exports = {
  getLeads,
  getLeadById,
  exportLeads,
};
