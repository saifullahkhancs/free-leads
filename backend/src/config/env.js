require("dotenv").config();

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function bool(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function int(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return parseInt(value, 10);
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: int("PORT", 8000),
  FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL || "http://localhost:5173",
  CORS_ORIGINS: (process.env.BACKEND_CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",

  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET", "dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me"),
  JWT_ALGORITHM: process.env.JWT_ALGORITHM || "HS256",
  ACCESS_TOKEN_EXPIRE_MINUTES: int("ACCESS_TOKEN_EXPIRE_MINUTES", 15),
  REFRESH_TOKEN_EXPIRE_DAYS: int("REFRESH_TOKEN_EXPIRE_DAYS", 7),

  PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", 30),
  PASSWORD_RESET_URL:
    process.env.PASSWORD_RESET_URL || "http://localhost:5173/reset-password",
  VERIFICATION_CODE_TTL_MINUTES: int("VERIFICATION_CODE_TTL_MINUTES", 15),
  VERIFICATION_ATTEMPT_LIMIT: int("VERIFICATION_ATTEMPT_LIMIT", 5),
  VERIFICATION_ATTEMPT_WINDOW_MINUTES: int("VERIFICATION_ATTEMPT_WINDOW_MINUTES", 15),

  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || "refresh_token",
  REFRESH_COOKIE_SECURE: bool("REFRESH_COOKIE_SECURE", false),

  SMTP_HOST: process.env.SMTP_HOST || "smtp.resend.com",
  SMTP_PORT: int("SMTP_PORT", 587),
  SMTP_USERNAME: process.env.SMTP_USERNAME || "resend",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL ,
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME ,
  SMTP_USE_TLS: bool("SMTP_USE_TLS", true),

  // ---- Contact Us ----
  // Where contact-form notifications are sent. Falls back to SMTP_FROM_EMAIL
  // when unset. The DB always stores the submission so nothing is lost if
  // this is left blank or email delivery fails.
  CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL || "",

  RATE_LIMIT_ENABLED: bool("RATE_LIMIT_ENABLED", true),
  RATE_LIMIT_WINDOW_SECONDS: int("RATE_LIMIT_WINDOW_SECONDS", 60),
  RATE_LIMIT_MAX_REQUESTS: int("RATE_LIMIT_MAX_REQUESTS", 100),
  LOGIN_RATE_LIMIT_MAX: int("LOGIN_RATE_LIMIT_MAX", 10),
  REGISTER_RATE_LIMIT_MAX: int("REGISTER_RATE_LIMIT_MAX", 5),

  // ---- Geocoding (free map location picker) ----
  // Geoapify is used when a key is provided; otherwise the public Nominatim
  // (OpenStreetMap) endpoint is used — no key needed, ~1 req/sec is fine for
  // interactive picking.
  GEOAPIFY_API_KEY: process.env.GEOAPIFY_API_KEY || "",
  NOMINATIM_USER_AGENT:
    process.env.NOMINATIM_USER_AGENT || "freeleads-app/1.0 (leads-directory-web-app)",

  // ---- Quota / plans ----
  // Default free-tier limits used when no plans are seeded yet.
  DEFAULT_FREE_SEARCHES: int("DEFAULT_FREE_SEARCHES", 3),
  DEFAULT_FREE_EXPORTS: int("DEFAULT_FREE_EXPORTS", 500),
  DEFAULT_FREE_MAX_EXPORT: int("DEFAULT_FREE_MAX_EXPORT", 500),

  // ---- Billing / PayPal ----
  // Leave PAYPAL_CLIENT_ID blank to run in "mock mode" (billing is simulated
  // locally so the app is usable without PayPal sandbox credentials). Set the
  // creds + PAYPAL_MODE=sandbox|live to enable real PayPal billing.
  PAYPAL_MODE: process.env.PAYPAL_MODE || "sandbox",        // sandbox | live
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || "",
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || "",
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID || "",
  // For testing the webhook locally (no real PayPal webhook delivery), set
  // PAYPAL_TEST_WEBHOOK=true and POST a payload with the expected event_type.
  PAYPAL_TEST_WEBHOOK: bool("PAYPAL_TEST_WEBHOOK", false),

  // ---- External ingest API (machine-to-machine) ----
  // Token compared constant-time; HMAC secret signs [timestamp, nonce, body].
  // Leave INGEST_API_TOKEN empty to disable the ingest endpoint.
  INGEST_API_TOKEN: process.env.INGEST_API_TOKEN || "",
  INGEST_HMAC_SECRET: process.env.INGEST_HMAC_SECRET || "",
  INGEST_TIMESTAMP_WINDOW_SECONDS: int("INGEST_TIMESTAMP_WINDOW_SECONDS", 300),

  // ---- Google OAuth ----
  // Leave GOOGLE_CLIENT_ID empty to hide the "Continue with Google" button.
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_REDIRECT_URI:
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:5173/auth/google/callback",
  GOOGLE_STATE_TTL_SECONDS: int("GOOGLE_STATE_TTL_SECONDS", 600),

  // ---- Dedup ----
  // 'sha1' (fast, matches legacy) or 'sha256' (stronger). Applied on import.
  DEDUP_ALGORITHM: process.env.DEDUP_ALGORITHM || "sha1",

  // ---- Per-user lockout / throttle (anti brute-force) ----
  LOCKOUT_MAX_ATTEMPTS: int("LOCKOUT_MAX_ATTEMPTS", 5),
  LOCKOUT_WINDOW_SECONDS: int("LOCKOUT_WINDOW_SECONDS", 900),
  SEARCH_THROTTLE_PER_MINUTE: int("SEARCH_THROTTLE_PER_MINUTE", 30),
  EXPORT_THROTTLE_PER_MINUTE: int("EXPORT_THROTTLE_PER_MINUTE", 10),
};

// Fail fast in production if secrets were left at their insecure defaults —
// mirrors the validator in job-easy's core/config.py.
if (env.NODE_ENV === "production") {
  const insecure = ["dev-access-secret-change-me", "dev-refresh-secret-change-me", "change-me", "secret"];
  if (insecure.includes(env.JWT_ACCESS_SECRET) || insecure.includes(env.JWT_REFRESH_SECRET)) {
    throw new Error(
      "JWT_ACCESS_SECRET / JWT_REFRESH_SECRET must be set to strong random values in production " +
        "(generate with: openssl rand -hex 32)"
    );
  }
}

module.exports = env;
