/**
 * Geocoding Service - converts city names to coordinates
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * Rate limit: 1 request per second
 */

const env = require("../config/env");

class GeocodingService {
  constructor() {
    this.baseUrl = 'https://nominatim.openstreetmap.org/search';
    this.rateLimitDelay = 1000; // 1 second between requests
    this.lastRequestTime = 0;
    // Nominatim's usage policy requires a valid, identifying User-Agent.
    this.userAgent = env.NOMINATIM_USER_AGENT || 'FreeLeads-Geocoding/1.0';
  }

  /**
   * Get coordinates for a city/region/country
   * @param {string} city - City name
   * @param {string} region - Region/State name
   * @param {string} country - Country name
   * @returns {Promise<{lat: number, lon: number}|null>}
   */
  async getCoordinates(city, region, country) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    try {
      // Build query string
      const queryParts = [];
      if (city) queryParts.push(city);
      if (region) queryParts.push(region);
      if (country) queryParts.push(country);
      
      const query = queryParts.join(', ');
      const url = `${this.baseUrl}?format=json&q=${encodeURIComponent(query)}&limit=1`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent // Required by Nominatim policy
        }
      });

      if (!response.ok) {
        console.error('Geocoding API error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon)
        };
      }

      return null;
    } catch (error) {
      console.error('Geocoding error:', error.message);
      return null;
    }
  }

  /**
   * Batch geocode multiple locations with rate limiting
   * @param {Array} locations - Array of {city, region, country} objects
   * @returns {Promise<Array>} - Array of coordinates in same order
   */
  async batchGeocode(locations) {
    const results = [];
    
    for (const location of locations) {
      const coords = await this.getCoordinates(location.city, location.region, location.country);
      results.push(coords);
    }

    return results;
  }
}

module.exports = new GeocodingService();
