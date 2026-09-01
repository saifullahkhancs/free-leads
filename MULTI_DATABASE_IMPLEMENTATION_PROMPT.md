# Copy/Paste Implementation Prompt: FreeLeads Multi-Database Leads Split

> Use this prompt only after approving `MULTI_DATABASE_LEADS_ARCHITECTURE_PLAN.md`. It is an implementation brief for a coding agent. It is intentionally explicit so the work can be executed in stages and reviewed safely.

---

## Role and objective

You are implementing the approved multi-database architecture in the existing `saifullahkhancs/free-leads` repository.

The objective is to:

1. Keep users, authentication, roles, billing, subscriptions, durable quotas, usage, audit, contact, and CMS data in the **main PostgreSQL database**.
2. Move leads plus `categories`, `industries`, `countries`, `regions`, and `cities` to a separate **leads PostgreSQL database**.
3. Support an initial dataset of approximately **7,000,000 leads**.
4. Add a separate **leads Redis** for lead-result, default-page, facet, pagination, and lead-detail caching.
5. Keep control Redis separate for auth/rate-limit/control-plane state.
6. Make migrations explicitly target `main` or `leads`, with independent migration histories and status output.
7. Preserve existing users and billing data. Do not silently delete existing lead data before the new store is validated.

Do not switch branches. Do not ask for credentials. Do not put secrets in source control.

---

## Repository facts to respect

The current backend is Node.js/CommonJS/Express with `pg` and `ioredis`.

Important current files:

- `backend/src/config/db.js` — one shared PostgreSQL pool
- `backend/src/config/redis.js` — one Redis connection
- `backend/src/db/migrate.js` — one migration directory and one `schema_migrations` table
- `backend/src/services/leadService.js` — lead search, facets, CRUD, import, export, stats, geocoding
- `backend/src/utils/GeoMapper.js` — current geo lookup uses the shared DB pool
- `backend/src/services/dedupService.js` — current lead dedup and admin dedup
- `backend/src/services/quotaService.js` — plan lookup and Redis quota counter
- `backend/src/services/auditService.js` — audit writes
- `backend/src/services/authService.js` — user/auth writes and reads
- `backend/src/controllers/adminController.js` — direct admin queries against lead and non-lead tables
- `backend/src/routes/leadRoutes.js` — lead search/detail/export/import routes

The current migration folder mixes auth, leads, geo, billing, and CMS migrations. Existing applied migrations must not be edited or replayed against the wrong database.

---

## Non-negotiable architecture rules

### Database ownership

**Main database only:**

- users and user profile/interests
- roles, permissions, role mappings
- refresh/password-reset/verification state
- plans, subscriptions, payment transactions
- durable daily quota counters and usage logs
- API keys and audit logs
- contact messages and blog posts
- non-secret lead-store routing metadata

**Leads database only:**

- leads
- categories
- industries
- countries
- regions
- cities
- lead-only identity/dedup constraints
- lead import metadata or lead aggregates if needed

There must be no SQL join between databases. There must be no PostgreSQL foreign key from the main database into a leads database.

### Pools

Create named pools, for example:

```js
mainPool
leadsPool
```

Expose explicit helpers such as `mainQuery`, `leadsQuery`, `withMainTransaction`, and `withLeadsTransaction`, or an equally clear equivalent.

Every service must use the correct pool. Do not retain a vague shared `query()` helper for code where ownership is ambiguous.

### Lead identity

Use:

- local `BIGINT id` for internal ordering/keyset pagination;
- `UUID lead_ref` as the public/global lead identifier;
- `lead_store_key` such as `leads-primary` wherever a lead reference crosses into the main database or cache.

The API should move toward `/api/leads/:lead_ref` rather than exposing an ambiguous local numeric ID. If backward compatibility is required during the transition, support numeric IDs only behind the single `leads-primary` store and document the compatibility behavior.

### Taxonomy

Replace repeated text dimensions on `leads` with IDs:

```text
category_id
industry_id
country_id
region_id
city_id
```

The dimension tables and all indexes belong to the leads database. The main database must not have foreign keys for those values. User profile location and interests may remain strings in the main database; resolve them against the leads taxonomy at query time.

### Quota authority

Plan definitions, subscriptions, durable quota state, and usage logs belong to the main database.

Implement an atomic `daily_usage` design. Recommended fields:

```text
user_id
usage_date
search_requests
lead_views
export_rows
updated_at
```

Recommended units:

- one accepted search request = one search unit;
- one accepted detail request = one lead-view unit;
- export usage = rows reserved/returned, capped by `max_export_per_req`.

