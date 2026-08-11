const express = require("express");
const authRoutes = require("./authRoutes");
const leadRoutes = require("./leadRoutes");
const adminRoutes = require("./adminRoutes");
const geoRoutes = require("./geoRoutes");
const billingRoutes = require("./billingRoutes");
const contactRoutes = require("./contactRoutes");
const blogRoutes = require("./blogRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/leads", leadRoutes);
router.use("/admin", adminRoutes);
router.use("/geo", geoRoutes);
router.use("/contact", contactRoutes);
router.use("/blog", blogRoutes);
router.use("/", billingRoutes); // /api/plans, /api/billing/*

module.exports = router;
