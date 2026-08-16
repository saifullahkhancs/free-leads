const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");
const auditService = require("../services/auditService");
const dedupService = require("../services/dedupService");
const { query, withTransaction } = require("../config/db");
const ApiError = require("../utils/ApiError");

// Middleware to check admin access
const requireAdmin = asyncHandler(async (req, res, next) => {
  const roles = await authService.getUserRoles(req.user.id);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new ApiError(403, "Admin access required");
  }
  req.userRoles = roles;
  next();
});

// Get all users (admin only)
const getAllUsers = asyncHandler(async (req, res) => {
  const { rows: users } = await query(`
    SELECT 
      u.id, u.email, u.first_name, u.last_name, u.is_active, 
      u.is_email_verified, u.created_at,
      ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL) as roles
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);

  res.status(200).json({ users });
});

// Get single user (admin only)
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows: users } = await query(`
    SELECT 
      u.id, u.email, u.first_name, u.last_name, u.is_active, 
      u.is_email_verified, u.created_at,
      ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL) as roles
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE u.id = $1
    GROUP BY u.id
  `, [id]);

  if (users.length === 0) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json({ user: users[0] });
});

// Update user role (admin only)
const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role, action = "assign" } = req.body;

  // Validate role
  const validRoles = ["super_admin", "admin", "editor", "user"];
  if (!validRoles.includes(role)) {
    throw new ApiError(400, `Invalid role. Valid roles: ${validRoles.join(", ")}`);
  }

  // Prevent self-demotion for super_admin
  if (id === req.user.id && req.userRoles.includes("super_admin") && role !== "super_admin") {
    throw new ApiError(400, "Cannot change your own super_admin role");
  }

  await withTransaction(async (client) => {
    // Get role ID
    const { rows: roleRows } = await client.query(
      "SELECT id FROM roles WHERE name = $1",
      [role]
    );
    
    if (roleRows.length === 0) {
      throw new ApiError(400, `Role '${role}' does not exist`);
    }
    const roleId = roleRows[0].id;

    if (action === "assign") {
      // Check if user exists
      const { rows: userRows } = await client.query(
        "SELECT id FROM users WHERE id = $1",
        [id]
      );
      if (userRows.length === 0) {
        throw new ApiError(404, "User not found");
      }

      // Assign role
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [id, roleId]
      );
    } else if (action === "remove") {
      await client.query(
        "DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2",
        [id, roleId]
      );
    } else {
      throw new ApiError(400, "Invalid action. Use 'assign' or 'remove'");
    }
  });

  // Get updated user
  const { rows: users } = await query(`
    SELECT 
      u.id, u.email, u.first_name, u.last_name, u.is_active, 
      u.is_email_verified, u.created_at,
      ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL) as roles
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE u.id = $1
    GROUP BY u.id
  `, [id]);

  res.status(200).json({ 
    message: `Role '${role}' ${action === "assign" ? "assigned to" : "removed from"} user`,
    user: users[0]
  });
});

// Toggle user active status (admin only)
const toggleUserActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  // Prevent self-deactivation
  if (id === req.user.id) {
    throw new ApiError(400, "Cannot deactivate your own account");
  }

  const { rows } = await query(
    "UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, is_active",
    [is_active, id]
  );

  if (rows.length === 0) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json({ 
    message: `User ${is_active ? "activated" : "deactivated"}`,
    user: rows[0]
  });
});

/**
 * GET /api/admin/audit-logs — read the security audit trail (admin only).
 */
const getAuditLogs = asyncHandler(async (req, res) => {
  const rows = await auditService.getAuditLogs({
    limit: req.query.limit ? parseInt(req.query.limit, 10) : 100,
    action: req.query.action || null,
    actorId: req.query.actor_id || null,
  });
  res.status(200).json({ logs: rows });
});

/**
 * POST /api/admin/leads/dedup — pure-SQL duplicate finder (admin only).
 * body: { fields: ['email','phone','website','biz'], mode: 'preview'|'mark'|'delete' }
 */
const runDedup = asyncHandler(async (req, res) => {
  const ALLOWED_FIELDS = ["email", "phone", "website", "biz"];
  const fields = (req.body?.fields || ["email"])
    .filter((f) => ALLOWED_FIELDS.includes(f));
  if (fields.length === 0) throw new ApiError(400, "No valid dedup fields");

  const mode = ["preview", "mark", "delete"].includes(req.body?.mode)
    ? req.body.mode
    : "preview";

  const result = await dedupService.runDedup(fields, mode);

  await auditService.log({
    actorId: req.user.id,
    action: "dedup",
    entityType: "lead",
    metadata: { fields, mode, ...result },
    ip: req.ip,
  });

  res.status(200).json({ status: "success", data: result });
});

// Get all roles (admin only)
const getRoles = asyncHandler(async (req, res) => {
  const { rows: roles } = await query(`
    SELECT r.id, r.name, 
           ARRAY_AGG(p.code) FILTER (WHERE p.code IS NOT NULL) as permissions
    FROM roles r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    GROUP BY r.id
    ORDER BY r.id
  `);

  res.status(200).json({ roles });
});

// Create new user with specific role (admin only)
const createUser = asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, role = "user" } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const result = await authService.register({
    email,
    password,
    firstName: firstName || email.split("@")[0],
    lastName: lastName || "User"
  });

  // If registration succeeded and a role was specified, assign it
  if (result.message && result.message.includes("Verification")) {
    const user = await authService.findUserByEmail(email);
    if (user) {
      const { rows } = await query("SELECT id FROM roles WHERE name = $1", [role]);
      if (rows.length > 0) {
        await query(
          "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [user.id, rows[0].id]
        );
        // Auto-verify the user since admin is creating them
        await query(
          "UPDATE users SET is_email_verified = true WHERE id = $1",
          [user.id]
        );
      }
    }
  }

  const newUser = await authService.findUserByEmail(email);
  const roles = await authService.getUserRoles(newUser.id);

  res.status(201).json({ 
    message: "User created successfully",
    user: authService.sanitizeUser(newUser, roles)
  });
});

// ---- Membership Plans Management (Admin) ----

const getAdminPlans = asyncHandler(async (req, res) => {
  const { rows } = await query("SELECT * FROM plans ORDER BY price_cents ASC, id ASC");
  res.status(200).json({ status: "success", data: rows });
});

const createPlan = asyncHandler(async (req, res) => {
  const {
    code,
    name,
    price_cents = 0,
    billing_cycle = "monthly",
    daily_search_quota = 3,
    daily_export_quota = 0,
    max_export_per_req = 100,
    allowed_formats = ["excel"],
    can_view_contact = false,
    show_email = false,
    show_phone = false,
    show_linkedin = false,
    show_twitter = false,
    show_website = false,
    show_about = false,
    is_default = false,
    is_popular = false,
    description = "",
    cta_text = "Select Plan",
    cta_url = "",
  } = req.body || {};

  if (!code || !name) {
    throw new ApiError(400, "Plan code and name are required");
  }

  const normalizedFormats = Array.isArray(allowed_formats)
    ? allowed_formats.map((f) => String(f).toLowerCase()).filter((f) => ["csv", "excel", "pdf", "json"].includes(f))
    : ["excel"];

  const newPlan = await withTransaction(async (client) => {
    if (is_default) {
      await client.query("UPDATE plans SET is_default = FALSE");
    }
    if (is_popular) {
      await client.query("UPDATE plans SET is_popular = FALSE");
    }

    const { rows } = await client.query(
      `INSERT INTO plans (
        code, name, price_cents, billing_cycle, daily_search_quota,
        daily_export_quota, max_export_per_req, allowed_formats,
        can_view_contact, show_email, show_phone, show_linkedin,
        show_twitter, show_website, show_about, is_default, is_popular,
        description, cta_text, cta_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        code,
        name,
        parseInt(price_cents, 10) || 0,
        billing_cycle || "monthly",
        parseInt(daily_search_quota, 10),
        parseInt(daily_export_quota, 10),
        parseInt(max_export_per_req, 10),
        normalizedFormats,
        Boolean(can_view_contact),
        Boolean(show_email),
        Boolean(show_phone),
        Boolean(show_linkedin),
        Boolean(show_twitter),
        Boolean(show_website),
        Boolean(show_about),
        Boolean(is_default),
        Boolean(is_popular),
        description,
        cta_text,
        cta_url,
      ]
    );
    return rows[0];
  });

  auditService.log({
    actorId: req.user.id,
    action: "plan_create",
    entityType: "plan",
    entityId: newPlan.id,
    metadata: { code: newPlan.code, name: newPlan.name },
  });

  res.status(201).json({ status: "success", data: newPlan });
});

const updatePlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    price_cents = 0,
    billing_cycle = "monthly",
    daily_search_quota = 3,
    daily_export_quota = 0,
    max_export_per_req = 100,
    allowed_formats = ["excel"],
    can_view_contact = false,
    show_email = false,
    show_phone = false,
    show_linkedin = false,
    show_twitter = false,
    show_website = false,
    show_about = false,
    is_default = false,
    is_popular = false,
    description = "",
    cta_text = "Select Plan",
    cta_url = "",
  } = req.body || {};

  const normalizedFormats = Array.isArray(allowed_formats)
    ? allowed_formats.map((f) => String(f).toLowerCase()).filter((f) => ["csv", "excel", "pdf", "json"].includes(f))
    : ["excel"];

  const updatedPlan = await withTransaction(async (client) => {
    const { rows: existing } = await client.query("SELECT * FROM plans WHERE id = $1", [id]);
    if (!existing[0]) {
      throw new ApiError(404, "Plan not found");
    }

    if (is_default && !existing[0].is_default) {
      await client.query("UPDATE plans SET is_default = FALSE");
    }
    if (is_popular && !existing[0].is_popular) {
      await client.query("UPDATE plans SET is_popular = FALSE");
    }

    const { rows } = await client.query(
      `UPDATE plans
       SET
         name = $2,
         price_cents = $3,
         billing_cycle = $4,
         daily_search_quota = $5,
         daily_export_quota = $6,
         max_export_per_req = $7,
         allowed_formats = $8,
         can_view_contact = $9,
         show_email = $10,
         show_phone = $11,
         show_linkedin = $12,
         show_twitter = $13,
         show_website = $14,
         show_about = $15,
         is_default = $16,
         is_popular = $17,
         description = $18,
         cta_text = $19,
         cta_url = $20
       WHERE id = $1
       RETURNING *`,
      [
        id,
        name,
        parseInt(price_cents, 10) || 0,
        billing_cycle || "monthly",
        parseInt(daily_search_quota, 10),
        parseInt(daily_export_quota, 10),
        parseInt(max_export_per_req, 10),
        normalizedFormats,
        Boolean(can_view_contact),
        Boolean(show_email),
        Boolean(show_phone),
        Boolean(show_linkedin),
        Boolean(show_twitter),
        Boolean(show_website),
        Boolean(show_about),
        Boolean(is_default),
        Boolean(is_popular),
        description,
        cta_text,
        cta_url,
      ]
    );
    return rows[0];
  });

  auditService.log({
    actorId: req.user.id,
    action: "plan_update",
    entityType: "plan",
    entityId: updatedPlan.id,
    metadata: { code: updatedPlan.code, name: updatedPlan.name },
  });

  res.status(200).json({ status: "success", data: updatedPlan });
});

const deletePlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows: existing } = await query("SELECT * FROM plans WHERE id = $1", [id]);
  if (!existing[0]) {
    throw new ApiError(404, "Plan not found");
  }
  if (existing[0].is_default) {
    throw new ApiError(400, "Cannot delete the default free plan");
  }

  await query("DELETE FROM plans WHERE id = $1", [id]);

  auditService.log({
    actorId: req.user.id,
    action: "plan_delete",
    entityType: "plan",
    entityId: id,
    metadata: { code: existing[0].code, name: existing[0].name },
  });

  res.status(200).json({ status: "success", data: { deleted: true } });
});

/** Aggregate and list the dimensions used by leads for the management page. */
const getLeadDimensions = asyncHandler(async (req, res) => {
  const [summary, countries, industries, categories] = await Promise.all([
    query(`SELECT COUNT(*) FILTER (WHERE is_active)::int AS leads,
                  COUNT(DISTINCT country_id) FILTER (WHERE country_id IS NOT NULL)::int AS countries,
                  COUNT(DISTINCT industry) FILTER (WHERE industry IS NOT NULL AND industry <> '')::int AS industries,
                  COUNT(DISTINCT category) FILTER (WHERE category IS NOT NULL AND category <> '')::int AS categories
           FROM leads`),
    query(`SELECT c.id, c.name, c.code, COUNT(l.id)::int AS lead_count
           FROM countries c JOIN leads l ON l.country_id = c.id
           GROUP BY c.id ORDER BY lead_count DESC, c.name ASC`),
    query(`SELECT industry AS name, COUNT(*)::int AS lead_count FROM leads
           WHERE industry IS NOT NULL AND industry <> '' GROUP BY industry
           ORDER BY lead_count DESC, industry ASC`),
    query(`SELECT category AS name, COUNT(*)::int AS lead_count FROM leads
           WHERE category IS NOT NULL AND category <> '' GROUP BY category
           ORDER BY lead_count DESC, category ASC`),
  ]);
  res.json({ status: "success", data: {
    summary: summary.rows[0], countries: countries.rows,
    industries: industries.rows, categories: categories.rows,
  }});
});

