const express = require("express");
const authRoutes = require("./authRoutes");
const leadRoutes = require("./leadRoutes");
const adminRoutes = require("./adminRoutes");
const geoRoutes = require("./geoRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/leads", leadRoutes);
router.use("/admin", adminRoutes);
router.use("/geo", geoRoutes);

module.exports = router;
