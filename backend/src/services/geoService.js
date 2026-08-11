const env = require("../config/env");
const ApiError = require("../utils/ApiError");

/**
 * Free geocoding for the map location picker.
 *
 * Two providers, both free:
 *  - Geoapify   (default when GEOAPIFY_API_KEY is set) — 3,000 credits/day free,
 *                no per-second limit, needs a free API key from https://www.geoapify.com
 *  - Nominatim  (OpenStreetMap, no key needed) — public instance is rate limited
 *                to ~1 request/second, which is fine for interactive map picking.
 *
 * The proxy lives on the backend so the browser never talks to the provider
 * directly (avoids CORS, hides the API key, lets us set a proper User-Agent).
 */

const GEOAPIFY_URL = "https://api.geoapify.com/v1/geocode";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

function normalizeNominatim(place) {
  const a = place.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.county;
  const region = a.state || a.province || a.region || a.county;
  return {
    label: place.display_name,
    lat: parseFloat(place.lat),
    lng: parseFloat(place.lon),
    city: city || null,
    region: region || null,
    country: a.country || null,
    countryCode: (a.country_code || "").toUpperCase() || null,
  };
}

function normalizeGeoapify(feature) {
  const p = feature.properties || {};
  return {
    label: p.formatted || p.name_long || p.name || null,
    lat: typeof p.lat === "number" ? p.lat : parseFloat(p.lat),
    lng: typeof p.lon === "number" ? p.lon : parseFloat(p.lon),
    city: p.city || null,
    region: p.state || p.county || null,
    country: p.country || null,
    countryCode: (p.country_code || "").toUpperCase() || null,
  };
}

async function fetchJson(url, headers = {}) {
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  } catch (err) {
    throw new ApiError(502, "Geocoding service is unavailable, please try again");
  }
  if (!response.ok) {
    throw new ApiError(502, `Geocoding service error (${response.status})`);
  }
  return response.json();
}

/**
 * Forward geocoding / place autocomplete.
 * @param {string} q  free-text query, e.g. "Lahore" or "Gulberg, Lahore"
 */
async function search(q) {
  const query = String(q || "").trim();
  if (query.length < 2) return [];

  if (env.GEOAPIFY_API_KEY) {
    const url =
      `${GEOAPIFY_URL}/search?text=${encodeURIComponent(query)}` +
      `&apiKey=${encodeURIComponent(env.GEOAPIFY_API_KEY)}&limit=6&lang=${encodeURIComponent(env.GEO_RESULTS_LANGUAGE)}`;
    const data = await fetchJson(url);
    return (data.features || []).map(normalizeGeoapify).filter((r) => r.lat != null);
  }

  const url =
    `${NOMINATIM_URL}/search?q=${encodeURIComponent(query)}` +
    `&format=jsonv2&addressdetails=1&limit=6`;
  const data = await fetchJson(url, {
    "User-Agent": env.NOMINATIM_USER_AGENT,
    // Without an explicit accept-language, Nominatim returns names in the
    // *local* language of the place (Urdu for Pakistan). We force the
    // configured language (default "en") so city/region/label come back
    // in English where OSM has an English name.
    "Accept-Language": env.GEO_RESULTS_LANGUAGE,
    Accept: "application/json",
  });
  return (Array.isArray(data) ? data : []).map(normalizeNominatim);
}

/**
 * Reverse geocoding: coordinates -> city / region (province/state) / country.
 * @param {number} lat
 * @param {number} lng
 */
async function reverse(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(400, "Valid lat and lng are required");
  }

  if (env.GEOAPIFY_API_KEY) {
    const url =
      `${GEOAPIFY_URL}/reverse?lat=${lat}&lon=${lng}` +
      `&apiKey=${encodeURIComponent(env.GEOAPIFY_API_KEY)}&lang=${encodeURIComponent(env.GEO_RESULTS_LANGUAGE)}`;
    const data = await fetchJson(url);
    const feature = (data.features || [])[0];
    if (!feature) return { label: null, lat, lng, city: null, region: null, country: null, countryCode: null };
    return { ...normalizeGeoapify(feature), lat, lng };
  }

  const url =
    `${NOMINATIM_URL}/reverse?lat=${lat}&lon=${lng}` +
    `&format=jsonv2&addressdetails=1&zoom=12`;
  const data = await fetchJson(url, {
    "User-Agent": env.NOMINATIM_USER_AGENT,
    // Same as search: force English (or configured language) instead of the
    // place's local language.
    "Accept-Language": env.GEO_RESULTS_LANGUAGE,
    Accept: "application/json",
  });
  if (!data || data.error) {
    return { label: null, lat, lng, city: null, region: null, country: null, countryCode: null };
  }
  return { ...normalizeNominatim(data), lat, lng };
}

module.exports = { search, reverse };
