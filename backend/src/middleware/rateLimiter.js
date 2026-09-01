const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { redis } = require("../config/redis");
const env = require("../config/env");

function makeLimiter({ windowSeconds, max, keyPrefix }) {
  if (!env.RATE_LIMIT_ENABLED) {
    return (req, res, next) => next();
  }
  return rateLimit({
    windowMs: windowSeconds * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: `rl:${keyPrefix}:`,
      sendCommand: (...args) => redis.call(...args),
    }),
    message: { detail: "Too many requests, please try again later." },
  });
}

// Mirrors job-easy's per-route @limiter.limit(...) decorators.
const registerLimiter = makeLimiter({ windowSeconds: 60, max: env.REGISTER_RATE_LIMIT_MAX, keyPrefix: "register" });
const loginLimiter = makeLimiter({ windowSeconds: 60, max: env.LOGIN_RATE_LIMIT_MAX, keyPrefix: "login" });
const verifyLimiter = makeLimiter({ windowSeconds: 60, max: 10, keyPrefix: "verify" });
const resendVerificationLimiter = makeLimiter({ windowSeconds: 60, max: 3, keyPrefix: "resend-verification" });
const forgotPasswordLimiter = makeLimiter({ windowSeconds: 60, max: 5, keyPrefix: "forgot-password" });
const resetPasswordLimiter = makeLimiter({ windowSeconds: 60, max: 5, keyPrefix: "reset-password" });

// General-purpose limiter for the rest of the API surface.
const globalLimiter = makeLimiter({
  windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "global",
});

module.exports = {
  registerLimiter,
  loginLimiter,
  verifyLimiter,
  resendVerificationLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  globalLimiter,
};
