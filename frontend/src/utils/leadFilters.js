/**
 * Client-side mirror of the backend's category mapping + facet builder.
 *
 * The directory always renders from the API when the backend is reachable.
 * When it isn't (offline dev, empty database), the page falls back to the
 * bundled mock dataset — and these helpers make the *same* filters work
 * against that local data, so the UI never silently degrades.
 */

const CATEGORY_RULES = [
  // Order matters: the first matching rule wins, so the more specific
  // hospitality/education buckets are tested before the broad ones.
  ["Hospitality & Food", /travel|hospitalit|hotel|restaurant|\bfood\b|beverage|tourism|catering/i],
  ["Healthcare", /health|biotech|medical|pharma|clinic|hospital\b|hospitals|wellness|dental|care\b/i],
  ["Technology", /software|saas|cloud|devtool|information tech|\btech\b|artificial intelligence|machine learning|\bai\b|\bdata\b|cyber|telecom|semiconductor/i],
  ["Finance", /fintech|bank|financ|capital|equity|insur|invest|accounting|venture/i],
  ["Marketing & Media", /market|\bmedia\b|advertis|publish|broadcast|public relations|\bpr\b/i],
  ["Design & Creative", /design|creative|\bagency\b|\barts\b|photograph|architect|entertainment|music|film/i],
  ["Retail & E-commerce", /retail|commerce|consumer|\bshop|\bstore|fashion|apparel|grocer/i],
  ["Real Estate & Construction", /real estate|property|construct|realty|building/i],
  ["Education", /education|edtech|school|universit|training|academ|\bcollege\b/i],
  ["Industrial & Logistics", /manufact|industrial|logistic|transport|energy|mining|automotive|agricultur|shipping|aerospace/i],
  ["Legal & Government", /legal|\blaw\b|attorney|government|public sector|nonprofit|\bngo\b|defense/i],
];

/** Map a free-text industry onto one of the broad directory categories. */
export function deriveCategory(industry) {
  const value = String(industry || "").trim();
  if (!value) return null;
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(value)) return category;
  }
  return "Professional Services";
}

/** A lead's category — explicit column first, derived from industry otherwise. */
export function categoryOf(lead = {}) {
  return lead.category || deriveCategory(lead.industry);
}

const norm = (value) => String(value ?? "").trim().toLowerCase();

/** Rough great-circle distance in metres (haversine) for the local "Near Me" fallback. */
export function distanceMeters(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad((b.lon ?? b.lng) - (a.lon ?? a.lng));
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Apply the full filter set to an in-memory lead array.
 * `filters` uses the same shape the DirectoryPage keeps in state.
 */
export function applyLocalFilters(leads, filters = {}) {
  const {
    q = "",
    category = "",
    industry = "",
    countryName = "",
    regionName = "",
    cityName = "",
    verified = false,
    geo = null,
    radius = 50000,
  } = filters;

  let list = [...leads];

  const term = q.trim().toLowerCase();
  if (term) {
    list = list.filter((l) =>
      [l.full_name, l.company_name, l.headline, l.job_title, l.industry, l.category]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(term))
    );
  }

  if (category) list = list.filter((l) => norm(categoryOf(l)) === norm(category));
  if (industry) list = list.filter((l) => norm(l.industry) === norm(industry));
  if (countryName) list = list.filter((l) => norm(l.country_name) === norm(countryName));
  if (regionName) list = list.filter((l) => norm(l.region_name) === norm(regionName));
  if (cityName) list = list.filter((l) => norm(l.city_name) === norm(cityName));
  if (verified) list = list.filter((l) => l.is_verified);

  if (geo && (geo.lat || geo.lat === 0)) {
    list = list
      .map((l) => {
        const d =
          l.lat != null && (l.lon != null || l.lng != null)
            ? distanceMeters(geo, { lat: l.lat, lon: l.lon ?? l.lng })
            : l.distance ?? null;
        return d == null ? l : { ...l, distance: d };
      })
      .filter((l) => l.distance == null || l.distance <= radius);
  }

  return list;
}

function countBy(leads, keyFn) {
  const map = new Map();
  leads.forEach((lead) => {
    const value = keyFn(lead);
    if (!value) return;
    map.set(value, (map.get(value) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count, id: value }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

/**
 * Build cascading facet lists from an in-memory dataset. Each dimension is
 * counted against the *other* active filters so selecting a category doesn't
 * make the category list itself collapse to a single entry.
 */
export function buildLocalFacets(leads, filters = {}) {
  const without = (...keys) => {
    const next = { ...filters };
    keys.forEach((k) => {
      next[k] = k === "verified" ? false : "";
    });
    return applyLocalFilters(leads, next);
  };

  const scoped = applyLocalFilters(leads, filters);

  return {
    categories: countBy(without("category", "industry"), categoryOf),
    industries: countBy(without("industry"), (l) => l.industry),
    countries: countBy(without("countryName", "regionName", "cityName"), (l) => l.country_name),
    regions: filters.countryName
      ? countBy(without("regionName", "cityName"), (l) => l.region_name)
      : [],
    cities: filters.countryName ? countBy(without("cityName"), (l) => l.city_name) : [],
    totals: {
      total: scoped.length,
      verified: scoped.filter((l) => l.is_verified).length,
    },
  };
}

/** Sort helper shared by the API and fallback paths. */
export function sortLeads(list, sortBy) {
  const sorted = [...list];
  sorted.sort((a, b) => {
    if (sortBy === "name") return (a.full_name || "").localeCompare(b.full_name || "");
    if (sortBy === "company") return (a.company_name || "").localeCompare(b.company_name || "");
    if (sortBy === "verified") return (b.is_verified ? 1 : 0) - (a.is_verified ? 1 : 0);
    if (sortBy === "distance") return (a.distance ?? Infinity) - (b.distance ?? Infinity);
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
  return sorted;
}

/** Human-readable distance for the "Near Me" badge. */
export function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}
