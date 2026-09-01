# FreeLeads Multi-Database Leads Architecture Plan

**Status:** Planning only. No application code, schema, data, or deployment has been changed by this document.

**Repository:** `saifullahkhancs/free-leads`

**Purpose:** Define how FreeLeads will separate account/billing data from a 7-million-row leads data store, how migrations will be assigned to the correct database, and how a dedicated Redis instance will cache lead reads and pagination safely.

---

## 1. Decisions this plan makes

### Recommended first release

1. Keep the existing user, authentication, billing, quota, audit, contact, and CMS data in the **main/control PostgreSQL database**.
2. Provision one new, empty **leads PostgreSQL database** for the first 7 million leads. The application will still use a `lead_store_key` abstraction so adding a second lead database later does not require another ownership rewrite.
3. Move the complete lead taxonomy to the leads database:
   - `categories`
   - `industries`
   - `countries`
   - `regions`
   - `cities`
   - all lead taxonomy foreign keys and indexes
4. Use canonical integer IDs for taxonomy rows inside the leads database, but use a globally unique `lead_ref` UUID as the public lead identifier. Keep a local `BIGINT id` for efficient physical ordering and keyset pagination.
5. Keep durable quota configuration and usage accounting in the main database. The existing control Redis may continue to handle rate limiting, refresh-token revocation, OAuth state, and other ephemeral control data, but it must not be the only source of truth for quotas.
6. Add a **second, dedicated Redis** for lead-result, facet, default-page, and lead-detail caching. A cache outage must fall back to PostgreSQL and must not prevent login, quota enforcement, or lead reads.
7. Use PostGIS in the leads database for the 7-million-row radius-search workload. The current plain-PostgreSQL Haversine fallback is useful for development, but it should not be the production path at this scale.
8. Because existing lead data will be discarded, create and validate the new leads database first. Retire the old lead tables only after cutover and a backup/retention period; do not delete 7 million rows in-place as the migration mechanism.

### Decisions that still need product confirmation

These do not block the architecture, but they should be confirmed before implementation:

- Whether the first production deployment is one leads database or several physical lead shards. The recommendation is one leads database now, with the routing abstraction ready for shards later.
- Whether an export quota means **rows exported** or **export requests**. This plan recommends rows exported, because it directly limits data exfiltration and matches the current `max_export_per_req` design.
- Whether the current public numeric lead IDs may change to opaque UUID references. The recommendation is yes, because it prevents ID collisions when a second lead database is introduced. Existing lead data is being removed, so this is the least expensive time to make the change.
- Whether user profile location fields remain as user-entered strings. The recommendation is yes: profile location/preferences remain in the main database without a cross-database foreign key. The leads database resolves those labels to its own taxonomy IDs at query time.

---

## 2. Direct answers to the questions

### 2.1 How do we know which schema update is made to which database?

A migration must have an explicit **target**. The migration runner must never point every SQL file at every connection.

Use separate directories and separate migration histories:

```text
backend/src/db/migrations/
  main/
    001_main_baseline_or_foundation.sql
    002_detach_lead_references.sql
    003_daily_usage_and_lead_stores.sql
    ...
  leads/
    001_leads_foundation.sql
    002_leads_taxonomy.sql
    003_leads_table.sql
    004_leads_indexes.sql
    ...
```

Use explicit commands:

```bash
npm run migrate:main    # only MAIN_DATABASE_URL
npm run migrate:leads   # only LEADS_DATABASE_URL
npm run migrate:all     # main, then leads, with a status report
npm run migrate:status  # status for both targets
```

Each database has its own migration metadata table, for example:

```text
main_schema_migrations
leads_schema_migrations
```

Every row should record at least:

```text
scope / database target
migration version
migration filename
SHA-256 checksum of the SQL file
applied_at
execution time
```

The command output must be unambiguous:

```text
[main]  Applying 003_daily_usage_and_lead_stores.sql
[main]  Applied 003_daily_usage_and_lead_stores.sql
[leads] Applying 003_leads_table.sql
[leads] Applied 003_leads_table.sql
```

A migration file is immutable after it has been applied. If a schema needs to change, add a new forward migration. Do not edit an old migration and do not run a `down` migration automatically in production.

The current repository does **not** provide this separation yet. It has one `DATABASE_URL`, one pool in `backend/src/config/db.js`, one `src/db/migrations` directory, and one filename-based `schema_migrations` table in `backend/src/db/migrate.js`. The current migration folder also mixes auth, leads, taxonomy, billing, and CMS changes. That is safe only while there is one database.

