const crypto = require("crypto");
const { query, withTransaction } = require("../config/db");
const env = require("../config/env");

/**
 * dedupService — duplicate detection translated from the WP plugins' SHA1
 * email-hash dedup (import) and the freeLeads.site Manager's pure-SQL dedup
 * engine (admin tool).
 *
 * Each lead gets 4 fingerprint hashes (email/phone/website/biz). Missing values
 * get a RANDOM hash so rows lacking that field are never treated as duplicates
 * of each other (same trick as flapp_import_lead_batch).
 */

function hashValue(value) {
  const algo = env.DEDUP_ALGORITHM === "sha256" ? "sha256" : "sha1";
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    // Random hash — never matches anything, so it never flags a duplicate.
    return crypto.createHash(algo).update(crypto.randomBytes(16)).digest("hex");
  }
  return crypto.createHash(algo).update(normalized).digest("hex");
}

/** Build the 4 fingerprint hashes for a lead row. */
function fingerprint(row) {
  return {
    email_hash: hashValue(row.email),
    phone_hash: hashValue(row.phone),
    website_hash: hashValue(row.website_url),
    biz_hash: hashValue(row.company_name || row.full_name),
  };
}

/**
 * Given an array of lead rows (each with email/phone/website_url/company_name),
 * return the ones that are NOT already present in the global lead_hashes table
 * (deduped across all history), plus the count of duplicates skipped.
 * `hashTypes` limits which fingerprints are checked (default all).
 */
async function filterDuplicates(
  rows,
  { hashTypes = ["email", "phone", "website", "biz"], seen = new Set() } = {}
) {
  if (!rows.length) return { survivors: rows, skipped: 0, fingerprints: [] };

  const fingerprints = rows.map((r) => fingerprint(r));
  // Collect candidate hashes for each type we care about.
  const candidateMap = {};
  for (const type of hashTypes) {
    candidateMap[type] = Array.from(new Set(fingerprints.map((f) => f[`${type}_hash`])));
  }

  // One query for all existing hashes across the requested types.
  const existing = new Set();
  const params = [];
  const clauses = [];
  for (const type of hashTypes) {
    if (candidateMap[type].length === 0) continue;
    params.push(type);
    params.push(candidateMap[type]);
    clauses.push(`(hash_type = $${params.length - 1} AND hash = ANY($${params.length}))`);
  }
  if (clauses.length) {
    const { rows: found } = await query(
      `SELECT hash_type, hash FROM lead_hashes WHERE ${clauses.join(" OR ")}`,
      params
    );
    for (const r of found) existing.add(`${r.hash_type}:${r.hash.trim()}`);
  }

  const survivors = [];
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const fp = fingerprints[i];
    const isDup = hashTypes.some(
      (t) =>
        fp[`${t}_hash`] &&
        (existing.has(`${t}:${fp[`${t}_hash`]}`) || seen.has(`${t}:${fp[`${t}_hash`]}`))
    );
    if (isDup) {
      skipped += 1;
    } else {
      survivors.push({ row: rows[i], fp });
      // Mark as seen for the rest of THIS call (cross-batch dedup within a file).
      for (const t of hashTypes) seen.add(`${t}:${fp[`${t}_hash`]}`);
    }
  }

  return {
    survivors: survivors.map((s) => s.row),
    skipped,
    fingerprints: survivors.map((s) => s.fp),
  };
}

/** Register newly inserted fingerprints in the global ledger. */
async function recordHashes(leadId, fp) {
  const entries = [
    ["email", fp.email_hash],
    ["phone", fp.phone_hash],
    ["website", fp.website_hash],
    ["biz", fp.biz_hash],
  ];
  for (const [type, hash] of entries) {
    await query(
      `INSERT INTO lead_hashes (hash, hash_type, lead_id) VALUES ($1, $2, $3)
       ON CONFLICT (hash_type, hash) DO NOTHING`,
      [hash, type, leadId]
    );
  }
}

/**
 * Admin dedup tool — pure-SQL self-join. Returns grouped duplicates.
 * @param {string[]} fields - subset of ['email','phone','website','biz']
 * @param {'preview'|'mark'|'delete'} mode
 */
async function runDedup(fields, mode = "preview") {
  const hashCols = fields.map((f) => `${f}_hash`);
  const colList = hashCols.join(", ");
  const colText = hashCols.join("', '");
  // Group by the chosen hash combination; keeper = MIN(id); others are dups.
  const sql = `
    WITH grp AS (
      SELECT ${colList}, MIN(id) AS keeper
      FROM leads
      WHERE ${hashCols.map((c) => `${c} IS NOT NULL AND ${c} <> ''`).join(" AND ")}
      GROUP BY ${colList}
      HAVING COUNT(*) > 1
    )
    SELECT l.id, l.email, l.phone, l.website_url, l.company_name, l.full_name,
           g.keeper, ${colList}
    FROM leads l
    JOIN grp g
      ON ${hashCols.map((c) => `l.${c} = g.${c}`).join(" AND ")}
    WHERE l.id <> g.keeper
    ORDER BY l.created_at DESC
  `;

  const { rows } = await query(sql);
  const byGroup = new Map();
  for (const r of rows) {
    const key = hashCols.map((c) => r[c]).join("|");
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(r);
  }

  if (mode === "preview") {
    return { groups: byGroup.size, duplicates: rows.length, samples: rows.slice(0, 10) };
  }

  const loserIds = rows.map((r) => r.id);
  if (loserIds.length === 0) return { groups: 0, duplicates: 0, affected: 0, mode };

  // Batched to avoid long locks on a large table.
  let affected = 0;
  const BATCH = 2000;
  for (let i = 0; i < loserIds.length; i += BATCH) {
    const chunk = loserIds.slice(i, i + BATCH);
    if (mode === "delete") {
      await query(`DELETE FROM leads WHERE id = ANY($1)`, [chunk]);
    } else {
      // mark
      await query(`UPDATE leads SET is_duplicate = TRUE WHERE id = ANY($1)`, [chunk]);
    }
    affected += chunk.length;
  }

  return { groups: byGroup.size, duplicates: rows.length, affected, mode };
}

module.exports = {
  hashValue,
  fingerprint,
  filterDuplicates,
  recordHashes,
  runDedup,
};
