/**
 * Regression tests for the lead search filters.
 *
 * These guard the bug where `/api/leads` threw
 * "TypeError: Assignment to constant variable" as soon as *any* filter was
 * applied (the pagination COUNT query declared `const countQuery` and then
 * appended to it with `+=`). The route 500'd, the directory silently fell back
 * to its bundled demo dataset, and so every filter — country, industry,
 * category, state, city, verified — looked like it did nothing.
 *
 * The database pool is stubbed, so this runs anywhere with no Postgres:
 *   node --test src/services/__tests__/
 */
process.env.DATABASE_URL ||= "postgres://test/test";
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const test = require("node:test");
const assert = require("node:assert");
const Module = require("module");

// ---------------------------------------------------------------------------
// Stub the pg pool + redis so the service can be exercised without any server.
// ---------------------------------------------------------------------------
const captured = [];
const fakeDb = {
  pool: {
    query: async (text, values) => {
      captured.push({ text: String(text).replace(/\s+/g, " ").trim(), values: values || [] });
      if (/COUNT\(\*\)::int AS total,/.test(text)) return { rows: [{ total: 0, verified: 0 }] };
      if (/COUNT\(\*\)::int AS total/.test(text)) return { rows: [{ total: 0 }] };
      return { rows: [] };
    },
  },
  query: async () => ({ rows: [] }),
  withTransaction: async () => {},
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith("config/db")) return fakeDb;
  if (request.endsWith("config/redis")) return { redis: null };
  return originalLoad(request, parent, isMain);
};

const leadService = require("../leadService");
const { setPostGIS } = require("../../utils/postgis");