### 2.2 Which data belongs in the main database?

The main database is the control plane and the source of truth for user/account state:

- `users`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `refresh_tokens`
- password-reset and verification state
- user profile fields and interests
- `plans`
- `subscriptions`
- `payment_transactions`
- durable daily quota counters and/or quota events
- `usage_logs`
- `api_keys`
- `audit_logs`
- `contact_messages`
- `blog_posts`
- `lead_stores` routing metadata, without database passwords

The main database must not contain the large `leads` table or lead taxonomy tables after cutover.

### 2.3 Which data belongs in the leads database?

The leads database is the data plane and the source of truth for lead search data:

- `leads`
- `categories`
- `industries`
- `countries`
- `regions`
- `cities`
- lead deduplication identity/indexes
- lead import metadata if it is high-volume and lead-specific
- lead-only aggregate/statistics tables if later needed

There must be no `users` or billing data in this database.

### 2.4 What does “move category, industry, country, region, and city” mean?

The recommended model is to normalize all five dimensions in the leads database. A lead stores IDs, not repeated free-text labels:

```text
leads.category_id  -> categories.id
leads.industry_id  -> industries.id
leads.country_id   -> countries.id
leads.region_id    -> regions.id
leads.city_id      -> cities.id
```

The API joins these small dimension tables inside the leads database and returns labels to the frontend. The main database does not store foreign keys to these tables because PostgreSQL foreign keys cannot cross databases.

---

## 3. Current repository baseline and split impact

The following current behavior must be accounted for during implementation:

| Current location | Current behavior | Required change |
|---|---|---|
| `backend/src/config/db.js` | One PostgreSQL pool | Add a main pool and a leads pool with separate connection strings |
| `backend/src/db/migrate.js` | One migration directory and one migration history | Add target-specific runners, locks, checksums, and status output |
| `backend/src/config/redis.js` | One Redis connection used for rate limiting, auth state, quota counters, and cache comments | Keep control Redis and add a separate optional leads-cache Redis |
| `backend/src/services/leadService.js` | Uses the shared PostgreSQL pool for search, facets, CRUD, import, export, stats, and geocoding | Use the leads pool for every lead/taxonomy operation |
| `backend/src/utils/GeoMapper.js` | Imports the shared pool and reads/writes `countries`, `regions`, and `cities` | Inject/use the leads pool only |
| `backend/src/services/dedupService.js` | Uses the shared pool for admin dedup and currently has no durable global dedup ledger | Use the leads pool and enforce the identity rule in the leads schema |
| `backend/src/services/quotaService.js` | Reads plans from PostgreSQL and increments daily counters in Redis | Read plans and durable usage from main; use control Redis only for throttles/ephemeral state unless a durable quota design is deliberately retained |
| `backend/src/services/auditService.js` | Writes `audit_logs` through the shared pool | Use the main pool |
| `backend/src/services/authService.js` | User/auth queries through the shared pool | Use the main pool |
| `backend/src/controllers/adminController.js` | Some admin handlers query `leads` and taxonomy directly | Split admin queries by data owner; never join across pools in SQL |
| `backend/src/db/migrations/004_quota_billing.sql` | `usage_logs.lead_id` has a foreign key to `leads(id)` | Remove the cross-database foreign key and store an opaque lead reference plus store key |
| `backend/src/services/leadService.js` | Current lead IDs are exposed/parsed as numeric IDs | Prefer UUID `lead_ref` externally; retain local numeric ID internally |
| `backend/src/services/leadService.js` | Current import uses 1,000-row `UNNEST` batches and coordinate updates | Add a bulk-load path using staging/COPY for the 7M initial load |
| `backend/src/services/leadService.js` | Current `COUNT(*)` and facet aggregations can run on every request | Use keyset `has_more`, cached facets, and cached/maintained totals |

There are also historical inconsistencies that must be corrected as part of implementation rather than copied into the new design:

- Current migration files have duplicate numeric prefixes such as `014`, `015`, and `016`. New scoped migrations must use unique, sortable versions.
- The current quota service says it writes usage logs, but its shown implementation writes an audit event and Redis counter; it does not provide a durable quota counter by itself.
- The current `lead_hashes` table and hash indexes were intentionally removed. The current in-memory dedup set only protects rows within one import call, not all future imports. A database-enforced `(normalized full_name, normalized email)` identity is required if duplicates are not allowed across import jobs.
- `getStats`, admin dimension handlers, geocoding, export, and dedup all need explicit pool ownership review.

