/**
 * Script to create an admin or super_admin user
 * 
 * Usage:
 *   node src/db/createAdmin.js --email admin@example.com --role admin
 *   node src/db/createAdmin.js --email superadmin@example.com --role super_admin
 *   node src/db/createAdmin.js --email admin@example.com --role admin --password MySecurePass123
 *
 * If the user doesn't exist, it will be created.
 * If the user already exists, it will add the role to them.
 */

const { hashPassword } = require("../utils/security");
const { query, withTransaction, pool } = require("../config/db");

const ROLES = {
  user: 1,
  editor: 2,
  admin: 3,
  super_admin: 4
};

async function createAdmin({ email, password, role = "admin" }) {
  const roleId = ROLES[role];
  if (!roleId) {
    console.error(`Invalid role: ${role}. Valid roles: ${Object.keys(ROLES).join(", ")}`);
    process.exit(1);
  }

  if (!password) {
    console.error("Password is required for new users");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  await withTransaction(async (client) => {
    // Check if user exists
    const { rows: existingUsers } = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    let userId;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      console.log(`User ${email} already exists (ID: ${userId})`);
      
      // Update password if provided
      await client.query(
        "UPDATE users SET password_hash = $1, is_email_verified = true WHERE id = $2",
        [passwordHash, userId]
      );
      console.log("Password updated and email verified");
    } else {
      // Create new user
      const { rows: newUsers } = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified, is_active)
         VALUES ($1, $2, $3, $4, true, true)
         RETURNING id`,
        [email, passwordHash, email.split("@")[0], "Admin"]
      );
      userId = newUsers[0].id;
      console.log(`Created new user ${email} (ID: ${userId})`);
    }

    // Check if role already assigned
    const { rows: existingRole } = await client.query(
      "SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2",
      [userId, roleId]
    );

    if (existingRole.length > 0) {
      console.log(`User already has role: ${role}`);
    } else {
      // Assign role
      await client.query(
        "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
        [userId, roleId]
      );
      console.log(`Assigned role: ${role} to ${email}`);
    }

    // Get user roles
    const { rows: userRoles } = await client.query(
      `SELECT r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [userId]
    );
    console.log(`\n${email} now has roles: ${userRoles.map(r => r.name).join(", ")}`);
  });

  console.log("\n✅ Admin creation complete!");
  console.log(`   Email: ${email}`);
  console.log(`   Role: ${role}`);
  
  if (pool) {
    await pool.end();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--email" && args[i + 1]) {
    options.email = args[i + 1];
    i++;
  } else if (args[i] === "--password" && args[i + 1]) {
    options.password = args[i + 1];
    i++;
  } else if (args[i] === "--role" && args[i + 1]) {
    options.role = args[i + 1];
    i++;
  }
}

if (!options.email) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Create Admin/Super Admin User Script                ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Usage:                                                      ║
║    node src/db/createAdmin.js --email <email> --role <role>  ║
║                           --password <password>              ║
║                                                              ║
║  Options:                                                    ║
║    --email     Required. Admin email address                 ║
║    --role      admin or super_admin (default: admin)         ║
║    --password  Password for new users (required)            ║
║                                                              ║
║  Examples:                                                   ║
║    node src/db/createAdmin.js \\                             ║
║      --email admin@example.com \\                             ║
║      --role admin \\                                         ║
║      --password MySecurePass123                             ║
║                                                              ║
║    node src/db/createAdmin.js \\                             ║
║      --email super@example.com \\                             ║
║      --role super_admin \\                                     ║
║      --password SuperSecret123                               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
  process.exit(0);
}

createAdmin(options).catch((err) => {
  console.error("Error creating admin:", err);
  process.exit(1);
});