Do not rely on a Redis counter as the only durable quota source. Control Redis can remain responsible for rate limiting, refresh revocation, OAuth state, lockouts, and similar ephemeral control functions.

### Leads Redis authority

Leads Redis is a cache only. A cache miss or outage must fall back to the leads database. It must never decide authorization, quota, or field visibility.

---

## Required implementation stages

Implement in small, reviewable stages. After each stage, run the relevant tests and report changed files.

### Stage 1 — Configuration and connection layer

Add environment variables:

```text
MAIN_DATABASE_URL
LEADS_DATABASE_URL
REDIS_URL
LEADS_REDIS_URL
LEADS_CACHE_ENABLED
LEADS_CACHE_DEFAULT_TTL_SECONDS
LEADS_CACHE_SEARCH_TTL_SECONDS
LEADS_CACHE_DETAIL_TTL_SECONDS
LEADS_CACHE_FACETS_TTL_SECONDS
```

Keep a temporary backward-compatible fallback where `MAIN_DATABASE_URL` defaults to the existing `DATABASE_URL`, but emit a clear warning that the fallback is transitional.

Create:

- main PostgreSQL pool
- leads PostgreSQL pool
- control Redis connection
- leads-cache Redis connection
- separate health checks and graceful shutdown for all connections

A leads-cache Redis connection failure must not stop the API from serving lead reads. A main or leads database failure should be visible in health checks.

Add package scripts:

```text
npm run migrate:main
npm run migrate:leads
npm run migrate:all
npm run migrate:status
```

Do not remove the old scripts until the new behavior is verified.

### Stage 2 — Target-specific migration runner

Refactor migrations so every migration has a target:

```text
backend/src/db/migrations/main/*.sql
backend/src/db/migrations/leads/*.sql
```

Implement a runner that:

- accepts `main` or `leads` explicitly;
- connects only to that target;
- creates an independent migration-history table for that target;
- records version, filename, checksum, applied time, and duration;
- uses a PostgreSQL advisory lock per target;
- sorts migrations deterministically;
- refuses to run if an already-applied migration checksum changed;
- prints `[main]` or `[leads]` on every operation;
- rolls back a normal migration on failure;
- supports status output for both databases.

Use unique, unambiguous migration versions in the new scoped directories. Do not copy the current mixed migration directory into both targets.

For an existing installation, bootstrap a baseline for the already-applied legacy schema instead of replaying the old mixed migrations. Verify that the existing main database contains the expected auth/billing/CMS objects before marking the baseline.

Large `CREATE INDEX CONCURRENTLY` operations must not be placed in a transaction-wrapped startup migration. Provide a separately documented operational index-build command or step.

### Stage 3 — Main database migrations

Add forward-only main migrations that:

1. Create `lead_stores` with a non-secret store key, status, routing metadata, and timestamps.
2. Remove the foreign key from `usage_logs.lead_id` that points to the old local `leads` table.
3. Add `lead_store_key`, `lead_ref`, and optional `lead_local_id` to lead-related usage/audit references.
4. Create `daily_usage` with a safe primary key of `(user_id, usage_date)`.
5. Add indexes for user/date usage lookup and any idempotency/outbox records required for exact accounting.
6. Leave user profile location and interest fields in the main database without cross-database taxonomy FKs.

Do not drop old lead tables in this stage. They are the rollback reference until cutover is complete.

### Stage 4 — Leads database schema

Create leads-scoped migrations for:

- `categories`
- `industries`
- `countries`
- `regions`
- `cities`
- `leads`

Use PostGIS in the leads database. The production schema should use `GEOGRAPHY(POINT, 4326)` and a GiST index. Keep `lat`/`lon` with range checks for import/debugging.

Recommended lead columns include:

```text
id BIGINT identity/local key
lead_ref UUID unique public key
full_name
headline
about
email
phone
linkedin_url
twitter_url
facebook_url
website_url
category_id
industry_id
country_id
region_id
city_id
company_name
job_title
num_employees
lat
lon
location
source
is_verified
is_active
search_vector
created_at
updated_at
```

Use proper dimension constraints:

- country code unique;
- region unique within country after normalization;
- city unique within country/region after normalization, including a safe null-region rule;
- industry unique within category after normalization;
- category slug unique.

Enforce the current identity rule in the leads database. Add a stored normalized identity key for non-empty `full_name` plus non-empty `email`, then a partial unique index on that key. Keep the behavior that rows without an email do not collide unless the product owner changes the policy.

Use taxonomy IDs in `leads`; do not retain category/industry/country/region/city as unbounded repeated text fields unless a specific denormalized read field is justified and documented.

