const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function getAppliedMigrations() {
  const { rows } = await pool.query("SELECT filename FROM schema_migrations");
  return new Set(rows.map((r) => r.filename));
}

/**
 * Run all pending SQL migrations.
 * @param {{ closePool?: boolean }} options
 *  - closePool: if true, ends the pg pool after migrations finish (useful for CLI).
 *               When used from server startup we keep the pool alive.
 */
async function runMigrations({ closePool = false } = {}) {
  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping already-applied migration: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying migration: ${file}`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Migration failed: ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log("Migrations complete.");

  if (closePool) {
    await pool.end();
  }
}

module.exports = { runMigrations };

// Allow direct CLI usage: `node src/db/migrate.js` or `npm run migrate`
if (require.main === module) {
  runMigrations({ closePool: true }).catch((err) => {
    console.error("Migration runner failed", err);
    process.exit(1);
  });
}
