const Redis = require("ioredis");
const env = require("./env");

// Primary Redis connection. Used for:
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

// Secondary Redis connection for leads caching. Used for:
//  - default first 20 leads (24h TTL)
//  - paginated leads with pre-fetch (10min TTL)
const redisCache = new Redis(env.REDIS_CACHE_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redisCache.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Redis cache connection error", err);
});

module.exports = { redis, redisCache };
