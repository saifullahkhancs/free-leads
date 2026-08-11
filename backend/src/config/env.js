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
