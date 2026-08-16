const fs = require("fs");
const { parse } = require("csv-parse");
const { pool } = require("../config/db");
const GeoMapper = require("../utils/GeoMapper");

function employeeCount(value) {
  const parsed = Number.parseInt(String(value || "").replace(/,/g, ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function importLeads(csvFilePath) {
  const geoMapper = new GeoMapper();
  await geoMapper.init();

  const parser = fs.createReadStream(csvFilePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  let batch = [];
  const BATCH_SIZE = 1000;
  let totalImported = 0;

  console.log(`Starting import from ${csvFilePath}...`);

  for await (const record of parser) {
    const countryId = record.country ? await geoMapper.getCountryId(record.country, record.country_code) : null;
    const regionId = (countryId && record.region) ? await geoMapper.getRegionId(countryId, record.region) : null;
    const cityId = (countryId && record.city) ? await geoMapper.getCityId(countryId, regionId, record.city) : null;

    batch.push([
      record.full_name,
      record.headline,
      record.about,
      record.email,
      record.linkedin_url,
      record.twitter_url,
      record.facebook_url,
      record.website_url,
      cityId,
      regionId,
      countryId,
      record.industry,
      record.company_name,
      record.job_title,
      employeeCount(record.num_employees),
      record.source || 'csv_import',
    ]);

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch);
      totalImported += batch.length;
      console.log(`Imported ${totalImported} leads...`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch);
    totalImported += batch.length;
  }

  console.log(`Import complete. Total leads imported: ${totalImported}`);
}

async function insertBatch(batch) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // We use a simple unnest-based batch insert for speed in Node.js/pg
    // Alternatively, we could build a large INSERT INTO ... VALUES (...) string
    const query = `
      INSERT INTO leads (
        full_name, headline, about, email, linkedin_url, twitter_url, 
        facebook_url, website_url, city_id, region_id, country_id, 
        industry, company_name, job_title, num_employees, source
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], 
        $7::text[], $8::text[], $9::int[], $10::int[], $11::int[], 
        $12::text[], $13::text[], $14::text[], $15::int[], $16::text[]
      )
    `;

    const columns = [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []];
    batch.forEach(row => {
      row.forEach((val, i) => columns[i].push(val));
    });

    await client.query(query, columns);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Batch insert failed", err);
    throw err;
  } finally {
    client.release();
  }
}

// If run directly
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Please provide a CSV file path");
    process.exit(1);
  }
  importLeads(filePath).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = importLeads;