---

## 4. Target architecture

```text
                         ┌─────────────────────────────┐
                         │ Main / Control PostgreSQL    │
                         │ users, auth, billing, quota │
                         │ audit, CMS, usage           │
                         └──────────────┬──────────────┘
                                        │ mainPool
                         ┌──────────────▼──────────────┐
                         │ Express API                  │
                         │ auth + quota + lead services │
                         └──────────────┬──────────────┘
                                        │ leadsPool
                         ┌──────────────▼──────────────┐
                         │ Leads PostgreSQL              │
                         │ leads + all taxonomy +       │
                         │ search/geospatial indexes    │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ Dedicated Leads Redis        │
                         │ pages, default results,      │
                         │ facets, detail data          │
                         └─────────────────────────────┘

Control Redis remains separate and is used for:
rate limits, refresh-token revocation, OAuth state, locks, and other control-plane ephemeral state.
```

### Request flow for a lead search

1. Authenticate through the main database/control services.
2. Resolve the user's plan and entitlement from the main database.
3. Reserve/charge the search quota in the main database using an atomic operation.
4. Build a canonical filter key.
5. Read a result from leads Redis if present and valid.
6. On a cache miss, query only the leads database, including taxonomy joins.
7. Apply email/phone/social/about visibility in the API layer or use an entitlement-safe cache key.
8. Return results and quota status.
9. If the leads query fails after a reservation, issue a compensating quota release or mark the attempt failed according to the chosen quota transaction design.

There is no distributed SQL transaction between PostgreSQL databases. The code must use explicit compensation and idempotency where a request touches both systems.

---

## 5. Proposed schema ownership

### 5.1 Main database tables

Existing auth and billing tables remain here. Add or adjust these tables:

#### `lead_stores`

Routing metadata for the lead data plane:

```text
store_key       VARCHAR PRIMARY KEY       -- e.g. leads-primary
status          VARCHAR NOT NULL          -- active, draining, disabled
routing_weight  INTEGER NOT NULL DEFAULT 100
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

Do not put `LEADS_DATABASE_URL` or a password in this table. Connection strings belong in deployment secrets. This table is useful when a second lead database is added.

#### `daily_usage`

Durable, atomic daily counters owned by the main database:

```text
user_id             UUID NOT NULL REFERENCES users(id)
usage_date          DATE NOT NULL
search_requests     INTEGER NOT NULL DEFAULT 0
lead_views          INTEGER NOT NULL DEFAULT 0
export_rows         INTEGER NOT NULL DEFAULT 0
updated_at          TIMESTAMPTZ NOT NULL
PRIMARY KEY (user_id, usage_date)
```

The update must be an atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE current + amount <= plan_limit RETURNING ...` or an equivalent transaction. It must not read, increment, and write in separate non-locking statements.

#### `usage_logs`

Remove the cross-database foreign key on `lead_id`. During the transition, keep the legacy nullable `lead_id` only if existing application code needs it, and add:

```text
lead_store_key      VARCHAR(64)
lead_ref            UUID
lead_local_id       BIGINT
```

After all callers use `lead_ref`, a later cleanup migration may remove the legacy field. `lead_ref` is an application reference, not a PostgreSQL foreign key. This is intentional: a main database cannot enforce a foreign key into another PostgreSQL database.

`audit_logs.entity_id` is already string-like and can store `lead_ref` or `leads-primary:<local-id>`.

### 5.2 Leads database tables

#### `categories`

