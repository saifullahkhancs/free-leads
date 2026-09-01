const app = require("./app");
const env = require("./config/env");
const { pool } = require("./config/db");
const { redis } = require("./config/redis");
const { runMigrations } = require("./db/migrate");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMigrationsWithRetry() {
  const maxRetries = parseInt(process.env.MIGRATION_RETRIES || "10", 10);
  const delayMs = parseInt(process.env.MIGRATION_RETRY_DELAY_MS || "2000", 10);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await runMigrations();
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`Migration attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      // eslint-disable-next-line no-console
      console.log(`Retrying migrations in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
}

async function start() {
  // Run migrations automatically on startup, so fresh environments /
  // containers don't need a manual `npm run migrate` step.
  // Set AUTO_MIGRATE=false to disable this behaviour if needed.
  const shouldAutoMigrate = process.env.AUTO_MIGRATE !== "false";
  if (shouldAutoMigrate) {
    // eslint-disable-next-line no-console
    console.log("Running database migrations on startup...");
    await runMigrationsWithRetry();
    // eslint-disable-next-line no-console
    console.log("Database migrations finished.");
  } else {
    // eslint-disable-next-line no-console
    console.log("AUTO_MIGRATE=false — skipping migrations on startup.");
  }

  // Fail fast if Postgres/Redis aren't reachable, rather than accepting
  // traffic against a broken backend.
  await pool.query("SELECT 1");
  await redis.ping();

  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Auth API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal) => {
    // eslint-disable-next-line no-console
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await pool.end();
      redis.disconnect();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
