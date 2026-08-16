/**
 * Return the parent city name used by directory filters rather than a smaller
 * (or larger) administrative area returned by a geocoder. Coordinates and the
 * full label remain untouched, so an exact pin can still identify the
 * neighbourhood.
 *
 * OpenStreetMap/Geoapify sometimes classify cantonments as cities (for example
 * "Lahore Cantonment" or "Lahore Cantt") even though leads are indexed under
 * the parent city "Lahore". They equally often only tag the *district* or
 * *tehsil* ("Lahore District", "Lahore Tehsil"). Removing that administrative
 * suffix makes the saved profile value match the city facet, which is what the
 * directory's default city filter is looked up against.
 */

// Administrative suffixes that wrap a city name. Ordered longest-first inside
// the alternation so "Cantonment Board" wins over a bare "Cantonment".
const ADMIN_SUFFIX = new RegExp(
  String.raw`[\s,-]+(?:` +
    [
      "cantonment board",
      "cantonment tehsil",
      "cantonment",
      "cantt\\.?",
      "cant\\.?",
      "municipal corporation",
      "metropolitan corporation",
      "city district",
      "district",
      "tehsil",
      "taluka",
      "division",
    ].join("|") +
    String.raw`)\s*$`,
  "i"
);

function canonicalCityName(value) {
  if (value === undefined || value === null) return null;
  const original = String(value).trim();
  if (!original) return null;

  // Strip repeatedly: "Lahore Cantonment Board" and "Lahore City District"
  // both collapse down to "Lahore".
  let parent = original;
  for (let i = 0; i < 3; i++) {
    const next = parent.replace(ADMIN_SUFFIX, "").trim();
    if (next === parent) break;
    parent = next;
  }

  return parent || original;
}

module.exports = { canonicalCityName };