```text
id              SMALLINT or INTEGER PRIMARY KEY
slug            VARCHAR(150) UNIQUE NOT NULL
name            VARCHAR(150) NOT NULL
is_active       BOOLEAN NOT NULL DEFAULT TRUE
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

#### `industries`

```text
id              INTEGER PRIMARY KEY
category_id     INTEGER NOT NULL REFERENCES categories(id)
slug            VARCHAR(150) NOT NULL
name            VARCHAR(150) NOT NULL
is_active       BOOLEAN NOT NULL DEFAULT TRUE
UNIQUE(category_id, slug)
```

If an industry must belong to exactly one category, enforce that rule in the database. If the product later needs many-to-many classification, introduce a bridge table rather than duplicating industry names in leads.

#### `countries`

Use ISO 3166-1 alpha-2 codes as the canonical identity:

```text
id              SMALLINT or INTEGER PRIMARY KEY
code            CHAR(2) UNIQUE NOT NULL
name            VARCHAR(120) NOT NULL
normalized_name VARCHAR(120) NOT NULL
```

#### `regions`

```text
id              INTEGER or BIGINT PRIMARY KEY
country_id      REFERENCES countries(id) NOT NULL
code            VARCHAR(30)
name            VARCHAR(150) NOT NULL
normalized_name VARCHAR(150) NOT NULL
UNIQUE(country_id, normalized_name)
```

#### `cities`

```text
id              INTEGER or BIGINT PRIMARY KEY
country_id      REFERENCES countries(id) NOT NULL
region_id       REFERENCES regions(id)
name            VARCHAR(180) NOT NULL
normalized_name VARCHAR(180) NOT NULL
```

Use a uniqueness rule that handles a nullable `region_id`, for example a unique expression on `(country_id, COALESCE(region_id, 0), normalized_name)`. The mapping/import code must not create a new city row for every spelling variation.

#### `leads`

Recommended core fields:

```text
id                  BIGINT GENERATED BY DEFAULT AS IDENTITY  -- local/internal order
lead_ref            UUID NOT NULL DEFAULT gen_random_uuid()  -- public/global identity
full_name           VARCHAR(255) NOT NULL
headline            VARCHAR(255)
about               TEXT
email               VARCHAR(255)
phone               VARCHAR(40)
linkedin_url        VARCHAR(500)
twitter_url         VARCHAR(500)
facebook_url        VARCHAR(500)
website_url         VARCHAR(500)
category_id         INTEGER REFERENCES categories(id)
industry_id         INTEGER REFERENCES industries(id)
country_id          INTEGER REFERENCES countries(id)
region_id           INTEGER REFERENCES regions(id)
city_id             INTEGER REFERENCES cities(id)
company_name        VARCHAR(255)
job_title           VARCHAR(255)
num_employees       INTEGER
lat                 DOUBLE PRECISION
lon                 DOUBLE PRECISION
location            GEOGRAPHY(POINT, 4326)
source              VARCHAR(100)
is_verified          BOOLEAN NOT NULL DEFAULT FALSE
is_active            BOOLEAN NOT NULL DEFAULT TRUE
search_vector       TSVECTOR
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

Add a coordinate check:

```text
lat IS NULL OR lat BETWEEN -90 AND 90
lon IS NULL OR lon BETWEEN -180 AND 180
```

Add a foreign-key consistency check in application/import logic: a city, region, and country selected for a row must form a valid hierarchy. PostgreSQL foreign keys alone do not prevent `city_id` from belonging to a different country than `country_id`.

### 5.3 Lead identity and deduplication

The current documented uniqueness rule is:

```text
normalized(trim(full_name)) + "::" + normalized(trim(email))
```

Only rows with both non-empty values participate. Two rows without an email are not duplicates under the current policy.

Because all old lead data will be removed, the recommended new schema should enforce this directly with a stored identity key and a partial unique index:

```text
lead_identity_key TEXT GENERATED ALWAYS AS (
  CASE
    WHEN btrim(full_name) <> '' AND email IS NOT NULL AND btrim(email) <> ''
    THEN lower(btrim(full_name)) || '::' || lower(btrim(email))
    ELSE NULL
  END
) STORED
```

Then:

```text
CREATE UNIQUE INDEX uq_leads_identity
  ON leads (lead_identity_key)
  WHERE lead_identity_key IS NOT NULL;
```

The importer must use `ON CONFLICT` or a pre-deduplication staging query and report `imported`, `skipped_duplicates`, `failed`, and representative row errors. Do not rely only on a JavaScript `Set`; it cannot protect against two import workers or a later import process.

---

## 6. Indexing plan for 7 million leads

Indexes are not free. Each extra index consumes disk, cache, WAL, and insert/update time. The goal is to index actual query paths, not every column.

### 6.1 Required initial indexes

#### Lead identity and pagination

```text
PRIMARY KEY (id)
UNIQUE (lead_ref)
PARTIAL INDEX on (id) WHERE is_active = TRUE
UNIQUE partial index on lead_identity_key
```

The partial active-ID index supports the default active-only keyset page:

