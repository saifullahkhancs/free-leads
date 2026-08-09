const { Pool } = require("pg");
const env = require("./env");

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  // Unexpected errors on idle clients shouldn't crash the process silently.
  // eslint-disable-next-line no-console
  console.error("Unexpected PostgreSQL pool error", err);
});

/**
 * Run a query with the shared pool.
 * @param {string} text
 * @param {any[]} params
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a set of queries inside a transaction. `fn` receives a client
 * that MUST be used for every query in the transaction.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
