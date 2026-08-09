const app = require("./app");
const env = require("./config/env");
const { pool } = require("./config/db");
const redis = require("./config/redis");

async function start() {
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