```sql
WHERE is_active = TRUE AND id > :cursor
ORDER BY id ASC
LIMIT :limit_plus_one
```

#### Full-text search

```text
GIN(search_vector) [prefer a partial active-only version if query predicates match]
```

The trigger must update the vector from the fields actually searched, currently full name, company name, and headline. Use an explicit text-search configuration.

#### Geospatial search

```text
GiST(location) WHERE is_active = TRUE AND location IS NOT NULL
```

At 7 million rows, use PostGIS in the lead database instead of evaluating a Haversine expression across a large candidate set. Keep `lat` and `lon` for import/debugging and fallback operations.

#### Taxonomy filters

Use partial indexes for sparse nullable foreign keys:

```text
(country_id)  WHERE is_active = TRUE AND country_id IS NOT NULL
(region_id)   WHERE is_active = TRUE AND region_id IS NOT NULL
(city_id)     WHERE is_active = TRUE AND city_id IS NOT NULL
(category_id) WHERE is_active = TRUE AND category_id IS NOT NULL
(industry_id) WHERE is_active = TRUE AND industry_id IS NOT NULL
```

#### Dimension lookup indexes

```text
regions(country_id, normalized_name)
cities(country_id, region_id, normalized_name)
industries(category_id, normalized_name)
```

The primary keys and unique constraints already create their supporting indexes.

### 6.2 Indexes to add only after `EXPLAIN (ANALYZE, BUFFERS)`

Do not create all of these by default. Benchmark the real distribution and query mix first:

```text
(category_id, id) WHERE is_active = TRUE
(industry_id, id) WHERE is_active = TRUE
(country_id, id) WHERE is_active = TRUE
(region_id, id) WHERE is_active = TRUE
(city_id, id) WHERE is_active = TRUE
(created_at DESC, id DESC) WHERE is_active = TRUE
```

These can make filtered keyset pagination much faster, but each one adds an index entry for a large fraction of 7 million rows. A static dataset may justify them; a frequently updated dataset may not.

Do not add these without a measured query need:

- a standalone `is_verified` boolean index (low selectivity)
- trigram GIN indexes for fields that are not searched with `ILIKE`/trigram operators
- four separate hash indexes solely because a hash exists in the model
- every possible combination of taxonomy dimensions
- an offset-pagination index strategy

### 6.3 Migration versus index build

The current migration runner wraps each SQL migration in a transaction. Large production indexes should not be built in that transaction with ordinary `CREATE INDEX`, because the build can hold locks and a concurrent index build cannot run inside a transaction.

Use a separate operational step for large indexes:

1. Create tables and constraints in a normal migration.
2. Load and deduplicate the initial data.
3. Build large read indexes with `CREATE INDEX CONCURRENTLY` where appropriate.
4. Run `ANALYZE` and verify plans.
5. Record index-build completion in deployment metadata.

If an index is required before the service can start, build it before enabling the new read path.

---

## 7. Seven-million-row capacity and performance math

No one can accurately promise disk size from a column list alone because lead text length, NULL rates, token counts, coordinate coverage, and update frequency dominate the result. Use a sample load to measure the real row and index sizes.

### 7.1 Basic storage model

Let:

```text
N = 7,000,000 rows
R = average heap + TOAST bytes per lead row
I = total index bytes per lead row
S = dimension/staging/metadata/WAL headroom
```

Then:

```text
Permanent data size ≈ N × (R + I) + dimension tables
Provisioned disk    ≥ permanent data size + staging space + WAL/backup headroom
```

Illustrative heap-only examples, before indexes and TOAST:

| Average stored lead row | 7M rows, decimal GB |
|---:|---:|
| 1 KB | about 7 GB |
| 2 KB | about 14 GB |
| 4 KB | about 28 GB |
| 8 KB | about 56 GB |

Long `about`, URLs, and other variable text may be stored in TOAST, and the GIN/GiST/B-tree indexes can add several more GB. During a staging import, temporary data and WAL can be comparable to or larger than the final table.

A reasonable initial production sizing hypothesis is at least 100 GB of fast SSD and 16–32 GB RAM, with 150–250 GB safer if rows contain substantial text, a staging table, indexes, backups, or replicas. This is a sizing starting point, not a substitute for measurement. The final decision must come from a representative 1–5% sample and `pg_total_relation_size()`.

### 7.2 Index/write trade-off

For every index on `leads`:

