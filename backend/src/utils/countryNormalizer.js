/**
 * countryNormalizer — maps the messy country strings that arrive in lead data
 * (CSV columns, ingest payloads, manual entry) onto canonical ISO 3166-1
 * alpha-2 codes, so "US", "usa", "U.S.A.", "United States", "America" and
 * "United States of America" all resolve to the SAME country row.
 *
 * Why this exists: lead imports previously matched countries by exact code or
 * exact name only. Anything else (e.g. "America") fell through to an INSERT
 * that either created a duplicate country row (code "AM") or — worse — hit
 * `ON CONFLICT (code) DO UPDATE SET name = ...` and RENAMED an existing
 * country (Armenia has code AM) to whatever the import said.
 *
 * Matching order used by GeoMapper:
 *   1. explicit ISO code (after cleaning: "u.s." -> "US")
 *   2. cleaned exact name -> alias table -> canonical code
 *   3. cleaned exact name -> existing row in the `countries` table
 *   4. last resort: insert with a collision-safe generated code, never
 *      renaming an existing country row.
 */

/** Lowercase, strip punctuation, collapse whitespace: "U.S.A." -> "u s a". */
function cleanName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip everything non-alphanumeric and uppercase: "u.s." -> "US". */
function cleanCode(code) {
  return String(code || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

/**
 * Common aliases -> canonical ISO alpha-2 code.
 * NOTE: cleanName() runs first, so periods/spaces/case are already handled;
 * write keys in cleaned form (lowercase, single spaces, no punctuation).
 */
const ALIASES = {
  // ---- US / America (the classic mess) ----
  "us": "US",
  "usa": "US",
  "u s": "US",
  "u s a": "US",
  "united states": "US",
  "united states of america": "US",
  "united states of america usa": "US",
  "the united states": "US",
  "the united states of america": "US",
  "america": "US",
  "us of a": "US",

  // ---- UK / Britain ----
  "uk": "GB",
  "u k": "GB",
  "united kingdom": "GB",
  "great britain": "GB",
  "britain": "GB",
  "england": "GB", // pragmatic for lead data: maps to the UK row
  "scotland": "GB",
  "wales": "GB",

  // ---- UAE ----
  "uae": "AE",
  "united arab emirates": "AE",
  "the uae": "AE",

  // ---- Pakistan ----
  "pakistan": "PK",

  // ---- Other frequent variants ----
  "russia": "RU",
  "russian federation": "RU",
  "south korea": "KR",
  "korea south": "KR",
  "republic of korea": "KR",
  "north korea": "KP",
  "korea north": "KP",
  "czech republic": "CZ",
  "czechia": "CZ",
  "holland": "NL",
  "the netherlands": "NL",
  "ivory coast": "CI",
  "cote d ivoire": "CI",
  "cape verde": "CV",
  "burma": "MM",
  "macedonia": "MK",
  "laos": "LA",
  "brunei": "BN",
  "tanzania": "TZ",
  "swaziland": "SZ",
  "moldova": "MD",
  "syria": "SY",
  "iran": "IR",
  "venezuela": "VE",
  "bolivia": "BO",
  "east timor": "TL",
  "palestine": "PS",
  "viet nam": "VN",
  "antigua": "AG",
  "dutch": "NL",
  "the bahamas": "BS",
  "gambia": "GM",
  "congo brazzaville": "CG",
  "congo kinshasa": "CD",
  "drc": "CD",
  "democratic republic of the congo": "CD",
};

/** Canonical display names for alias codes (fallback when the table isn't seeded). */
const CANONICAL_NAMES = {
  US: "United States of America",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
  PK: "Pakistan",
  RU: "Russia",
  KR: "South Korea",
  KP: "North Korea",
  CZ: "Czech Republic",
  NL: "Netherlands",
  CI: "Côte d'Ivoire",
  CV: "Cape Verde",
  MM: "Myanmar",
  MK: "Macedonia",
  LA: "Laos",
  BN: "Brunei",
  TZ: "Tanzania",
  SZ: "Eswatini",
  MD: "Moldova",
  SY: "Syria",
  IR: "Iran",
  VE: "Venezuela",
  BO: "Bolivia",
  TL: "Timor-Leste",
  PS: "Palestine",
  VN: "Vietnam",
  AG: "Antigua and Barbuda",
  BS: "Bahamas",
  GM: "Gambia",
  CG: "Congo",
  CD: "Democratic Republic of the Congo",
};

/**
 * Resolve a raw country name/code to a canonical ISO alpha-2 code.
 * @param {string} name  e.g. "America", "United States of America", "US"
 * @param {string} code  e.g. "US", "us", "u.s."
 * @returns {{ code: string } | null}
 */
function normalizeCountry(name, code) {
  // 1) Explicit code wins when it looks like an ISO alpha-2.
  const c = cleanCode(code);
  if (c && /^[A-Z]{2}$/.test(c)) return { code: c };

  const key = cleanName(name);
  if (!key) return null;

  // 2) Exact alias hit.
  if (ALIASES[key]) return { code: ALIASES[key] };

  // 3) Substring fallback for long, distinctive phrases only, so values like
  //    "United States of America (USA)" or "The United Kingdom of GB" still
  //    resolve, but short/ambiguous keys ("us", "england") can't false-match.
  for (const [alias, aliasCode] of Object.entries(ALIASES)) {
    if (
      alias.length >= 8 &&
      new RegExp(`(^| )${alias}( |$)`).test(key)
    ) {
      return { code: aliasCode };
    }
  }

  return null;
}

function canonicalName(code) {
  return CANONICAL_NAMES[cleanCode(code)] || null;
}

module.exports = { cleanName, cleanCode, normalizeCountry, canonicalName };