const normalizeDimension = (value) => {
  const type = String(value || "").toLowerCase();
  if (!["country", "industry", "category"].includes(type)) {
    throw new ApiError(400, "Dimension must be country, industry, or category");
  }
  return type;
};

/** Rename a dimension in every related record. */
const renameLeadDimension = asyncHandler(async (req, res) => {
  const type = normalizeDimension(req.params.type);
  const name = String(req.body?.name || "").trim();
  const maxLength = type === "country" ? 120 : 150;
  if (!name || name.length > maxLength) throw new ApiError(400, `A valid name up to ${maxLength} characters is required`);
  const countryId = type === "country" ? Number.parseInt(req.params.key, 10) : null;
  if (type === "country" && !Number.isInteger(countryId)) throw new ApiError(400, "Invalid country id");

  let affected = 0;
  await withTransaction(async (client) => {
    if (type === "country") {
      const result = await client.query("UPDATE countries SET name = $1 WHERE id = $2 RETURNING id", [name, countryId]);
      if (!result.rowCount) throw new ApiError(404, "Country not found");
      const count = await client.query("SELECT COUNT(*)::int AS count FROM leads WHERE country_id = $1", [countryId]);
      affected = count.rows[0].count;
    } else {
      const column = type === "industry" ? "industry" : "category";
      const oldName = String(req.params.key);
      const result = await client.query(`UPDATE leads SET ${column} = $1, updated_at = now() WHERE ${column} = $2`, [name, oldName]);
      affected = result.rowCount;
      const interestColumn = type === "industry" ? "interest_industry" : "interest_category";
      await client.query(`UPDATE users SET ${interestColumn} = $1 WHERE ${interestColumn} = $2`, [name, oldName]);
    }
  });
  await auditService.log({ actorId: req.user.id, action: "lead_dimension_rename", entityType: type,
    metadata: { key: req.params.key, name, affected }, ip: req.ip });
  res.json({ status: "success", data: { affected, name } });
});

/** Delete a dimension and all of its related leads, after explicit confirmation. */
const deleteLeadDimension = asyncHandler(async (req, res) => {
  const type = normalizeDimension(req.params.type);
  if (req.body?.confirmation !== "DELETE") throw new ApiError(400, "Type DELETE to confirm this action");
  const countryId = type === "country" ? Number.parseInt(req.params.key, 10) : null;
  if (type === "country" && !Number.isInteger(countryId)) throw new ApiError(400, "Invalid country id");
  let deleted = 0;
  await withTransaction(async (client) => {
    if (type === "country") {
      const result = await client.query("DELETE FROM leads WHERE country_id = $1", [countryId]);
      deleted = result.rowCount;
      const country = await client.query("DELETE FROM countries WHERE id = $1 RETURNING id", [countryId]);
      if (!country.rowCount) throw new ApiError(404, "Country not found");
    } else {
      const column = type === "industry" ? "industry" : "category";
      const result = await client.query(`DELETE FROM leads WHERE ${column} = $1`, [String(req.params.key)]);
      deleted = result.rowCount;
    }
  });
  await auditService.log({ actorId: req.user.id, action: "lead_dimension_delete", entityType: type,
    metadata: { key: req.params.key, deleted }, ip: req.ip });
  res.json({ status: "success", data: { deleted } });
});

/**
 * DELETE /api/admin/leads — delete all leads (admin only).
 * This is a destructive operation that cannot be undone.
 */
const deleteAllLeads = asyncHandler(async (req, res) => {
  // Get count before deletion for audit log
  const { rows: countResult } = await query("SELECT COUNT(*) as count FROM leads");
  const count = parseInt(countResult[0].count, 10);

  // Delete all leads
  await query("DELETE FROM leads");

  // Log the action
  await auditService.log({
    actorId: req.user.id,
    action: "delete_all_leads",
    entityType: "lead",
    metadata: { count },
    ip: req.ip,
  });

  res.status(200).json({ 
    status: "success", 
    message: `Deleted ${count} leads`,
    data: { deletedCount: count }
  });
});

module.exports = {
  requireAdmin,
  getAllUsers,
  getUserById,
  updateUserRole,
  toggleUserActive,
  getRoles,
  createUser,
  getAuditLogs,
  runDedup,
  getAdminPlans,
  createPlan,
  updatePlan,
  deletePlan,
  deleteAllLeads,
  getLeadDimensions,
  renameLeadDimension,
  deleteLeadDimension,
};
