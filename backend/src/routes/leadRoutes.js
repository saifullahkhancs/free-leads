const express = require("express");
const leadController = require("../controllers/leadController");
const { authenticate, requireRole } = require("../middleware/auth");
const { requireIngestAuth } = require("../middleware/ingest");
const quotaService = require("../services/quotaService");
const lockoutService = require("../services/lockoutService");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const router = express.Router();

/** Per-user request throttle (blocks one account from hammering the API). */
function throttle(action, maxPerMinute) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, "Not authenticated"));
      const allowed = await lockoutService.throttleUser(req.user.id, action, maxPerMinute);
      if (!allowed) {
        return next(
          new ApiError(429, `Rate limit reached for ${action}. Slow down and try again.`, {
            code: "THROTTLED",
          })
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Search + view are gated by quota (daily search quota pool) and per-user throttle.
router.get(
  "/",
  authenticate,
  throttle("search", env.SEARCH_THROTTLE_PER_MINUTE),
  quotaService.requireQuota("search"),
  leadController.getLeads
);
// Public landing-page coverage. Aggregate counts only; no lead/contact data.
// Keep this above /:id so "landing-stats" is never treated as a lead id.
router.get("/landing-stats", leadController.getLandingStats);

router.get(
  "/stats",
  authenticate,
  leadController.getStats
);

// Filter facets (category / industry / country / state / city + counts).
// Aggregate counts only — no contact data — so it is throttled but not
// charged against the daily search quota.
router.get(
  "/facets",
  authenticate,
  throttle("facets", env.SEARCH_THROTTLE_PER_MINUTE * 2),
  leadController.getFacets
);

// Export: server-side, gated. Quota check happens inside leadService.exportLeads
// (it depends on the actual row count), but we still throttle per user here.
router.post(
  "/export",
  authenticate,
  throttle("export", env.EXPORT_THROTTLE_PER_MINUTE),
  leadController.exportLeads
);

// Machine-to-machine ingest (external pipelines). Not JWT-authed — uses its
// own Bearer + timestamp + nonce + HMAC layer.
router.post("/ingest", requireIngestAuth, leadController.ingestLeads);

// Lead ingestion requires an editor-level role (deny-by-default).
router.post(
  "/",
  authenticate,
  requireRole("admin", "super_admin", "editor"),
  leadController.createLead
);
router.post(
  "/import",
  authenticate,
  requireRole("admin", "super_admin", "editor"),
  leadController.importLeads
);

router.post(
  "/parse-csv",
  authenticate,
  requireRole("admin", "super_admin", "editor"),
  leadController.parseCsv
);

// NOTE: keep `/landing-stats`, `/stats`, `/import`, `/export`, `/ingest` before `/:id`.
router.get(
  "/:id",
  authenticate,
  throttle("view_lead", env.SEARCH_THROTTLE_PER_MINUTE),
  quotaService.requireQuota("view_lead"),
  leadController.getLeadById
);

// Geocoding endpoints (admin only)
router.post(
  "/geocode/:id",
  authenticate,
  requireRole("admin", "super_admin"),
  leadController.geocodeLead
);

router.post(
  "/geocode/batch",
  authenticate,
  requireRole("admin", "super_admin"),
  leadController.runGeocodingBatch
);

module.exports = router;
