/**
 * Standalone entrypoint for the CSV import worker.
 *
 * By default the worker runs inside the API process (IMPORT_WORKER_ENABLED,
 * see server.js). To run it as its own process instead — e.g. on a separate
 * machine or under its own PM2/systemd unit — set IMPORT_WORKER_ENABLED=false
 * on the API and run:  npm run worker
 */
const { pool } = require("./config/db");
const { redis } = require("./config/redis");
const { startImportWorker, stopImportWorker } = require("./jobs/importWorker");

async function start() {
  await pool.query("SELECT 1");
  await redis.ping();
  startImportWorker();

  const shutdown = async (signal) => {
    // eslint-disable-next-line no-console
    console.log(`${signal} received, stopping import worker...`);
    await stopImportWorker().catch(() => {});
    await pool.end().catch(() => {});
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start import worker:", err);
  process.exit(1);
});