- every insert writes another index structure;
- every indexed update writes another index entry or creates dead tuples;
- index pages compete with useful data pages in RAM;
- bulk load time and WAL volume increase;
- vacuum and index maintenance take longer.

At 7 million rows, five unnecessary indexes can consume multiple GB and materially slow a reload. This is why the required index set is intentionally small and optional composite indexes are benchmark-driven.

### 7.3 Import throughput model

The initial import rate should be measured as:

```text
rows per second = 7,000,000 / elapsed seconds
```

For reference:

| Sustained rate | Approximate time for 7M rows |
|---:|---:|
| 1,000 rows/s | 1.94 hours |
| 5,000 rows/s | 23.3 minutes |
| 10,000 rows/s | 11.7 minutes |

These numbers exclude taxonomy mapping, duplicate resolution, index builds, WAL pressure, retries, and validation. The current Node loop with per-row geography updates should not be used as the benchmark for the 7M initial load.

### 7.4 Query targets

Use the existing project target of roughly sub-300 ms p95 for ordinary indexed searches as a test target, not a guarantee. Measure separately:

- default first page;
- keyword plus one taxonomy filter;
- country/region/city drilldown;
- industry/category filter;
- radius search;
- detail by `lead_ref`;
- facet response;
- export query;
- cache hit and cache miss.

Avoid exact `COUNT(*)` on every page. Fetch `limit + 1`, return `has_more`, and calculate an exact total only when the product truly needs it. Cache or maintain aggregate totals for dashboard/landing pages.

---

## 8. Quotas and “actual math” in the split design

### 8.1 Ownership

- Plan definitions, subscriptions, user entitlements, durable daily usage, usage logs, and audit events belong to the main database.
- A lead search may read the leads database, but it is authorized and charged by the main/control plane.
- Lead cache data never determines whether a user has quota or contact-field access.

### 8.2 Recommended quota units

Define these explicitly in the product contract:

| Action | Recommended unit |
|---|---:|
| Search request | 1 `search_requests` unit per accepted request |
| Lead detail view | 1 `lead_views` unit per accepted detail request |
| Export | Number of rows actually reserved/returned in `export_rows`; cap each request with `max_export_per_req` |

The current code has a semantic mismatch: the search middleware increments one unit per request, while exports pass the requested row count to the quota checker. The new implementation must use clearly named fields and return the same meaning in the billing UI.

### 8.3 Atomic durable update

For each request:

1. Load the active plan from the main database.
2. Lock or atomically update the user's row in `daily_usage` for the current UTC date.
3. Reject if the new value exceeds the plan's limit, except for privileged roles.
4. Write an append-only `usage_logs` record in the main database.
5. Store `lead_ref` and `lead_store_key` when a request relates to a lead.

A Redis counter can still be used as a performance optimization, but if it is used as the authority then Redis persistence, restart behavior, plan changes, counter reconciliation, and failure recovery must be designed and tested. For the requested “actual” quota math, the durable main database counter is the safer authority.

### 8.4 Failure behavior

- If quota reservation fails: do not query the leads database.
- If leads cache misses and the leads database fails: return a 503 and release/compensate a reservation according to the idempotent request record.
- If a usage-log insert fails after a successful durable counter update: retry asynchronously from an outbox or make the reservation transaction include the usage log.
- A cache failure must never grant extra quota or reveal contact fields.

---

## 9. Dedicated leads Redis design

### 9.1 Connections

Add separate configuration:

```text
REDIS_URL              = control Redis
LEADS_REDIS_URL        = dedicated leads cache Redis
LEADS_CACHE_ENABLED    = true/false
```

The control Redis remains responsible for rate limiting, refresh-token revocation, OAuth state, lockout/throttling, and any control-plane ephemeral state. The leads Redis is for cache only.

Prefer a separate Redis instance/service, not merely another logical Redis database number. A logical database number does not isolate CPU, memory, eviction, network, or failure domains.

### 9.2 Keys

Use a versioned namespace and include every value that changes the response:

```text
leads-cache:v1:dataset-version
leads-cache:v1:search:<hash-of-canonical-filters>
leads-cache:v1:facets:<hash-of-canonical-filters>
leads-cache:v1:default:<cursor>:<limit>:<sort>
leads-cache:v1:lead:<store-key>:<lead-ref>
leads-cache:v1:stats:<name>
```

Canonical filters must include normalized values for query, category/industry IDs, country/region/city IDs, verified flag, coordinates/radius, sort, cursor, and limit. Never use a raw unsorted query-string as the only key.

