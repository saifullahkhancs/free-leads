const { pool, withTransaction } = require("../config/db");

// Default RBAC seed data. Adjust freely per your app's needs — this gives
// you the 'super_admin' / 'admin' / 'editor' / 'user' roles referenced in
// the dev doc, plus a starter permission set.
const ROLES = ["super_admin", "admin", "editor", "user"];

const PERMISSIONS = [
  "users.read",
  "users.manage",
  "roles.manage",
  "leads.read",
  "leads.export",
  "admin.access",
];

const ROLE_PERMISSIONS = {
  super_admin: PERMISSIONS, // everything
  admin: ["users.read", "users.manage", "leads.read", "leads.export", "admin.access"],
  editor: ["leads.read", "leads.export"],
  user: ["leads.read"],
};

async function seed({ closePool = false } = {}) {
  await withTransaction(async (client) => {
    const roleIds = {};
    for (const name of ROLES) {
      const { rows } = await client.query(
        `INSERT INTO roles (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name`,
        [name]
      );
      roleIds[name] = rows[0].id;
    }

    const permissionIds = {};
    for (const code of PERMISSIONS) {
      const { rows } = await client.query(
        `INSERT INTO permissions (code) VALUES ($1)
         ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
         RETURNING id, code`,
        [code]
      );
      permissionIds[code] = rows[0].id;
    }

    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [roleIds[role], permissionIds[perm]]
        );
      }
    }
  });

  console.log("Seed complete: roles, permissions, and role_permissions populated.");

  if (closePool) {
    await pool.end();
  }
}

module.exports = { seed };

if (require.main === module) {
  seed({ closePool: true }).catch((err) => {
    console.error("Seed failed", err);
    process.exit(1);
  });
}
