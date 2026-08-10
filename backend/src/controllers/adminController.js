const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");
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

module.exports = {
  requireAdmin,
  getAllUsers,
  getUserById,
  updateUserRole,
  toggleUserActive,
  getRoles,
  createUser,
};