### Stage 5 — Seed and taxonomy mapping

Move the canonical category/industry definitions and location data to a leads-database seed path.

Requirements:

- seed operations must be idempotent;
- aliases such as country spelling variations must map to one canonical ISO country;
- do not silently rename an existing country because an input alias is malformed;
- validate city → region → country consistency;
- unknown taxonomy values must be reported or quarantined, not multiplied into near-duplicate dimension rows;
- `GeoMapper` must use `leadsPool` and must be safe for concurrent imports.

Do not load taxonomy from the main database.

### Stage 6 — Service and controller ownership refactor

Update every lead-related path to use the leads pool:

- search/list
- detail lookup
- facets
- admin lead list and lead stats
- lead create/update
- CSV import
- external ingest
- export query
- geocoding and geo mapping
- dedup preview/mark/delete
- landing coverage stats
- dashboard lead counts

Update every control-related path to use the main pool:

- auth
- user profile
- roles/permissions
- plans/subscriptions/payments
- quota
- usage logs
- audit logs
- contact and blog data

Search result joins to category/industry/country/region/city must happen entirely inside the leads database. If the request needs user plan information, fetch that from main separately and combine results in application memory.

Do not use mock or bundled frontend leads as a fallback when PostgreSQL fails.

### Stage 7 — Durable quota implementation

Update quota enforcement so concurrent requests cannot overspend the main-database plan limit.

Implement one of these safe patterns:

- atomic upsert/update with a limit predicate and `RETURNING`; or
- a transaction that locks the user/date row before checking and incrementing.

Make request retries/idempotency explicit. An export reservation should not be charged twice if the client retries the same request ID.

If the code reserves quota before querying leads and the leads query fails, release/compensate the reservation or record a failed attempt according to the chosen design. Do not permanently charge a failed database request without documenting that product behavior.

Write `usage_logs` in the main database. Store `lead_store_key`, `lead_ref`, and optionally `lead_local_id`; do not use a cross-database FK.

Keep Redis-based request throttling separate from durable daily quota accounting.

### Stage 8 — Leads Redis cache

Implement a dedicated cache module using `LEADS_REDIS_URL`.

Use canonical, versioned keys such as:

```text
leads-cache:v1:search:<hash>
leads-cache:v1:default:<cursor>:<limit>:<sort>
leads-cache:v1:facets:<hash>
leads-cache:v1:lead:<store-key>:<lead-ref>
leads-cache:v1:stats:<name>
```

The hash input must include every response-changing filter:

- normalized query
- taxonomy IDs
- verified/active state
- latitude/longitude/radius
- sort
- cursor
- limit
- dataset version
- visibility-safe scope if the cached response is already shaped

Prefer caching canonical server-side lead data and applying visibility masking after plan resolution. If shaped responses are cached, include a public/full entitlement class and test that a free user can never receive a full-contact cached object.

Use initial TTLs of approximately:

- default page: 60–300 seconds;
- search page: 30–120 seconds;
- facets: 5–15 minutes;
- detail: 5–15 minutes;
- stats: 1–5 minutes.

Add a dataset-version key. Increment it once after a successful bulk import and once per committed update/delete batch. Do not scan and delete every cache key.

Add stampede protection with a short-lived lock for hot keys. Cache errors must log metrics and fall back to the leads database.

Do not warm millions of detail keys. Warm only the default page, popular facets, and explicitly selected pages/details.

### Stage 9 — Pagination and expensive counts

Keep keyset pagination for the default stable ordering. Return `has_more` by requesting `limit + 1` rows. Do not rely on deep `OFFSET` pagination for the 7M dataset.

Review the current `COUNT(*)` behavior. Avoid an exact count on every page. Use one of:

- cached exact count;
- maintained dataset totals;
- an explicit count endpoint;
- `has_more` without total for ordinary pages.

Benchmark and optimize facet queries. Cache facet responses by canonical filter key and consider a maintained/materialized aggregate only if real query plans require it.

### Stage 10 — 7M import path

Implement a separate initial-load path suitable for approximately 7 million rows:

1. Freeze lead writes/imports during the initial load.
2. Load source rows into an unlogged/staging table with minimal indexes using PostgreSQL `COPY` or an equivalent streaming loader.
3. Normalize fields and map taxonomy IDs in bulk.
4. Remove duplicates in staging according to the strict name/email identity rule.
5. Insert valid rows into final `leads` in monitored batches.
6. Build large GIN/GiST/partial/composite indexes after the load, using concurrent builds when the database must stay available.
7. Run `ANALYZE` and validation queries.
8. Produce a load report with total rows, imported rows, duplicates, invalid rows, taxonomy misses, coordinate coverage, elapsed time, WAL/temporary usage, and final table/index sizes.

