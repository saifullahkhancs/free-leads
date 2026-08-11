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

// Default membership plans. -1 = unlimited. Format names map to what the
// export serializer can actually produce (csv, json).
const PLANS = [
  {
    code: "free",
    name: "Free",
    price_cents: 0,
    billing_cycle: "monthly",
    daily_search_quota: 10,
    daily_export_quota: 1,
    max_export_per_req: 100,
    allowed_formats: ["csv"],
    can_view_contact: false,
    is_default: true,
  },
  {
    code: "starter",
    name: "Starter",
    price_cents: 2900,
    billing_cycle: "monthly",
    daily_search_quota: 50,
    daily_export_quota: 20,
    max_export_per_req: 500,
    allowed_formats: ["csv", "json"],
    can_view_contact: true,
    is_default: false,
  },
  {
    code: "growth",
    name: "Growth",
    price_cents: 6900,
    billing_cycle: "monthly",
    daily_search_quota: 500,
    daily_export_quota: 100,
    max_export_per_req: 2000,
    allowed_formats: ["csv", "json"],
    can_view_contact: true,
    is_default: false,
  },
  {
    code: "pro",
    name: "Pro",
    price_cents: 14900,
    billing_cycle: "monthly",
    daily_search_quota: -1, // unlimited
    daily_export_quota: -1, // unlimited
    max_export_per_req: 5000,
    allowed_formats: ["csv", "json"],
    can_view_contact: true,
    is_default: false,
  },
];

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

    // Seed membership plans (idempotent).
    for (const p of PLANS) {
      await client.query(
        `INSERT INTO plans
           (code, name, price_cents, billing_cycle, daily_search_quota,
            daily_export_quota, max_export_per_req, allowed_formats,
            can_view_contact, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           price_cents = EXCLUDED.price_cents,
           daily_search_quota = EXCLUDED.daily_search_quota,
           daily_export_quota = EXCLUDED.daily_export_quota,
           max_export_per_req = EXCLUDED.max_export_per_req,
           allowed_formats = EXCLUDED.allowed_formats,
           can_view_contact = EXCLUDED.can_view_contact,
           is_default = EXCLUDED.is_default`,
        [
          p.code,
          p.name,
          p.price_cents,
          p.billing_cycle,
          p.daily_search_quota,
          p.daily_export_quota,
          p.max_export_per_req,
          p.allowed_formats,
          p.can_view_contact,
          p.is_default,
        ]
      );
    }
  });

  console.log("Seed complete: roles, permissions, role_permissions, and plans populated.");

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
