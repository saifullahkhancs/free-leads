const crypto = require("crypto");
const env = require("../config/env");
const { redis } = require("../config/redis");
const ApiError = require("../utils/ApiError");

/**
 * requireIngestAuth — 4-layer machine-to-machine auth for POST /api/leads/ingest,
 * translated from the WP plugins' freeLeads.site Manager REST ingest endpoint:
 *   1. Bearer token compared with timingSafeEqual (constant time).
 *   2. Timestamp freshness window (limits replay).
 *   3. Nonce replay protection (atomic Redis set).
 *   4. HMAC-SHA256 over [timestamp, nonce, body], verified constant-time.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function requireIngestAuth(req, res, next) {
  try {
    if (!env.INGEST_API_TOKEN || !env.INGEST_HMAC_SECRET) {
      return next(new ApiError(503, "Ingest API is not enabled"));
    }

    // 1. Bearer token.
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token || !safeEqual(token, env.INGEST_API_TOKEN)) {
      return next(new ApiError(401, "Unauthorized"));
    }

    // 2. Timestamp freshness.
    const ts = parseInt(req.headers["x-request-timestamp"] || req.query.timestamp, 10);
    const windowMs = env.INGEST_TIMESTAMP_WINDOW_SECONDS * 1000;
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > windowMs) {
      return next(new ApiError(401, "Request timestamp is outside the allowed window"));
    }

    // 3. HMAC signature (verify BEFORE consuming the nonce).
    const nonce = String(req.headers["x-request-nonce"] || "");
    const signature = String(req.headers["x-signature"] || "");
    const bodyRaw = JSON.stringify(req.body || {});
    const expected = crypto
      .createHmac("sha256", env.INGEST_HMAC_SECRET)
      .update(JSON.stringify([ts, nonce, bodyRaw]))
      .digest("hex");
    if (!nonce || !signature || !safeEqual(signature, expected)) {
      return next(new ApiError(401, "Invalid signature"));
    }

    // 4. Nonce replay protection (atomic — 'NX' means it fails if already used).
    const nonceKey = `ingest:nonce:${nonce}`;
    const claimed = await redis.set(
      nonceKey,
      "1",
      "EX",
      env.INGEST_TIMESTAMP_WINDOW_SECONDS,
      "NX"
    );
    if (claimed !== "OK") {
      return next(new ApiError(401, "Nonce already used (replay detected)"));
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireIngestAuth };
