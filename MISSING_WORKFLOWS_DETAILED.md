# The 9 Missing Workflows — Detailed Explanation

Each section explains: **What it is** → **Why it matters** → **How the WP plugin did it**
→ **What's in the repo today** → **What building it would take**.

---

## 1. The Quota & Billing System (the #1 missing piece)

**What it is**
A freemium monetization layer. Every user belongs to a **plan** (`free` / `starter` /
`growth` / `pro`), each plan has **hard usage limits**, and a user can **pay** to move to
a higher plan. This is the commercial engine of the whole product — it's what makes the
business model work.

**Why it matters**
Without it, there is **no reason for anyone to pay**. A user can search and export as much
as they want for free, so nobody hits a paywall and the product earns nothing. In the WP
plugin this was the single most elaborate subsystem.

**How the WP plugin did it**
- **Plan config** (`flapp_get_plan_config`): hard-coded defaults + DB overrides:
  - `free`: 3 searches/day, 500 exports/day, max 500/export, format `[excel]`
  - `starter`: 20 searches/day, 50 exports/day, max 100/export, `[csv, excel]`
  - `growth`: 100 searches/day, 500 exports/day, max 500/export, `[csv, excel, pdf]`
  - `pro`: unlimited, max 5000/export, `[csv, excel, pdf, json]`
  - `-1` = unlimited. Prices overlaid from **live PayPal plan data**, cached 1h.
- **Subscription lifecycle** (`wp_ajax_flapp_create_subscription` / `_cancel` / `_upgrade`):
  the server whitelists the plan, validates the PayPal sub ID with a regex (SSRF guard),
  **fetches the real plan from PayPal server-side** and compares it against what the user
  claimed (stops "paid for Starter, told you it's Pro" tampering), and inserts the
  subscription as **`pending`**.
- **PayPal webhook** (`flapp_handle_paypal_webhook`): the **only** place a subscription
  becomes `active` — verifies PayPal's signature via the
  `verify-webhook-signature` endpoint, then handles `ACTIVATED`, `PAYMENT.COMPLETED`,
  `CANCELLED`, `EXPIRED`. A forged "I paid" POST can't activate anything because PayPal
  itself must vouch for the signature.
- **Atomic quota enforcement** (`flapp_check_and_increment_quota`): on each search/export
  it looks up the active plan, and for limited plans runs a transaction with
  `SELECT ... FOR UPDATE` to **row-lock the day's usage counter** and reject if it would
  exceed the limit — this prevents the classic TOCTOU race where two parallel requests
  both read `used=0`, both pass the check, and both double-spend the quota. Admins bypass
  limits. When rejected, it returns the **next plan** so the UI can show an upgrade prompt.

**What's in the repo today**
- **Nothing.** There are no `plans`, `subscriptions`, `payment_transactions`, or
  `usage_logs` tables (only 3 migrations exist: auth, leads, profile).
- No `GET /api/plans`, no `/api/billing/*` endpoints, no PayPal integration.
- `is_paid` in `leadController.js` is a fake: it just checks `roles.includes("admin")`
  or `"super_admin"` — it has nothing to do with an actual subscription. A paying regular
  `user` is still treated as free.
- The only usage guard is a Redis **request-rate limiter** (e.g. 100 req/min), which is a
  *request frequency* cap, not a *daily usage quota* — it resets every minute and isn't
  tied to any plan.

**What building it would take**
1. New migration `004_billing_usage.sql`: `plans`, `subscriptions`, `payment_transactions`,
   `usage_logs` (+ seed the 4 default plans).
2. `quotaService.js`: resolve active plan → enforce limits; per-user daily counter in
   Redis (`quota:{type}:{userId}:{yyyymmdd}`) + `usage_logs` rows.
3. Quota middleware wired into search/export/view routes.
4. PayPal subscription create/upgrade/cancel + webhook with signature verification.
5. `is_paid` becomes subscription-aware.
6. Billing page + plan-picker UI on the frontend.

---

## 2. Server-Side, Gated Export

**What it is**
CSV/Excel/PDF/JSON export of lead lists, generated **on the server**, protected by login +
per-user throttle + format whitelist + per-plan quota + row caps + an audit trail.

**Why it matters**
Export is the main way a paying user gets value out, and simultaneously the main way an
attacker can **walk out your entire dataset** in one sweep. If it's not gated and not
audited, your core asset leaks for free.

**How the WP plugin did it** (`wp_ajax_flapp_export`)
- Login + per-user throttle (10 exports/min).
- Format validated against a hard whitelist **then** against the plan's allowed formats
  (free tier only gets `excel`).
- Row count clamped to the plan's `max_export_per_req`.
- **Large exports** (>1000 rows): check+increment quota up front, issue a short-lived
  nonce-token download URL, then **stream the CSV server-side in 1000-row chunks** — peak
  PHP memory stays ~200KB regardless of size.
- **Small exports** (≤1000 rows): run inline, hydrate, then check+increment quota for the
  **actual** row count returned (a request for 500 that only matches 80 rows only costs 80).
- Format handlers: `flapp_to_csv`, `flapp_to_xlsx` (hand-built, no library), PDF; JSON
  returned raw.
- Every export is rate-limited and quota-checked server-side.

**What's in the repo today — this is the worst gap**
- The backend `exportLeads` endpoint **exists** but is trivial: it checks only the role-
  based `is_paid`, then does `getLeads({ ...filters, limit: 10000 })` and builds the CSV
  **synchronously in memory**. No quota, no format whitelist, no throttle, no audit.
- **Critically, the frontend never even calls it.** `DirectoryPage.handleExport()` calls
  `exportLeadsToCsv()` in `savedLeads.js`, which builds the CSV **100% in the browser**
  from whatever rows are already on the screen. So the export path completely bypasses the
  server: no auth enforcement at the data level, no quota, no logging. Any logged-in user
  can export whatever results they can see, regardless of plan.

**What building it would take**
1. Rework `POST /api/leads/export`: enforce auth + per-user throttle + plan format +
   quota + row cap.
2. For large exports, stream in batches (Postgres cursor / `COPY`) instead of loading 10k
   rows into memory; return a download URL or stream directly.
3. Write an `export` row to `usage_logs` / audit for every export.
4. **Rewrite the frontend export button** to call the server endpoint instead of building
   the CSV client-side.

---

## 3. The Dedup Engine

**What it is**
Duplicate detection so the same business/lead isn't stored twice across the whole dataset
or across repeated file imports.

**Why it matters**
Duplicate leads poison search results, inflate "lead count" marketing claims, and waste
export quota on the same record twice. At the 5M–60M row scale the WP plugin targeted, you
cannot dedup in a PHP loop — it has to happen in SQL and at import time.

**How the WP plugin did it**
- **At import** (`flapp_import_lead_batch`): computes a `SHA1(lowercase(email))` hash per
  row (rows with no email get a **random** hash so they're never treated as duplicates of
  each other), then **one query** checks which hashes already exist in the global
  `flapp_lead_hashes` table; existing ones are skipped. New hashes are recorded in one
  multi-row insert.
- **As an admin tool** (`wp_ajax_freeleads_run_dedup`): a pure-SQL self-join groups rows
  by a chosen hash combination (`email_hash`/`phone_hash`/`website_hash`/`biz_hash`),
  picks `MIN(id)` as the "keeper", and flags/deletes the rest in batches of 2000 with a
  `usleep` between batches to avoid long table locks. Modes: `preview`, `mark`, `delete`.
- The freeLeads.site manager used a **stronger** scheme: 4-field SHA-256 fingerprints
  (email/phone/website/business name) via `find_duplicate_flexible()`.

**What's in the repo today**
- **Nothing.** The `leads` table has no hash columns and no `lead_hashes` table.
- `importLeadsCsv` inserts everything from a CSV with **no dedup** — importing the same
  file twice creates duplicates.
- No admin dedup tool.

**What building it would take**
1. Add hash columns to `leads` (`email_hash CHAR(40)` etc.) + a global `lead_hashes` table.
2. In `importLeadsCsv`, compute hashes, pre-check against `lead_hashes`, skip existing
   (with `skip: N` in the result).
3. Optionally add a `POST /api/admin/leads/dedup` endpoint (preview/mark/delete) mirroring
   the SQL self-join approach.

---

## 4. External Ingest REST API (machine-to-machine)

**What it is**
An authenticated endpoint that lets an **external system** (a scraper, another server, an
internal pipeline) push leads straight into the database, bypassing the admin UI entirely.

**Why it matters**
This is how the dataset is meant to grow at scale without a human manually uploading files.
But an open ingest endpoint is a hole anyone can use to flood your DB with garbage, so it
needs real authentication.

**How the WP plugin did it** (`POST /wp-json/freeleads/v4/ingest`) — a 4-layer security stack:
1. **rest_permission** — optional IP whitelist, optional forced-HTTPS, then a Bearer token
   compared with `hash_equals()` (constant-time, no timing leaks).
2. **Timestamp freshness** — rejects the request if the client's timestamp is outside a
   small window of server time (limits replay).
3. **Nonce replay protection** — each request has a unique nonce, hashed and stored in a
   used-nonce table, so the exact same signed request can't be replayed even inside the
   timestamp window.
4. **HMAC-SHA256 signature** — `hash_hmac('sha256', json_encode([timestamp, nonce, body]),
   hmac_secret)` must match the client-supplied signature, checked with `hash_equals()`.
   Then it iterates the payload, auto-detects country from state, computes the dedup
   hashes, and inserts non-duplicates in a single transaction.

**What's in the repo today**
- **Nothing.** There's an authenticated admin *CSV-text* import, but no machine-to-machine
  API. No Bearer/API-key auth with `hash_equals`, no timestamp/nonce/HMAC layer.
- The `leads.source` column exists (`csv_upload`/`manual`) but there's no external pipeline
  hitting it.

**What building it would take**
1. New route `POST /api/leads/ingest` with an API-key/token auth middleware using
   constant-time comparison.
2. Implement timestamp freshness + nonce replay (Redis for the used-nonce set) + HMAC
   signature verification.
3. Reuse the existing geo-mapping + batch insert; optionally the dedup hashes from #3.

---

## 5. Google OAuth Login

**What it is**
"Sign in with Google." Instead of (or in addition to) username/password, users log in via
their Google account, and a Google account can be **auto-provisioned** (an account is
created for them on first login without them ever setting a password).

**Why it matters**
Reduces signup friction (bigger conversion), and it's a feature the WP plugin already had —
its absence means a UX regression versus the previous product.

**How the WP plugin did it** (`flapp_get_google_auth_url` → `flapp_handle_google_callback`)
1. Builds the Google consent URL using a WP nonce as the OAuth `state` param (CSRF defense).
2. User approves on Google; Google redirects back with `?code=...&state=...`.
3. Re-verifies the `state` nonce — reject 400 if invalid (blocks OAuth CSRF).
4. Exchanges the code for a token via a **server-side** POST to
   `https://oauth2.googleapis.com/token` (client secret never touches the browser).
5. Fetches the user's `sub/email/name` from `https://www.googleapis.com/oauth2/v3/userinfo`.
6. If no WP user matches the email, creates one with a random 24-char password (never used;
   they always log in via Google).
7. Stores `flapp_google_id` user-meta to link the accounts for future logins.
8. Logs them in and redirects to the app.

**What's in the repo today**
- **Nothing.** Auth is email + password + verification code only. No Google OAuth, no
  `state` nonce, no auto-provisioning, no `google_id` linking.

**What building it would take**
1. Google OAuth client in the backend (obtain `client_id`/`client_secret`, exchange code,
   verify id_token) + a `google_id` column on `users`.
2. `/api/auth/google` start + `/api/auth/google/callback` endpoints; store the `state`
   (e.g. in Redis) and verify it on callback.
3. Frontend "Continue with Google" button that triggers the flow.

---

## 6. Working Audit Log

**What it is**
A persistent, written audit trail of security-relevant events: logins, failed logins,
registrations, OAuth logins, password resets, exports, role changes.

**Why it matters**
Without it you can't detect account compromise, brute-force campaigns, or data exfiltration
after the fact, and you can't satisfy compliance/forensic requirements.

**How the WP plugin did it**
`flapp_audit_log(...)` is called explicitly at each event: `register_ok`, `login_fail`,
`login_ok`, `google_login_ok`. (It's written on the FreeLeads Pro side; the manager plugin
is less consistent.)

**What's in the repo today**
- **A dead table.** Migration `001` creates `audit_logs` (actor_id, action, entity_type,
  entity_id, metadata, ip_address, created_at), but **no code anywhere inserts into it**.
  A grep for `INSERT INTO audit_logs` returns nothing. So the table exists but records
  zero events.

**What building it would take**
1. An `auditService.log(action, meta)` helper.
2. Call it from the auth flow (login ok/fail, register, verify, forgot, reset), the export
   flow, and the admin role/active changes.
3. Optionally a `GET /api/admin/audit-logs` endpoint (the dev doc even lists this).

---

## 7. No-Enumeration Forgot-Password

**What it is**
Making the "forgot password" flow behave identically whether or not the email exists, so an
attacker can't use it to discover which accounts exist.

**Why it matters**
Account enumeration feeds phishing, credential-stuffing lists, and targeted attacks.
The WP plugin deliberately went out of its way to prevent this.

**How the WP plugin did it**
`flapp_process_forgot()` calls `flapp_record_failure('forgot', $ip)` on **every** attempt
regardless of whether the account exists, then `retrieve_password()` — it returns the same
outcome either way, so response timing/behavior can't reveal existence. (It also makes
forgot a brute-force target, hence the lockout.)

**What's in the repo today — a regression**
- `forgotPassword()` in `authService.js` does `findUserByEmail(email)` and throws
  `ApiError(404, "User not found")` when the account doesn't exist. That's a clear
  **"this email is not registered"** signal — the exact leak the WP plugin prevented.
  (Resend-verification has the same pattern with 404.)

**What building it would take**
- Return a generic success message ("If that email exists, a reset link was sent") for both
  cases, and only send an email / reset token when the user actually exists. Optionally
  also write the failure/rate-limit regardless of existence.

---

## 8. Per-User Escalating Lockout

**What it is**
Anti-brute-force protection that (a) tracks failures **per user** (not just per IP) and
(b) **escalates** the lockout duration on repeat offenses: 15 min → 1 hour → 24 hours.

**Why it matters**
A fixed rate limit is easy to pace around. Escalating, per-account lockout makes repeated
guessing impractical and protects a specific account even when attacks come from many
different IPs.

**How the WP plugin did it**
- `flapp_record_failure` / `flapp_check_lockout` keep transient-based per-IP, per-action
  counters (`login`/`register`/`forgot`).
- `FLAPP_LOCK_TIERS = [900, 3600, 86400]` — repeat lockouts escalate 15m → 1h → 24h.
- `FLAPP_RATE_WINDOW = 900s`, `FLAPP_RATE_MAX = 5`.
- Separately, `flapp_throttle_user(user_id, action, max_per_minute)` throttles a **logged-in
  user** on search (30/min) and export (10/min) — stopping one account from hammering the
  API even when authenticated.

**What's in the repo today**
- Fixed Redis `express-rate-limit` windows per route (register 5/min, login 10/min, verify
  10, resend 3, forgot 5, reset 5) + a global limiter. These are per-IP-ish and **fixed** —
  no escalation tiers, no per-user throttle, no lockout wait-time message (just generic 429).

**What building it would take**
1. A lockout service on top of Redis storing failure counts per user/IP per action, with
   the escalating tier logic and remaining-wait-time in the response.
2. A per-user throttle for search/export keyed on `userId` (not IP), e.g. 30/min search.

---

## 9. Lead Data Model Mismatch (Businesses vs. People)

**What it is**
The two products model **different entities**. The WP plugins store **businesses**
(`business_name`, `owner_name`, `phone`, `email`, `website`, `revenue`, `num_employees`,
`category`, `state`, ...). The current repo stores **people / professionals** (`full_name`,
`headline`, `about`, `linkedin_url`, `twitter_url`, `job_title`, `company_name`, `industry`).

**Why it matters**
This isn't a "missing feature" — it's a **fundamental schema difference**, so the two are
not drop-in compatible. All the WP features (category hierarchy, has-email/has-phone
quality flags, sharding by category, phone-based dedup) are shaped around the business
model and don't map 1:1 onto the person model.

**How the WP plugin did it**
- Normalized lookup tables: `flapp_categories`, `flapp_industries`, `flapp_countries`,
  `flapp_states`, `flapp_cities` each store the string once; `fld_leads` stores only a
  `SMALLINT UNSIGNED id` per dimension (≈86% smaller than VARCHAR-per-field at 6M rows).
- Denormalized `has_email`/`has_phone` TINYINT flags so `ORDER BY` can use a covering index.
- `PARTITION BY HASH(id) PARTITIONS 16` and optional logical sharding
  (`category_id % shard_count` across separate DBs via raw PDO).
- `ROW_FORMAT=COMPRESSED`.

**What's in the repo today**
- `leads` is person-centric: `full_name`, `headline`, `about`, `email`, social URLs,
  `industry` (a free-text column, **not** a normalized category table), `company_name`,
  `job_title`, geo via `countries/regions/cities`.
- Geo hierarchy **is** normalized, but `industry` is free text, there's no `categories`
  table, no `has_email`/`has_phone` flags, no partitioning/sharding/compression.

**What it would take to reconcile**
- Decide the target model. If the product should sell **business** leads (matching the live
  WordPress site's "B2B leads" pitch), the `leads` schema needs a rework: add
  `business_name`, `owner_name`, `phone`, `revenue`, `num_employees`, a normalized
  `categories` table, and has-email/has-phone flags. This is a migration + service + UI
  change, not a small fix.
- If it stays person-focused, then several WP concepts (category sharding, phone dedup)
  simply don't apply.

---

## Quick reference

| # | Missing workflow | Severity | Current state |
|---|---|---|---|
| 1 | Quota & billing system | High (business model) | Nothing |
| 2 | Server-side gated export | High (revenue + data leak) | Endpoint trivial; frontend bypasses it |
| 3 | Dedup engine | High (data quality) | Nothing |
| 4 | External ingest API | Medium | Nothing |
| 5 | Google OAuth | Medium (UX regression) | Nothing |
| 6 | Working audit log | Medium (security) | Table exists, never written |
| 7 | No-enumeration forgot-password | Medium (security) | Leaks account existence |
| 8 | Per-user escalating lockout | Medium (security) | Fixed rate limits only |
| 9 | Lead model (business vs person) | Architectural | Different schema |

**Highest-impact to build first:** #1 (quota/billing) and #2 (server-side export) — they're
the commercial core, and they're coupled (export must consume quota). #3 (dedup) and #6
(audit log) are the cheapest, highest-value quick wins. Want me to start implementing any
of them?