### 9.3 Visibility and privacy

Do not return a cached full-contact response to a free user. Recommended approach:

1. Cache canonical lead records privately on the server, never in the browser.
2. Apply plan visibility after authentication and entitlement resolution.
3. Include the dataset version and lead store in every key.
4. If caching already-shaped responses instead, include an entitlement class such as `public` or `full` in the key and test it heavily.

Protect the leads Redis with private networking, ACLs, TLS where supported, short TTLs, and no verbose logging of values. Treat cached lead contact information as sensitive data even though it is not the database of record.

### 9.4 TTL and invalidation

Initial TTL recommendations:

| Cache | Initial TTL |
|---|---:|
| Default first page | 60–300 seconds |
| Search result page | 30–120 seconds |
| Facets | 5–15 minutes |
| Lead detail | 5–15 minutes |
| Stats/coverage | 1–5 minutes |

Use a dataset version rather than scanning and deleting millions of keys:

```text
leads-cache:v1:version = 42
```

Include that version in all keys. After a successful import, update the version once. After a manual lead update/delete, increment it once per committed operation or batch. Old keys expire naturally.

For the initial 7M load, do not populate 7M detail keys. Warm only the default page, popular facets, and explicitly requested detail rows.

### 9.5 Stampede protection and fallback

On a miss, use a short-lived `SET lock-key value NX PX ...` lock or equivalent. Only one request should rebuild a hot key. Other requests may briefly wait or query PostgreSQL directly.

If leads Redis is unavailable:

- log a structured cache error;
- query the leads database;
- return the result;
- do not fail the lead request solely because caching failed.

Add metrics for hits, misses, evictions, rebuild time, fallback count, serialized payload size, and stale-version reads.

---

## 10. Migration and cutover plan

### Phase 0 — Freeze and backup

1. Stop lead writes/imports while the split is being prepared.
2. Back up the current main/combined database.
3. Record current migration status, row counts, plans, users, subscriptions, and quota data.
4. Keep the old lead data available for a short rollback window even though it will not be migrated.

### Phase 1 — Add the split infrastructure

1. Add `MAIN_DATABASE_URL`, `LEADS_DATABASE_URL`, `REDIS_URL`, and `LEADS_REDIS_URL` to environment configuration.
2. Create `mainPool` and `leadsPool` with separate health checks and pool settings.
3. Implement target-specific migration runners and status output.
4. Add a `leadStoreRegistry`/router with `leads-primary` as the only active store.
5. Add separate leads Redis connection with graceful fallback.

### Phase 2 — Prepare the main database

1. Treat the current combined database as the main database so users and billing are preserved.
2. Bootstrap a new scoped main migration history from the already-applied legacy schema; do not replay old mixed migrations against the main database.
3. Remove the `usage_logs.lead_id` cross-database foreign key.
4. Add `lead_store_key`, `lead_ref`, and optional `lead_local_id` to usage/audit references.
5. Add `daily_usage` and `lead_stores`.
6. Verify all auth/billing code uses `mainPool`.

### Phase 3 — Provision the empty leads database

1. Provision PostgreSQL with PostGIS enabled.
2. Run only leads-scoped migrations against it.
3. Seed canonical categories, industries, countries, regions, and cities.
4. Validate that aliases and normalization rules map to one canonical row.
5. Create the lead table and the identity/pagination constraints.

### Phase 4 — Load and validate 7M leads

1. Create an unlogged or temporary staging table without the expensive read indexes.
2. Load with PostgreSQL `COPY` or a dedicated bulk loader, not one network round trip per row.
3. Normalize fields and map taxonomy IDs before inserting into final `leads`.
4. Deduplicate in staging and let the unique identity index enforce the final invariant.
5. Insert valid rows into final `leads` in large, monitored batches.
6. Build GIN, GiST, partial B-tree, and optional composite indexes after load.
7. Run `ANALYZE`, validation queries, and `EXPLAIN (ANALYZE, BUFFERS)` benchmarks.
8. Record counts by category, industry, country, region, city, active/verified state, coordinate coverage, and duplicate/error counts.

### Phase 5 — Switch the application

