const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalCityName } = require("../../utils/locationNormalizer");

test("cantonment areas resolve to their parent city for directory filters", () => {
  assert.equal(canonicalCityName("Lahore Cantonment"), "Lahore");
  assert.equal(canonicalCityName("Lahore Cantt"), "Lahore");
  assert.equal(canonicalCityName("Lahore Cant"), "Lahore");
  assert.equal(canonicalCityName("Rawalpindi Cantonment Board"), "Rawalpindi");
  assert.equal(canonicalCityName("Sialkot Cantonment Tehsil"), "Sialkot");
});

test("normal city names are preserved", () => {
  assert.equal(canonicalCityName("Lahore"), "Lahore");
  assert.equal(canonicalCityName("New York City"), "New York City");
  assert.equal(canonicalCityName("  Karachi  "), "Karachi");
  assert.equal(canonicalCityName(null), null);
  assert.equal(canonicalCityName(""), null);
});
