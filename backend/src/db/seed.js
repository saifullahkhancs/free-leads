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
    daily_search_quota: 3,
    daily_export_quota: 500,
    max_export_per_req: 500,
    allowed_formats: ["excel"],
    can_view_contact: false,
    show_email: false,
    show_phone: false,
    show_linkedin: false,
    show_twitter: false,
    show_website: false,
    show_about: false,
    is_default: true,
    is_popular: false,
    description: "Get started with basic access – perfect for trying out the platform.",
    cta_text: "Start Free",
    cta_url: "https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?flapp_plan=free",
  },
  {
    code: "starter",
    name: "Starter",
    price_cents: 2900,
    billing_cycle: "monthly",
    daily_search_quota: 10,
    daily_export_quota: 4500,
    max_export_per_req: 500,
    allowed_formats: ["csv", "excel"],
    can_view_contact: true,
    show_email: true,
    show_phone: true,
    show_linkedin: true,
    show_twitter: true,
    show_website: true,
    show_about: true,
    is_default: false,
    is_popular: false,
    description: "Perfect for solo founders & small agencies getting started.",
    cta_text: "Select Plan",
    cta_url: "https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?redirect_to=https://peachpuff-kingfisher-714348.hostingersite.com/membership-levels/",
  },
  {
    code: "growth",
    name: "Growth",
    price_cents: 4900,
    billing_cycle: "monthly",
    daily_search_quota: 50,
    daily_export_quota: 10000,
    max_export_per_req: 1000,
    allowed_formats: ["csv", "excel", "pdf"],
    can_view_contact: true,
    show_email: true,
    show_phone: true,
    show_linkedin: true,
    show_twitter: true,
    show_website: true,
    show_about: true,
    is_default: false,
    is_popular: true,
    description: "For growing teams that need volume, speed & flexibility.",
    cta_text: "Select Plan",
    cta_url: "https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?redirect_to=https://peachpuff-kingfisher-714348.hostingersite.com/membership-levels/",
  },
  {
    code: "pro",
    name: "Pro",
    price_cents: 19900,
    billing_cycle: "monthly",
    daily_search_quota: 100,
    daily_export_quota: 40000,
    max_export_per_req: 5000,
    allowed_formats: ["csv", "excel", "pdf", "json"],
    can_view_contact: true,
    show_email: true,
    show_phone: true,
    show_linkedin: true,
    show_twitter: true,
    show_website: true,
    show_about: true,
    is_default: false,
    is_popular: false,
    description: "For power users who want zero limits and full access.",
    cta_text: "Select Plan",
    cta_url: "https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?redirect_to=https://peachpuff-kingfisher-714348.hostingersite.com/membership-levels/",
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
            can_view_contact, show_email, show_phone, show_linkedin,
            show_twitter, show_website, show_about, is_default, is_popular,
            description, cta_text, cta_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           price_cents = EXCLUDED.price_cents,
           daily_search_quota = EXCLUDED.daily_search_quota,
           daily_export_quota = EXCLUDED.daily_export_quota,
           max_export_per_req = EXCLUDED.max_export_per_req,
           allowed_formats = EXCLUDED.allowed_formats,
           can_view_contact = EXCLUDED.can_view_contact,
           show_email = EXCLUDED.show_email,
           show_phone = EXCLUDED.show_phone,
           show_linkedin = EXCLUDED.show_linkedin,
           show_twitter = EXCLUDED.show_twitter,
           show_website = EXCLUDED.show_website,
           show_about = EXCLUDED.show_about,
           is_default = EXCLUDED.is_default,
           is_popular = EXCLUDED.is_popular,
           description = EXCLUDED.description,
           cta_text = EXCLUDED.cta_text,
           cta_url = EXCLUDED.cta_url`,
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
          p.show_email,
          p.show_phone,
          p.show_linkedin,
          p.show_twitter,
          p.show_website,
          p.show_about,
          p.is_default,
          p.is_popular,
          p.description,
          p.cta_text,
          p.cta_url,
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
