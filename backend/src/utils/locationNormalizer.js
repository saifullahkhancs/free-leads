/**
 * Return the parent city name used by directory filters rather than a smaller
 * administrative area returned by a geocoder. Coordinates and the full label
 * remain untouched, so an exact pin can still identify the neighbourhood.
 *
 * OpenStreetMap/Geoapify sometimes classify cantonments as cities (for example
 * "Lahore Cantonment" or "Lahore Cantt") even though leads are indexed under
 * the parent city "Lahore". Removing that administrative suffix makes the
 * saved profile value match the city facet.
 */
function canonicalCityName(value) {
  if (value === undefined || value === null) return null;
  const original = String(value).trim();
  if (!original) return null;

  const parent = original
    .replace(
      /\s+(?:cantonment|cantt?\.?)(?:\s+(?:board|tehsil))?\s*$/i,
      ""
    )
    .trim();

  return parent || original;
}

module.exports = { canonicalCityName };
