/**
 * Script to create an admin or super_admin user
 * 
 * Usage:
 *   node src/db/createAdmin.js --email admin@example.com --role admin
 *   node src/db/createAdmin.js --email superadmin@example.com --role super_admin
 *   node src/db/createAdmin.js --email admin@example.com --role admin --password MySecurePass123
 *
 * If the user doesn't exist, it will be created (password required).
 * If the user already exists, it will add the role to them (promote them).
 * For an existing user, --password is optional: if given, the password is
 * reset and the email marked verified; if omitted, the password is left
 * untouched.
 */

const { hashPassword } = require("../utils/security");
const { query, withTransaction, pool } = require("../config/db");

// Role ids are NOT hardcoded here: roles.id is a SERIAL column, so the
// actual ids depend on insertion order. We resolve the id by role name at
// runtime (same approach as authService.assignDefaultRole / adminController).
const VALID_ROLES = ["super_admin", "admin", "editor", "user"];

async function resolveRoleId(client, roleName) {
  const { rows } = await client.query(
    "SELECT id FROM roles WHERE name = $1",
    [roleName]
  );
  return rows.length > 0 ? rows[0].id : null;
}

async function createAdmin({ email, password, role = "admin" }) {
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role: ${role}. Valid roles: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  // Only hash the password if one was supplied; for an existing user the
  // password is optional (omit --password to promote without resetting it).
  const passwordHash = password ? await hashPassword(password) : null;

  await withTransaction(async (client) => {
    // Resolve the role id from the DB (ids depend on insertion order)
    const roleId = await resolveRoleId(client, role);
    if (!roleId) {
      console.error(`\n❌ Role "${role}" does not exist in the roles table.`);
      console.error(`   The default roles are created by the seed script. Run this first:\n`);
      console.error(`     npm run seed        (seeds roles + permissions)`);
      console.error(`     npm run setup       (migrations + seed, if starting fresh)\n`);
      console.error(`   Then re-run this script.\n`);
      process.exit(1);
    }

    // Check if user exists
    const { rows: existingUsers } = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    let userId;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      console.log(`User ${email} already exists (ID: ${userId})`);

      // Update password only if one was provided
      if (passwordHash) {
        await client.query(
          "UPDATE users SET password_hash = $1, is_email_verified = true WHERE id = $2",
          [passwordHash, userId]
        );
        console.log("Password updated and email verified");
      } else {
        console.log("Keeping existing password");
      }
    } else {
      // Creating a brand-new user always requires a password
      if (!passwordHash) {
        console.error(`\n❌ User ${email} does not exist, so a password is required.`);
        console.error(`   Re-run with: --password <password>\n`);
        process.exit(1);
      }

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

  console.log("\n✅ Done!");
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
║                           [--password <password>]            ║
║                                                              ║
║  Options:                                                    ║
║    --email     Required. Admin email address                 ║
║    --role      admin or super_admin (default: admin)         ║
║    --password  Required for NEW users. For an existing user  ║
║                it's optional: given = reset password,        ║
║                omitted = keep their current password.        ║
║                                                              ║
║  Examples:                                                   ║
║    # Create a new admin user                                 ║
║    node src/db/createAdmin.js \\                             ║
║      --email admin@example.com \\                             ║
║      --role admin \\                                         ║
║      --password MySecurePass123                             ║
║                                                              ║
║    # Promote an EXISTING user to admin (password untouched) ║
║    node src/db/createAdmin.js \\                             ║
║      --email saifullah2019@namal.edu.pk \\                    ║
║      --role admin                                            ║
║                                                              ║
║    # Promote an existing user to super_admin                 ║
║    node src/db/createAdmin.js \\                             ║
║      --email super@example.com \\                             ║
║      --role super_admin                                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
  process.exit(0);
}

createAdmin(options).catch((err) => {
  console.error("Error creating admin:", err);
  process.exit(1);
});
