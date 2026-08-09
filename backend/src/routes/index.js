const express = require("express");
const authRoutes = require("./authRoutes");
const leadRoutes = require("./leadRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/leads", leadRoutes);

// Example of an RBAC-protected route for a future "admin" module —
// left here as a template (see Section 5 of the dev doc for the full
// representative admin endpoint list).
// router.use("/admin", requireRole("admin", "super_admin"), adminRoutes);

module.exports = router;