The existing per-row coordinate update and 1,000-row `UNNEST` importer can remain for small interactive imports, but it must not be described as the 7M initial-load strategy.

Add a dry-run mode and checkpoint/restart behavior. A failed chunk must not require restarting all 7 million rows.

### Stage 11 — Safe cutover

Provide an operational runbook:

1. Back up the current combined database.
2. Preserve the current users/billing data as the main database.
3. Provision an empty PostGIS leads database.
4. Run scoped migrations and seed taxonomy.
5. Load and validate 7M data.
6. Deploy the dual-pool application with the lead router disabled or in shadow mode.
7. Verify counts and representative search/detail/facet/export results.
8. Enable the `leads-primary` route and leads cache.
9. Monitor errors, latency, cache hit rate, quota accuracy, and database load.
10. Only after the rollback window, explicitly archive/drop old lead tables.

Do not bundle destructive old-lead deletion into the first application deployment.

---

## Required tests

Add or update tests for:

### Migration tests

- main migration does not run on the leads connection;
- leads migration does not run on the main connection;
- migration status reports target and checksum;
- an edited applied migration is rejected;
- concurrent migration commands are serialized by advisory lock;
- existing legacy baseline is not replayed.

### Pool ownership tests

- auth/quota/audit use main pool;
- lead/taxonomy/geocoding/dedup use leads pool;
- no lead service path imports the old shared pool accidentally;
- no SQL cross-database join is attempted.

### Data tests

- taxonomy seed is idempotent;
- aliases map to canonical rows;
- invalid city/region/country combinations are rejected;
- duplicate normalized name/email rows are rejected/skipped;
- email-less rows follow the documented policy;
- public `lead_ref` is stable and unique.

### Quota tests

- concurrent requests cannot exceed a plan limit;
- search/view/export counters use the documented units;
- quota state survives a control Redis restart;
- failed lead queries do not silently grant or permanently lose quota;
- usage logs remain in main without a cross-database FK;
- privileged roles bypass limits only according to the existing product rule.

### Cache tests

- cache hits avoid a leads DB query;
- cache misses query the leads DB;
- leads Redis outage falls back to the leads DB;
- dataset version invalidates old results;
- filters/cursor/sort/limit produce distinct keys;
- free users cannot receive full-contact cached results;
- concurrent misses do not create an uncontrolled stampede.

### API regression tests

Exercise:

- search
- detail
- facets
- landing stats
- admin lead management
- create/update
- CSV import
- external ingest
- export
- geocoding
- signup/login/profile
- plans/subscriptions
- quota status

Run existing backend tests, syntax checks, and frontend build.

---

## Required documentation updates

Update or add:

- environment example files;
- README setup instructions for two PostgreSQL URLs, two Redis URLs, and PostGIS;
- migration runbook and status commands;
- database ownership table;
- index matrix for the leads database;
- 7M load/runbook document;
- backup, restore, and rollback instructions;
- cache key/TTL/invalidation documentation;
- quota-unit documentation;
- production monitoring/alert list.

Keep `MULTI_DATABASE_LEADS_ARCHITECTURE_PLAN.md` as the design source of truth unless an approved decision changes it.

---

## Definition of done

Do not claim completion until all of the following are true:

- [ ] Two PostgreSQL pools and two Redis connections are explicit and health-checked.
- [ ] Scoped migrations run against only their intended database.
- [ ] Existing users and billing data remain in main.
- [ ] The new leads database owns all lead taxonomy and lead indexes.
- [ ] No cross-database FK or SQL join remains.
- [ ] Durable quota math lives in main and is concurrency-safe.
- [ ] Lead cache is separate, versioned, privacy-safe, and optional on reads.
- [ ] Search uses keyset pagination and avoids unnecessary exact counts.
- [ ] The 7M import strategy uses staging/COPY or an equivalent bulk path.
- [ ] Search, facets, detail, import, export, admin, geocoding, and dedup use the leads pool.
- [ ] Auth, billing, quotas, usage, and audit use the main pool.
- [ ] Migration, ownership, quota, cache, API, and failure tests pass.
- [ ] The old leads data has not been destructively removed until cutover validation and backup retention are complete.
- [ ] Final `git diff`, test output, migration status, and operational assumptions are reported clearly.

At the end, report:

1. files changed;
2. migrations created and their target database;
3. environment variables added;
4. commands used to test both databases and both Redis connections;
5. remaining manual infrastructure steps;
6. measured import/query/cache results;
7. any deviations from the approved architecture.
