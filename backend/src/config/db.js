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
  const startTime = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - startTime;
    // Track DB time for request logging
    if (global.currentRequestDbTime !== undefined) {
      global.currentRequestDbTime += duration;
    }
    console.log(`📊 DB Query: ${duration}ms - ${text.substring(0, 50)}...`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    // Track DB time for request logging even on errors
    if (global.currentRequestDbTime !== undefined) {
      global.currentRequestDbTime += duration;
    }
    console.log(`❌ DB Error: ${duration}ms - ${text.substring(0, 50)}...`);
    throw error;
  }
}

/**
 * Run a set of queries inside a transaction. `fn` receives a client
 * that MUST be used for every query in the transaction.
 */
async function withTransaction(fn) {
  const startTime = Date.now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    const duration = Date.now() - startTime;
    console.log(`🔄 Transaction: ${duration}ms`);
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    const duration = Date.now() - startTime;
    console.log(`❌ Transaction Error: ${duration}ms`);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
