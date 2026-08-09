const { Country, State } = require("country-state-city");
const { pool } = require("../config/db");

async function seedGeo() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Seeding countries...");
    const allCountries = Country.getAllCountries();
    for (const c of allCountries) {
      await client.query(
        `INSERT INTO countries (name, code) 
         VALUES ($1, $2) 
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
        [c.name, c.isoCode]
      );
    }

    // Get country mapping to resolve IDs for states
    const { rows: countryRows } = await client.query("SELECT id, code FROM countries");
    const countryMap = new Map(countryRows.map(r => [r.code, r.id]));

    console.log("Seeding regions (states)... This may take a moment.");
    const allStates = State.getAllStates();
    
    // Batch insert states for performance
    const BATCH_SIZE = 500;
    for (let i = 0; i < allStates.length; i += BATCH_SIZE) {
      const batch = allStates.slice(i, i + BATCH_SIZE);
      const values = [];
      const params = [];
      
      batch.forEach((s, index) => {
        const countryId = countryMap.get(s.countryCode);
        if (countryId) {
          const base = index * 2;
          values.push(`($${base + 1}, $${base + 2})`);
          params.push(countryId, s.name);
        }
      });

      if (params.length > 0) {
        await client.query(
          `INSERT INTO regions (country_id, name) 
           VALUES ${values.join(", ")} 
           ON CONFLICT (country_id, name) DO NOTHING`,
          params
        );
      }
    }

    await client.query("COMMIT");
    console.log("Geo seeding complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Geo seeding failed", err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedGeo();
