const { query } = require("../config/db");
const redis = require("../config/redis");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const auditService = require("./auditService");

/**
 * quotaService — plan + usage-quota enforcement, translated from the WP
 * plugins' flapp_get_plan_config and flapp_check_and_increment_quota.
 *
 * - Each user maps to an active plan (default: free tier).
 * - Daily usage is counted atomically in Redis (one Lua script) against the
 *   plan's daily_search_quota / daily_export_quota (-1 = unlimited).
 * - Every use is also appended to usage_logs for auditing.
 * - Admins / super_admins bypass limits (usage is still tracked).
 */

// Lua: check-and-increment atomically. Returns {1, used} allowed or {0, used} blocked.
const INCR_SCRIPT = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local amount = tonumber(ARGV[2])
  local ttl = tonumber(ARGV[3])
  if limit < 0 then
    local used = redis.call('INCRBY', key, amount)
    redis.call('EXPIRE', key, ttl)
    return {1, used}
  end
  local current = tonumber(redis.call('GET', key) or '0')
  if current + amount > limit then
    return {0, current}
  end
  local used = redis.call('INCRBY', key, amount)
  redis.call('EXPIRE', key, ttl)
  return {1, used}
`;

function dailyKey(action, userId) {
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate()
  ).padStart(2, "0")}`;
  return `quota:${action}:${userId}:${ymd}`;
}

function secondsUntilMidnightUTC() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.ceil((next - now) / 1000));
}

async function getPlans() {
  const { rows } = await query(
    "SELECT * FROM plans ORDER BY price_cents ASC, id ASC"
  );
  return rows;
}

/** Resolve the user's active plan (or the default free plan). */
async function getActivePlan(userId) {
  const { rows } = await query(
    `SELECT p.*, s.id AS subscription_id, s.status AS subscription_status,
            s.paypal_subscription_id, s.current_period_end
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = $1 AND s.status = 'active'
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (rows[0]) return rows[0];

  // No active paid plan -> the default free plan.
  const { rows: defRows } = await query(
    `SELECT * FROM plans WHERE is_default = TRUE ORDER BY id ASC LIMIT 1`
  );
  if (defRows[0]) return defRows[0];

  // Fallback if plans aren't seeded yet: an in-memory free tier from env.
  return {
    code: "free",
    name: "Free",
    price_cents: 0,
    daily_search_quota: env.DEFAULT_FREE_SEARCHES,
    daily_export_quota: env.DEFAULT_FREE_EXPORTS,
    max_export_per_req: env.DEFAULT_FREE_MAX_EXPORT,
    allowed_formats: ["csv"],
    can_view_contact: false,
    is_default: true,
  };
}

/** True when the user has an active PAID subscription (not just the free tier). */
async function hasActivePaidPlan(userId) {
  const plan = await getActivePlan(userId);
  return plan && !plan.is_default && (plan.price_cents || 0) > 0;
}

/**
 * Atomically check + increment daily usage for an action.
 * @param {string} userId
 * @param {'search'|'view_lead'|'export'} action
 * @param {number} amount number of units (rows for export, 1 otherwise)
 * @param {{ isAdmin?: boolean, ip?: string }} opts
 * @returns {{ allowed: boolean, used: number, limit: number, plan: object }}
 * @throws ApiError(429) with next-plan upgrade info when the quota is exceeded
 *          and the user is not an admin.
 */
async function checkAndIncrement(userId, action, amount = 1, opts = {}) {
  const plan = await getActivePlan(userId);
  const isAdmin = !!opts.isAdmin;

  const limitField =
    action === "export" ? "daily_export_quota" : "daily_search_quota";
  const limit = plan[limitField];
  // 'search' and 'view_lead' share one daily search pool.
  const counterAction = action === "view_lead" ? "search" : action;
  const key = dailyKey(counterAction, userId);
  const ttl = secondsUntilMidnightUTC();

  const res = await redis.eval(
    INCR_SCRIPT,
    1,
    key,
    String(limit),
    String(amount),
    String(ttl)
  );
  const allowed = Number(res[0]) === 1;
  const used = Number(res[1]);

  // Track usage (fire-and-forget; never block a request on the log write).
  auditService.log({
    actorId: userId,
    action: action === "export" ? "lead_export" : "quota_use",
    entityType: "quota",
    metadata: { action, amount, used, limit },
    ip: opts.ip,
  });

  if (!allowed && !isAdmin) {
    const nextPlan = await getNextPlan(plan);
    throw new ApiError(429, `Daily ${action} limit reached`, {
      code: "QUOTA_EXCEEDED",
      used,
      limit,
      plan: {
        code: plan.code,
        name: plan.name,
        allowed_formats: plan.allowed_formats,
        can_view_contact: plan.can_view_contact,
      },
      nextPlan,
    });
  }

  return { allowed, used, limit, plan };
}

/** The next higher plan, used for upgrade prompts in the UI. */
async function getNextPlan(currentPlan) {
  const { rows } = await query(
    `SELECT * FROM plans WHERE price_cents > $1 ORDER BY price_cents ASC LIMIT 1`,
    [currentPlan.price_cents || 0]
  );
  return rows[0] || null;
}

/** Usage snapshot for the UI quota pill. */
async function getQuotaStatus(userId) {
  const plan = await getActivePlan(userId);
  const searchesUsed = await getUsed("search", userId);
  const exportsUsed = await getUsed("export", userId);
  const nextPlan = await getNextPlan(plan);
  return {
    plan: {
      code: plan.code,
      name: plan.name,
      price_cents: plan.price_cents,
      allowed_formats: plan.allowed_formats,
      can_view_contact: plan.can_view_contact,
    },
    searches: {
      used: searchesUsed,
      limit: plan.daily_search_quota,
    },
    exports: {
      used: exportsUsed,
      limit: plan.daily_export_quota,
    },
    max_export_per_req: plan.max_export_per_req,
    nextPlan,
  };
}

async function getUsed(action, userId) {
  const used = await redis.get(dailyKey(action, userId));
  return used ? parseInt(used, 10) : 0;
}

/** Middleware factory for authenticated lead routes. */
function requireQuota(action) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, "Not authenticated"));
      const isAdmin = (req.user.roles || []).some((r) =>
        ["admin", "super_admin"].includes(r)
      );
      const amount = action === "export" ? 1 : 1; // export amount set in controller
      req.quota = await checkAndIncrement(req.user.id, action, amount, {
        isAdmin,
        ip: req.ip,
      });
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  getPlans,
  getActivePlan,
  hasActivePaidPlan,
  getNextPlan,
  getQuotaStatus,
  checkAndIncrement,
  requireQuota,
};
