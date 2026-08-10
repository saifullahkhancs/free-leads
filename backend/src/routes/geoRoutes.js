const express = require("express");
const rateLimit = require("express-rate-limit");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const geoService = require("../services/geoService");

const router = express.Router();

// Keep the free provider usage sane (Nominatim public instance: ~1 req/s).
const geoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many location requests, slow down" },
});

// GET /api/geo/search?q=Lahore  -> place autocomplete list
router.get(
  "/search",
  geoLimiter,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json([]);
    res.json(await geoService.search(q));
  })
);

// GET /api/geo/reverse?lat=31.5497&lng=74.3436 -> { label, city, region, country, ... }
router.get(
  "/reverse",
  geoLimiter,
  asyncHandler(async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) {
      throw new ApiError(400, "Valid lat (-90..90) and lng (-180..180) query parameters are required");
    }
    res.json(await geoService.reverse(lat, lng));
  })
);

module.exports = router;
