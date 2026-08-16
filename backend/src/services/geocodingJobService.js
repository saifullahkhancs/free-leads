/**
 * Background Geocoding Job Service
 * Handles batch geocoding of leads that don't have coordinates
 */

const { pool } = require("../config/db");
const geocodingService = require("./geocodingService");
const { hasPostGIS } = require("../utils/postgis");
const ApiError = require("../utils/ApiError");

/**
 * Persist freshly geocoded coordinates for a lead.
 *
 * `lat`/`lon` are plain DOUBLE PRECISION columns and always updated. The
 * PostGIS `location` column is only written when PostGIS is available; on a
 * plain PostgreSQL server `location` is a TEXT fallback ("lon lat"), so we
 * store the same value as text instead of calling ST_MakePoint/ST_SetSRID,
 * which would throw "function st_makepoint(...) does not exist".
 */
async function updateLeadLocation(lat, lon, leadId) {
  if (await hasPostGIS()) {
    await pool.query(
      `UPDATE leads
       SET lat = $1, lon = $2, location = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
       WHERE id = $3`,
      [lat, lon, leadId]
    );
  } else {
    await pool.query(
      `UPDATE leads
       SET lat = $1, lon = $2, location = $4
       WHERE id = $3`,
      [lat, lon, leadId, `${lon} ${lat}`]
    );
  }
}

class GeocodingJobService {
  /**
   * Get leads that need geocoding (have city but no lat/lon)
   */
  async getLeadsNeedingGeocoding(limit = 100) {
    const { rows } = await pool.query(`
      SELECT l.id, l.full_name, c.name as city_name, r.name as region_name, co.name as country_name
      FROM leads l
      LEFT JOIN cities c ON l.city_id = c.id
      LEFT JOIN regions r ON l.region_id = r.id
      LEFT JOIN countries co ON l.country_id = co.id
      WHERE (l.lat IS NULL OR l.lon IS NULL)
        AND l.city_id IS NOT NULL
        AND l.is_active = TRUE
      ORDER BY l.created_at DESC
      LIMIT $1
    `, [limit]);

    return rows;
  }

  /**
   * Process a batch of leads for geocoding
   */
  async processGeocodingBatch(leads) {
    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: []
    };

    for (const lead of leads) {
      try {
        const coords = await geocodingService.getCoordinates(
          lead.city_name,
          lead.region_name,
          lead.country_name
        );

        if (coords) {
          await updateLeadLocation(coords.lat, coords.lon, lead.id);
          results.success++;
        } else {
          results.errors.push({
            leadId: lead.id,
            leadName: lead.full_name,
            error: 'Could not find coordinates'
          });
          results.failed++;
        }
        results.processed++;
      } catch (error) {
        results.errors.push({
          leadId: lead.id,
          leadName: lead.full_name,
          error: error.message
        });
        results.failed++;
        results.processed++;
      }
    }

    return results;
  }

  /**
   * Run a complete geocoding job
   */
  async runGeocodingJob() {
    console.log('Starting geocoding job...');

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    while (true) {
      const leads = await this.getLeadsNeedingGeocoding(50);

      if (leads.length === 0) {
        console.log('Geocoding job completed');
        break;
      }

      const results = await this.processGeocodingBatch(leads);

      totalProcessed += results.processed;
      totalSuccess += results.success;
      totalFailed += results.failed;

      console.log(`Processed ${results.processed} leads: ${results.success} success, ${results.failed} failed`);

      if (results.errors.length > 0) {
        console.log('Errors:', results.errors.slice(0, 5)); // Log first 5 errors
      }
    }

    return {
      totalProcessed,
      totalSuccess,
      totalFailed
    };
  }

  /**
   * Geocode a single lead by ID
   */
  async geocodeSingleLead(leadId) {
    const id = Number.parseInt(leadId, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "Invalid lead id");
    }

    const { rows } = await pool.query(`
      SELECT l.id, l.full_name, c.name as city_name, r.name as region_name, co.name as country_name
      FROM leads l
      LEFT JOIN cities c ON l.city_id = c.id
      LEFT JOIN regions r ON l.region_id = r.id
      LEFT JOIN countries co ON l.country_id = co.id
      WHERE l.id = $1
    `, [id]);

    if (rows.length === 0) {
      throw new ApiError(404, 'Lead not found');
    }

    const lead = rows[0];

    if (!lead.city_name) {
      throw new ApiError(400, 'Lead has no city information');
    }

    const coords = await geocodingService.getCoordinates(
      lead.city_name,
      lead.region_name,
      lead.country_name
    );

    if (!coords) {
      throw new ApiError(400, 'Could not find coordinates for this location');
    }

    await updateLeadLocation(coords.lat, coords.lon, lead.id);

    return {
      leadId: lead.id,
      lat: coords.lat,
      lon: coords.lon
    };
  }
}

module.exports = new GeocodingJobService();
