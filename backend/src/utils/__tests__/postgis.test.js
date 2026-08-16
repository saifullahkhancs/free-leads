/**
 * PostGIS detection must reflect the ACTUAL type of `leads.location`.
 *
 * Regression: the helper only asked "does the geography type exist?". A
 * database where PostGIS was installed *after* migration 002 ran still has a
 * TEXT `location` column. Every "Near Me" search then emitted
 * `ST_DWithin(l.location, ...)` against TEXT, PostgreSQL threw
 *   function st_dwithin(text, geography, numeric) does not exist
 * the whole /api/leads request 500'd, and the directory showed no leads — the
 * classic "Near Me finds nothing even though the coordinates are set" report.
 */
process.env.DATABASE_URL ||= "postgres://test/test";
process.env.JWT_ACCESS_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

let nextRow = {};
const fakeDb = {
  pool: { query: async () => ({ rows: [nextRow] }) },
  query: async () => ({ rows: [] }),
  withTransaction: async () => {},
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith("config/db")) return fakeDb;
  if (request.endsWith("config/redis")) return { redis: null };
  return originalLoad(request, parent, isMain);
};

const { hasPostGIS, resetPostGIS } = require("../postgis");

test("geography type + geography column => PostGIS path", async () => {
  resetPostGIS();
  nextRow = { has_type: true, location_udt: "geography" };
  assert.equal(await hasPostGIS(), true);
});

test("geography type present but location is still TEXT => portable path", async () => {
  resetPostGIS();
  nextRow = { has_type: true, location_udt: "text" };
  assert.equal(
    await hasPostGIS(),
    false,
    "a TEXT location column must never be queried with ST_DWithin"
  );
});

test("no PostGIS at all => portable path", async () => {
  resetPostGIS();
  nextRow = { has_type: false, location_udt: "text" };
  assert.equal(await hasPostGIS(), false);
});

test("missing location column => portable path", async () => {
  resetPostGIS();
  nextRow = { has_type: true, location_udt: null };
  assert.equal(await hasPostGIS(), false);
});

test("the answer is memoized until explicitly reset", async () => {
  resetPostGIS();
  nextRow = { has_type: true, location_udt: "geography" };
  assert.equal(await hasPostGIS(), true);
  nextRow = { has_type: false, location_udt: "text" };
  assert.equal(await hasPostGIS(), true, "cached");
  resetPostGIS();
  assert.equal(await hasPostGIS(), false);
});
