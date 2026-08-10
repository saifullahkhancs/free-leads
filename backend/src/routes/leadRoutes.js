const express = require("express");
const leadController = require("../controllers/leadController");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

// Public-ish search (might still want authentication depending on requirements,
// but the masking logic handles the free tier).
// The dev doc says "Free tier gives limited access", implying search is available.
router.get("/", authenticate, leadController.getLeads);
router.get("/stats", authenticate, leadController.getStats);
router.post("/export", authenticate, leadController.exportLeads);

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

// NOTE: keep `/stats` and `/import` defined before `/:id`.
router.get("/:id", authenticate, leadController.getLeadById);

module.exports = router;
