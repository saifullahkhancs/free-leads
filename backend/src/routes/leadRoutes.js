const express = require("express");
const leadController = require("../controllers/leadController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// Public-ish search (might still want authentication depending on requirements,
// but the masking logic handles the free tier).
// The dev doc says "Free tier gives limited access", implying search is available.
router.get("/", authenticate, leadController.getLeads);
router.post("/export", authenticate, leadController.exportLeads);
router.get("/:id", authenticate, leadController.getLeadById);

module.exports = router;
