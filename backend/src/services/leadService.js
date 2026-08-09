const { pool } = require("../config/db");
const ApiError = require("../utils/ApiError");

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

module.exports = {
  getLeads,
  getLeadById,
  exportLeads,
};
