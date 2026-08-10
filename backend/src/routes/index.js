const express = require("express");
const authRoutes = require("./authRoutes");
const leadRoutes = require("./leadRoutes");
const adminRoutes = require("./adminRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/leads", leadRoutes);
router.use("/admin", adminRoutes);

module.exports = router;
