const express = require("express");
const router = express.Router();
const billingController = require("../controllers/billingController");
const { authenticate } = require("../middleware/auth");

// Public: plan list for the marketing/plan-picker UI.
router.get("/plans", billingController.getPlans);

// Authenticated billing endpoints.
router.get("/billing/me", authenticate, billingController.getMyBilling);
router.post("/billing/subscribe", authenticate, billingController.subscribe);
router.post("/billing/cancel", authenticate, billingController.cancel);
router.post("/billing/upgrade", authenticate, billingController.upgrade);

// PayPal webhook — NOT JWT-authed; uses its own signature verification.
router.post("/billing/webhook", billingController.webhook);

module.exports = router;
