const crypto = require("crypto");
const { query, withTransaction } = require("../config/db");
const env = require("../config/env");

/**
 * dedupService — Uniqueness filter and duplicate detection.
 * Standard uniqueness rule: (full_name + email) must be unique.
 */

function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

function hashValue(value) {
  const algo = env.DEDUP_ALGORITHM === "sha256" ? "sha256" : "sha1";
  const norm = normalize(value);
  if (!norm) {
    // Random hash — never matches anything, so it never flags a duplicate.
    return crypto.createHash(algo).update(crypto.randomBytes(16)).digest("hex");
  }
  return crypto.createHash(algo).update(norm).digest("hex");
}

/** Build standard fingerprint hashes for a lead row. */
function fingerprint(row) {
  return {
    email_hash: hashValue(row.email),
    phone_hash: hashValue(row.phone),
    website_hash: hashValue(row.website_url),
    biz_hash: hashValue(row.company_name || row.full_name),
  };
}

/**
 * Generate composite uniqueness key: (full_name + email).
 * Both must be non-empty strings.
 */
function getUniquenessKey(row) {
  const name = normalize(row.full_name);
  const email = normalize(row.email);
  if (!name || !email) return null;
  return `${name}::${email}`;
}

/**
 * Filter duplicates during batch/stream ingestion based strictly on (full_name + email).
 * Only checks these two fields together.
 *
 * @param {Array} rows - array of raw lead objects
 * @param {Object} options - { seen: Set } in-memory cache of seen keys across the upload
 * @returns { survivors, skipped, fingerprints }
 */
async function filterDuplicates(rows, { seen = new Set() } = {}) {
  if (!rows.length) return { survivors: rows, skipped: 0, fingerprints: [] };

  const survivors = [];
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = getUniquenessKey(row);

    if (key && seen.has(key)) {
      skipped += 1;
    } else {
      if (key) seen.add(key);
      survivors.push({ row, fp: fingerprint(row) });
    }
  }

  return {
    survivors: survivors.map((s) => s.row),
    skipped,
    fingerprints: survivors.map((s) => s.fp),
  };
}

/** Register newly inserted fingerprints in the global ledger (stubbed for future). */
async function recordHashes(leadId, fp) {
  return;
}

/**
 * Admin dedup tool — finds duplicate leads grouped by (full_name + email).
 * @param {string[]} fields - list of fields to group by (defaults to full_name + email)
 * @param {'preview'|'mark'|'delete'} mode
 */
async function runDedup(fields = ["full_name", "email"], mode = "preview") {
  const sql = `
    WITH grp AS (
      SELECT lower(trim(full_name)) AS norm_name,
             lower(trim(email)) AS norm_email,
             MIN(id) AS keeper
      FROM leads
      WHERE full_name IS NOT NULL AND trim(full_name) <> ''
        AND email IS NOT NULL AND trim(email) <> ''
      GROUP BY lower(trim(full_name)), lower(trim(email))
      HAVING COUNT(*) > 1
    )
    SELECT l.id, l.email, l.phone, l.website_url, l.company_name, l.full_name,
           g.keeper
    FROM leads l
    JOIN grp g
      ON lower(trim(l.full_name)) = g.norm_name
     AND lower(trim(l.email)) = g.norm_email
    WHERE l.id <> g.keeper
    ORDER BY l.created_at DESC
  `;

  const { rows } = await query(sql);
  const byGroup = new Map();
  for (const r of rows) {
    const key = `${normalize(r.full_name)}::${normalize(r.email)}`;
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
      await query(`UPDATE leads SET is_duplicate = TRUE WHERE id = ANY($1)`, [chunk]);
    }
    affected += chunk.length;
  }

  return { groups: byGroup.size, duplicates: rows.length, affected, mode };
}

module.exports = {
  normalize,
  hashValue,
  fingerprint,
  getUniquenessKey,
  filterDuplicates,
  recordHashes,
  runDedup,
};