1. Deploy pool and service changes behind a feature flag if possible.
2. Route all lead search, filters, CRUD, imports, exports, geocoding, admin lead stats, and dedup operations to the leads pool.
3. Route all users, plans, subscriptions, quotas, usage, auth, and audit operations to the main pool.
4. Turn on leads Redis in read-through mode.
5. Warm the default page/facets.
6. Compare old and new API response shape and counts where applicable.

### Phase 6 — Retire old lead data

1. Monitor the new lead database and cache for the agreed rollback period.
2. Confirm no production query still reads old `leads`, `categories`, `countries`, `regions`, or `cities` tables from the main database.
3. Keep the backup according to the retention policy.
4. Drop or archive old lead tables only in a later, explicit cleanup migration. Dropping a table is irreversible; it must not be bundled into the first cutover.

---

## 11. Rollback and failure strategy

There is no cross-database atomic commit, so rollback means switching the application read/write route, not rolling back both databases in one transaction.

- **New leads schema/import invalid:** keep the old combined database untouched and do not enable the new lead router.
- **Application bug after cutover:** point the lead router back to the old store only if the old data is intentionally retained for rollback; otherwise fix forward from the validated new store.
- **Main migration failure:** the scoped migration runner rolls back that migration on the main connection only. No leads migration should be marked successful.
- **Leads migration failure:** rollback the current leads migration transaction where possible; large index jobs are handled independently and can be dropped/rebuilt.
- **Leads Redis failure:** bypass cache and query the leads database.
- **Leads database failure:** return a clear 503 for lead operations; do not silently return mock leads or charge a failed request.
- **Main database failure:** auth/quota/billing operations fail closed.

---

## 12. Acceptance checklist before execution is considered complete

### Migration correctness

- [ ] `migrate:main` cannot execute a leads migration.
- [ ] `migrate:leads` cannot execute an auth/billing migration.
- [ ] Each target has independent migration status, checksum, lock, and retry behavior.
- [ ] Existing applied mixed migrations are baselined rather than replayed or edited.
- [ ] Production startup does not blindly run a large concurrent index build inside a transaction.

### Data ownership

- [ ] No user/billing table exists in the leads database.
- [ ] No `leads`/taxonomy query uses `mainPool`.
- [ ] No auth/quota/audit query uses `leadsPool`.
- [ ] No cross-database foreign key remains.
- [ ] Usage/audit records retain a lead reference without pretending it is a cross-database FK.

### Search and data

- [ ] Category and industry are normalized in the leads database.
- [ ] Country, region, and city are normalized in the leads database.
- [ ] City/region/country combinations are validated.
- [ ] Public lead lookup uses `lead_ref`, not an ambiguous local numeric ID.
- [ ] The unique normalized name/email identity is enforced in the database.
- [ ] Keyset pagination returns `has_more` and does not require deep offsets.
- [ ] Exact counts are not run on every page unless explicitly required.

### Quota and security

- [ ] Plan and durable daily quota state are in the main database.
- [ ] Search/view/export units are defined and tested.
- [ ] Concurrent quota requests cannot overspend a limit.
- [ ] A failed leads query does not permanently consume quota.
- [ ] Cached full-contact data cannot be returned to an unauthorized user.

### Cache

- [ ] `LEADS_REDIS_URL` is a separate service/connection.
- [ ] Cache keys include dataset version, store, filters, cursor, limit, sort, and visibility-safe scope.
- [ ] Import/update/delete changes the dataset version.
- [ ] Cache miss, cache outage, and stampede behavior are tested.
- [ ] Cache metrics and payload limits exist.

### Scale

- [ ] A representative sample has measured heap, TOAST, index, staging, and WAL size.
- [ ] The lead database has enough SSD headroom for the final data, indexes, WAL, and operational growth.
- [ ] Import throughput and restart behavior have been tested.
- [ ] Search, facets, detail, exports, and radius queries have real `EXPLAIN` plans.
- [ ] Autovacuum, backups, monitoring, and restore tests are configured.

---

## 13. Final recommendation

Start with **one empty PostGIS leads database plus one dedicated leads Redis**, while implementing the code as if a `leads-primary` store is one of several possible stores. Keep the main database focused on user and business state, move every lead dimension to the lead store, enforce quota math durably in the main database, and use Redis only to accelerate lead reads.

This gives the immediate benefit the project needs at 7 million rows without prematurely introducing cross-shard fan-out search, distributed transactions, or a complex global query coordinator. When one leads database is no longer enough, add a second store behind the routing abstraction and use the already-established `lead_ref`/`lead_store_key` contract.
