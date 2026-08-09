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

async function runMigrations() {
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
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Migration failed: ${file}`, err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log("Migrations complete.");
  await pool.end();
}

runMigrations();
