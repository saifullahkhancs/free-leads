const Redis = require("ioredis");
const env = require("./env");

// Single shared connection. Used for:
//  - rate limiting (express-rate-limit + rate-limit-redis)
//  - refresh-token revoke/reuse-detection blacklist
//  - short-lived caches (e.g. facet counts, per Section 7 of the dev doc)
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Redis connection error", err);
});

module.exports = redis;
