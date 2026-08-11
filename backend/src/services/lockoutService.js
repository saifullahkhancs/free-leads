const redis = require("../config/redis");
const env = require("../config/env");

/**
 * lockoutService — anti brute-force protection translated from the WP plugins'
 * flapp_record_failure / flapp_check_lockout / flapp_clear_failures and
 * flapp_throttle_user.
 *
 * Two mechanisms:
 *  1. Escalating lockout tiers (15m -> 1h -> 24h) keyed per action+identifier
 *     (an IP for unauthenticated actions, or a userId for authenticated ones).
 *  2. A per-user request throttle (searches/min, exports/min) so a single
 *     logged-in account can't hammer the API.
 */

const LOCK_TIERS_SECONDS = [900, 3600, 86400]; // 15m -> 1h -> 24h

function failureKey(action, identifier) {
  return `lockout:${action}:${identifier}`;
}
function throttleKey(action, userId) {
  return `throttle:${action}:${userId}`;
}

/** Record a failed attempt; returns the current lockout info. */
async function recordFailure(action, identifier) {
  const key = failureKey(action, identifier);
  const now = Math.floor(Date.now() / 1000);
  // hsetnx sets 'first' only if not already present — atomic first-timestamp.
  const results = await redis
    .multi()
    .hincrby(key, "count", 1)
    .hsetnx(key, "first", now)
    .expire(key, LOCK_TIERS_SECONDS[LOCK_TIERS_SECONDS.length - 1])
    .exec();

  const count = parseInt(results[0][1] || "1", 10);
  // Tiers escalate: first batch 15m, then 1h, then 24h.
  const tierIndex = Math.min(
    LOCK_TIERS_SECONDS.length - 1,
    Math.floor((count - 1) / env.LOCKOUT_MAX_ATTEMPTS)
  );
  const seconds = LOCK_TIERS_SECONDS[tierIndex];
  return { locked: true, retryAfterSeconds: seconds, attempt: count };
}

/** Returns null if allowed, or { retryAfterSeconds, reason } if locked out. */
async function checkLockout(action, identifier) {
  const key = failureKey(action, identifier);
  const count = parseInt((await redis.hget(key, "count")) || "0", 10);
  if (count === 0) return null;

  const first = parseInt((await redis.hget(key, "first")) || "0", 10);
  const now = Math.floor(Date.now() / 1000);
  // Current tier = how many multiples of max attempts have accumulated.
  const tierIndex = Math.min(LOCK_TIERS_SECONDS.length - 1, Math.floor((count - 1) / env.LOCKOUT_MAX_ATTEMPTS));
  const windowSeconds = LOCK_TIERS_SECONDS[tierIndex];

  if (now - first < windowSeconds) {
    return { retryAfterSeconds: windowSeconds - (now - first) };
  }
  // Window has elapsed — reset the counter so the user gets fresh attempts.
  await redis.del(key);
  return null;
}

/** Clear the failure counter after a successful action. */
async function clearFailures(action, identifier) {
  await redis.del(failureKey(action, identifier));
}

/**
 * Per-user throttle. Returns true (allowed) if the count stays under max;
 * otherwise false (blocked). Rolling window tracked in Redis.
 */
async function throttleUser(action, userId, maxPerMinute) {
  const key = throttleKey(action, userId);
  const windowMs = 60_000;
  const now = Date.now();
  const results = await redis
    .multi()
    .zremrangebyscore(key, 0, now - windowMs) // drop expired entries
    .zcard(key)
    .exec();
  const count = results[1][1]; // zcard result

  if (count >= maxPerMinute) {
    await redis.expire(key, 60);
    return false;
  }
  await redis
    .multi()
    .zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`)
    .expire(key, 60)
    .exec();
  return true;
}

module.exports = {
  recordFailure,
  checkLockout,
  clearFailures,
  throttleUser,
  LOCK_TIERS_SECONDS,
};