/** Every `$n` referenced by the SQL must have a matching bound value. */
function assertPlaceholdersBound({ text, values }, label) {
  const refs = [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  const max = refs.length ? Math.max(...refs) : 0;
  assert.ok(
    max <= values.length,
    `${label}: SQL references $${max} but only ${values.length} value(s) bound\n${text}`
  );
  // No gaps either — an unbound middle placeholder is a silent filter drop.
  for (let i = 1; i <= max; i++) {
    assert.ok(refs.includes(i), `${label}: placeholder $${i} is never referenced\n${text}`);
  }
}

const rowQuery = () => captured.find((c) => /FROM leads l/.test(c.text) && /l\.full_name/.test(c.text));
const countQuery = () => captured.find((c) => /COUNT\(\*\)::int AS total(?!,)/.test(c.text));

async function runFilter(filters) {
  captured.length = 0;
  const result = await leadService.getLeads({ cursor: null, limit: 20, ...filters });
  return result;
}

// ---------------------------------------------------------------------------
// The core regression: a filtered search must not throw.
// ---------------------------------------------------------------------------
test("a filtered search does not throw (regression: const countQuery += )", async () => {
  // Each of these previously crashed with "Assignment to constant variable".
  const filterSets = [
    { country_id: 12 },
    { industry: "Software" },
    { category: "Technology" },
    { verified: true },
    { region_id: 3 },
    { city_id: 9 },
    { country_code: "US" },
    { country: "Pakistan" },
    { region: "Punjab" },
    { city: "Lahore" },
    { q: "acme" },
    { lat: 37.3, lon: -121.8, radius: 25000 },
    { country_id: 1, industry: "Software", category: "Technology", verified: true },
  ];

  for (const filters of filterSets) {
    await assert.doesNotReject(
      () => runFilter(filters),
      `getLeads should not throw for ${JSON.stringify(filters)}`
    );
  }
});

test("country filter is applied to both the row and count queries", async () => {
  await runFilter({ country_id: 12 });

  const rows = rowQuery();
  const count = countQuery();
  assert.ok(rows, "expected a row query");
  assert.ok(count, "expected a count query");

  assert.match(rows.text, /l\.country_id = \$\d+/);
  assert.match(count.text, /l\.country_id = \$\d+/);
  assert.ok(rows.values.includes(12));
  assert.ok(count.values.includes(12));
});

test("industry and category filters reach the SQL", async () => {
  await runFilter({ industry: "Software", category: "Technology" });

  const rows = rowQuery();
  assert.match(rows.text, /l\.industry = \$\d+/);
  assert.match(rows.text, /l\.category = \$\d+/);
  assert.ok(rows.values.includes("Software"));
  assert.ok(rows.values.includes("Technology"));

  const count = countQuery();
  assert.match(count.text, /l\.industry = \$\d+/);
  assert.match(count.text, /l\.category = \$\d+/);
});

test("name-based location filters are honoured when no id is known", async () => {
  await runFilter({ country_code: "us", region: "California", city: "San Jose" });

  const rows = rowQuery();
  assert.match(rows.text, /upper\(c\.code\) = upper\(\$\d+\)/);
  assert.match(rows.text, /lower\(r\.name\) = lower\(\$\d+\)/);
  assert.match(rows.text, /lower\(ci\.name\) = lower\(\$\d+\)/);
  assert.deepStrictEqual(rows.values.slice(0, 3), ["us", "California", "San Jose"]);
});

test("a country supplied only by name still filters", async () => {
  await runFilter({ country: "Pakistan" });
  const rows = rowQuery();
  assert.match(rows.text, /lower\(c\.name\) = lower\(\$\d+\)/);
  assert.ok(rows.values.includes("Pakistan"));
});

test("an id always wins over the name-based fallback", async () => {
  await runFilter({ country_id: 7, country_code: "US", country: "United States" });
  const rows = rowQuery();
  assert.match(rows.text, /l\.country_id = \$\d+/);
  assert.doesNotMatch(rows.text, /upper\(c\.code\)/);
  assert.doesNotMatch(rows.text, /lower\(c\.name\)/);
});

test("verified filter is applied without consuming a placeholder", async () => {
  await runFilter({ verified: true });
  const rows = rowQuery();
  assert.match(rows.text, /l\.is_verified = TRUE/);
});

test("every bound placeholder lines up in both queries, for all filter shapes", async () => {
  const shapes = [
    {},
    { country_id: 1 },
    { q: "acme", country_id: 1, industry: "Software", category: "Tech", verified: true },
    { country_code: "US", region: "California", city: "San Jose" },
    { lat: 37.3, lon: -121.8, radius: 25000 },
    { lat: 37.3, lon: -121.8, radius: 25000, country_id: 2, industry: "Software" },
    { q: "acme", offset: 40 },
    { category: "Finance", offset: 20, limit: 10 },
  ];

  for (const shape of shapes) {
    await runFilter(shape);
    const label = JSON.stringify(shape);
    for (const entry of captured) assertPlaceholdersBound(entry, label);
  }
});

test("Near Me works on plain PostgreSQL without referencing the geography type", async () => {
  setPostGIS(false);
  await runFilter({ lat: 37.3, lon: -121.8, radius: 25000, sort: "distance" });

  const rows = rowQuery();
  const count = countQuery();
  for (const entry of [rows, count]) {
    assert.doesNotMatch(entry.text, /geography|ST_DWithin|ST_Distance/i);
    assert.match(entry.text, /l\.lat IS NOT NULL AND l\.lon IS NOT NULL/);
    assert.match(entry.text, /ASIN/);
    assertPlaceholdersBound(entry, "plain PostgreSQL geo search");
  }
  assert.match(rows.text, /ORDER BY distance ASC/);
  assert.deepStrictEqual(rows.values.slice(0, 3), [-121.8, 37.3, 25000]);
  assert.deepStrictEqual(count.values, [-121.8, 37.3, 25000]);
});

test("Near Me keeps the indexed PostGIS query when geography is available", async () => {
  setPostGIS(true);
  try {
    await runFilter({ lat: 37.3, lon: -121.8, radius: 25000, sort: "distance" });

    const rows = rowQuery();
    const count = countQuery();
    assert.match(rows.text, /ST_Distance/);
    assert.match(count.text, /ST_DWithin/);
    assert.match(count.text, /::geography/);
    assertPlaceholdersBound(rows, "PostGIS row query");
    assertPlaceholdersBound(count, "PostGIS count query");
    assert.deepStrictEqual(count.values, [-121.8, 37.3, 25000]);
  } finally {
    setPostGIS(false);
  }
});

test("Near Me on PostGIS still matches leads whose coordinates live only in lat/lon", async () => {
  // Leads whose coordinates were written straight into lat/lon (direct SQL,
  // older imports before the location backfill) have a NULL geography column.
  // The radius search used to require `l.location IS NOT NULL`, which made
  // those leads invisible to every "Near Me" search on PostGIS installs.
  setPostGIS(true);
  try {
    await runFilter({ lat: 31.5497, lon: 74.3436, radius: 50000, sort: "distance" });

    for (const entry of [rowQuery(), countQuery()]) {
      // The WHERE clause must OR in a portable lat/lon (Haversine) test for
      // rows with a NULL geography column — beside the indexed ST_DWithin.
      assert.match(entry.text, /ST_DWithin/);
      assert.match(entry.text, /l\.location IS NULL/);
      assert.match(entry.text, /ASIN/);
      assertPlaceholdersBound(entry, "PostGIS geo fallback");
    }
    // The distance projection falls back to Haversine for NULL-location rows,
    // so "nearest first" sorting stays truthful for every lead.
    assert.match(rowQuery().text, /COALESCE\(\s*ST_Distance/);
  } finally {
    setPostGIS(false);
  }
});

// ---------------------------------------------------------------------------
// An empty radius search must explain itself.
// ---------------------------------------------------------------------------
test("an empty Near Me search reports the distance to the nearest matching lead", async () => {
  setPostGIS(false);
  captured.length = 0;
  const result = await leadService.getLeads({
    cursor: null,
    limit: 20,
    lat: 31.5497,
    lon: 74.3436,
    radius: 250000,
    sort: "distance",
  });

  assert.ok(result.geo, "an empty geo search must return a `geo` explanation");
  assert.equal(result.geo.radius, 250000);
  // The diagnostic query drops the radius restriction but keeps every other
  // filter, and measures the distance to the closest remaining lead.
  const diagnostic = captured.find((c) => /nearest_distance/.test(c.text));
  assert.ok(diagnostic, "expected a nearest-lead diagnostic query");
  assert.doesNotMatch(diagnostic.text, /<= \$\d+/, "the radius must not be applied");
  assert.match(diagnostic.text, /with_coordinates/);
  assertPlaceholdersBound(diagnostic, "geo diagnostic");
  assert.deepStrictEqual(diagnostic.values.slice(0, 2), [74.3436, 31.5497]);
});

test("the geo explanation keeps the other active filters", async () => {
  setPostGIS(false);
  captured.length = 0;
  await leadService.getLeads({
    cursor: null,
    limit: 20,
    lat: 31.5497,
    lon: 74.3436,
    radius: 50000,
    industry: "Textiles",
    country_id: 2,
  });

  const diagnostic = captured.find((c) => /nearest_distance/.test(c.text));
  assert.ok(diagnostic);
  assert.match(diagnostic.text, /l\.industry = \$\d+/);
  assert.match(diagnostic.text, /l\.country_id = \$\d+/);
  assert.ok(diagnostic.values.includes("Textiles"));
  assert.ok(diagnostic.values.includes(2));
});

test("a non-geo empty search does not run the geo diagnostic", async () => {
  captured.length = 0;
  const result = await leadService.getLeads({ cursor: null, limit: 20, industry: "Textiles" });
  assert.equal(result.geo, undefined);
  assert.equal(captured.find((c) => /nearest_distance/.test(c.text)), undefined);
});

test("default 'recent' sort orders by created_at, not insertion id", async () => {
  await runFilter({ sort: "recent" });
  assert.match(rowQuery().text, /ORDER BY l\.created_at DESC/);
});

test("offset paging still reports the unpaginated total", async () => {
  await runFilter({ offset: 40, limit: 20, country_id: 3 });
  const count = countQuery();
  assert.ok(count, "a COUNT query must run so the pager knows the total");
  assert.doesNotMatch(count.text, /OFFSET/);
  assert.doesNotMatch(count.text, /LIMIT/);
});

// ---------------------------------------------------------------------------
// Facets — the dropdown option lists must cascade.
// ---------------------------------------------------------------------------
test("facets cascade the state/city lists from a country given by name", async () => {
  captured.length = 0;
  await leadService.getFacets({ country: "Pakistan" });

  const regionFacet = captured.find((c) => /r\.id AS id/.test(c.text));
  const cityFacet = captured.find((c) => /ci\.id AS id/.test(c.text));

  assert.ok(regionFacet, "a region facet query should run for a named country");
  assert.ok(cityFacet, "a city facet query should run for a named country");
  assert.match(regionFacet.text, /lower\(c\.name\) = lower\(\$\d+\)/);
  assert.ok(regionFacet.values.includes("Pakistan"));
  for (const entry of captured) assertPlaceholdersBound(entry, "facets by country name");
});

test("facets return state/city options even without a country (filters enabled)", async () => {
  captured.length = 0;
  await leadService.getFacets({ category: "Technology" });

  const regionFacet = captured.find((c) => /r\.id AS id/.test(c.text));
  const cityFacet = captured.find((c) => /ci\.id AS id/.test(c.text));

  // The State and City filters must be usable on their own, so the facet
  // queries run globally when no country is selected. They stay scoped to the
  // other active filters (here: category).
  assert.ok(regionFacet, "a global region facet query should run");
  assert.ok(cityFacet, "a global city facet query should run");
  assert.match(regionFacet.text, /l\.category = \$1/);
  assert.match(cityFacet.text, /l\.category = \$1/);
});

test("the country facet list is not collapsed by the selected country", async () => {
  captured.length = 0;
  await leadService.getFacets({ country_id: 5, region_id: 2 });

  const countryFacet = captured.find((c) => /c\.id AS id/.test(c.text) && /AS code/.test(c.text));
  assert.ok(countryFacet);
  // It must not filter on the very dimension it is listing, otherwise the
  // dropdown would only ever show the already-selected country.
  assert.doesNotMatch(countryFacet.text, /l\.country_id = \$/);
  assert.doesNotMatch(countryFacet.text, /l\.region_id = \$/);
});
