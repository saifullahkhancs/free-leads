# Leads Directory Web App — Development Document

## 1. Overview

A web platform that lets users search, filter, and view lead/contact records (profile, social links, location, industry). Free tier gives limited access; paid tiers (via PayPal) unlock full data, exports, and higher rate limits. Includes an internal admin dashboard for managing leads, users, roles, and subscriptions.

**Stack:** Node.js (Express or NestJS), React, PostgreSQL, Redis (cache/rate-limiting/queues), JWT auth, RBAC.

**Scale target:** ~5,000,000 lead records, read-heavy, filter/search-heavy workload.

---

## 2. High-Level Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   React SPA │ ───► │  Node/Express API │ ───► │  PostgreSQL 15+  │
│ (User + Admin)│    │  (REST, JWT/RBAC) │      │  (leads, users)  │
└─────────────┘      └────────┬──────────┘      └─────────────────┘
                               │
                     ┌─────────┴─────────┐
                     │   Redis (cache,    │
                     │  rate limit, jobs) │
                     └─────────┬─────────┘
                               │
                     ┌─────────┴─────────┐
                     │  Worker (BullMQ)   │
                     │ imports, exports,  │
                     │ webhooks, emails   │
                     └────────────────────┘
                               │
                     ┌─────────┴─────────┐
                     │  PayPal (Subscriptions/ │
                     │  Orders API + webhooks) │
                     └────────────────────┘
```

Recommend a monolithic API to start (modular internally), splitting out the import/export worker as a separate process from day one since 5M-record CSV imports/exports will block the request thread otherwise.

---

## 3. Database Schema (PostgreSQL)

### 3.1 Core tables

**Location is normalized** into `countries` → `regions` → `cities` instead of free-text columns on `leads`. This keeps filter values consistent (no "USA" vs "United States" drift), makes per-location facet counts cheap (join on small tables instead of scanning 5M text values), and lets the import pipeline validate/map raw location strings to a canonical taxonomy once, rather than every query dealing with messy text.

```sql
-- Location hierarchy
CREATE TABLE countries (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(120) NOT NULL,
    code    CHAR(2) UNIQUE NOT NULL          -- ISO 3166-1 alpha-2
);

CREATE TABLE regions (
    id          SERIAL PRIMARY KEY,
    country_id  INT NOT NULL REFERENCES countries(id),
    name        VARCHAR(120) NOT NULL,
    UNIQUE (country_id, name)
);

CREATE TABLE cities (
    id          SERIAL PRIMARY KEY,
    region_id   INT REFERENCES regions(id),
    country_id  INT NOT NULL REFERENCES countries(id),
    name        VARCHAR(120) NOT NULL
);

-- Leads (the core dataset)
CREATE TABLE leads (
    id              BIGSERIAL PRIMARY KEY,
    full_name       VARCHAR(255) NOT NULL,
    headline        VARCHAR(255),
    about           TEXT,
    email           VARCHAR(255),
    linkedin_url    VARCHAR(500),
    twitter_url     VARCHAR(500),
    facebook_url    VARCHAR(500),
    website_url     VARCHAR(500),
    city_id         INT REFERENCES cities(id),
    region_id       INT REFERENCES regions(id),
    country_id      INT REFERENCES countries(id),
    industry        VARCHAR(150),
    company_name    VARCHAR(255),
    job_title       VARCHAR(255),
    source          VARCHAR(100),          -- where the record was ingested from
    location        GEOGRAPHY(POINT, 4326), -- Geospatial point (Lon, Lat)
    is_verified     BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    search_vector   TSVECTOR              -- generated column for full-text search
);

-- Users of the platform
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    is_active       BOOLEAN DEFAULT TRUE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- RBAC
CREATE TABLE roles (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(50) UNIQUE NOT NULL      -- 'super_admin','admin','editor','user'
);

CREATE TABLE permissions (
    id      SERIAL PRIMARY KEY,
    code    VARCHAR(100) UNIQUE NOT NULL     -- 'leads.read','leads.export','users.manage'
);

CREATE TABLE role_permissions (
    role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Subscriptions / billing (PayPal)
CREATE TABLE plans (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,        -- 'free','pro','business'
    price_cents     INT NOT NULL,
    billing_cycle   VARCHAR(20) NOT NULL,          -- 'monthly','yearly'
    monthly_lead_quota INT,
    daily_search_quota INT,
    can_export      BOOLEAN DEFAULT FALSE,
    paypal_plan_id  VARCHAR(100)                   -- PayPal's plan_id for subscriptions
);

CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_id             INT REFERENCES plans(id),
    paypal_subscription_id VARCHAR(150) UNIQUE,
    status              VARCHAR(30) NOT NULL,      -- 'active','cancelled','past_due','expired'
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payment_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    subscription_id UUID REFERENCES subscriptions(id),
    paypal_order_id VARCHAR(150),
    amount_cents    INT NOT NULL,
    currency        VARCHAR(10) DEFAULT 'USD',
    status          VARCHAR(30),                    -- 'completed','failed','refunded'
    raw_payload     JSONB,                           -- store full PayPal webhook payload
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Usage tracking (to enforce quotas)
CREATE TABLE usage_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    action      VARCHAR(50),        -- 'search','view_lead','export'
    lead_id     BIGINT REFERENCES leads(id),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Saved searches / lists (nice-to-have, drives retention)
CREATE TABLE saved_lists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(150),
    filters     JSONB,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE saved_list_leads (
    list_id UUID REFERENCES saved_lists(id) ON DELETE CASCADE,
    lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, lead_id)
);

-- API keys (for API-plan customers)
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    key_hash    VARCHAR(255) NOT NULL,     -- store hash, never raw key
    key_prefix  VARCHAR(12) NOT NULL,      -- shown to user for identification
    is_active   BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Audit log for admin actions
CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    actor_id    UUID REFERENCES users(id),
    action      VARCHAR(100),
    entity_type VARCHAR(50),
    entity_id   VARCHAR(100),
    metadata    JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Refresh tokens (for JWT rotation / revocation)
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 Indexing strategy (critical at 5M rows)

```sql
CREATE INDEX idx_leads_country_id    ON leads (country_id);
CREATE INDEX idx_leads_region_id     ON leads (region_id);
CREATE INDEX idx_leads_city_id       ON leads (city_id);
CREATE INDEX idx_leads_industry      ON leads (industry);
CREATE INDEX idx_leads_country_city  ON leads (country_id, city_id);
CREATE INDEX idx_leads_search_vector ON leads USING GIN (search_vector);
CREATE INDEX idx_leads_location      ON leads USING GIST (location);
CREATE INDEX idx_leads_company_trgm  ON leads USING GIN (company_name gin_trgm_ops); -- pg_trgm for partial name search
CREATE INDEX idx_usage_logs_user_created ON usage_logs (user_id, created_at);
CREATE INDEX idx_regions_country     ON regions (country_id);
CREATE INDEX idx_cities_region       ON cities (region_id);
```

- Use a `tsvector` generated column (`full_name || company_name || headline`) with a trigger or `GENERATED ALWAYS AS` for fast full-text search instead of `ILIKE '%x%'` scans.
- Use `pg_trgm` for fuzzy/partial matches on names and companies.
- Facet counts (e.g. "how many leads per country") become a cheap `GROUP BY country_id` joined against the small `countries` table, instead of aggregating over raw text.
- Always paginate with **keyset pagination** (`WHERE id > last_id ORDER BY id LIMIT 50`) rather than `OFFSET`, which degrades badly past a few hundred thousand rows.
- Consider table partitioning by `country` or `created_at` only if query patterns show it helps — don't add this complexity pre-emptively.
- Put masked/free-tier fields (e.g., partially hidden email) at the API layer, not as separate DB columns.

---

## 4. Module Development Plan

Modules are ordered by dependency, not by time estimate — each one assumes the ones before it exist. The leads import (5M rows) can be kicked off as a background job as soon as the schema exists and run in parallel with everything after it.

### Module 1 — Foundation + Auth
- Repo, Docker Compose (API, Postgres, Redis), env configs
- Full schema migration (all tables from §3, including geo hierarchy)
- JWT auth: register/login/refresh/logout, argon2 password hashing
- RBAC middleware + seed roles/permissions

### Module 2 — Leads Data Layer
- Import script: streaming CSV → `COPY`-based batch insert, geo-string → `country_id`/`region_id`/`city_id` mapping during import
- Kick off the 5M-record import as a background job
- Search/filter API: keyset pagination, filters, full-text search endpoint
- Field masking logic for free vs. paid tiers

### Module 3 — Billing (PayPal)
- Plans table + admin CRUD
- PayPal Subscriptions integration (create/approve flow)
- Webhook handler with signature verification (`BILLING.SUBSCRIPTION.ACTIVATED/CANCELLED`, `PAYMENT.SALE.COMPLETED`)
- Quota middleware tied to `usage_logs`

### Module 4 — React: User-Facing App
- Search UI (filters, results, pagination), lead detail view
- Auth pages, account/billing pages (upgrade/cancel)
- Saved lists + CSV export for paid users

### Module 5 — React: Admin Dashboard
- Lead CRUD + import job status view
- User management (roles, plan overrides)
- Subscription/transaction views, audit log viewer

### Module 6 — Hardening
- Rate limiting (Redis, per user/IP/API key)
- Security pass against the §6 checklist
- Verify import finished cleanly; spot-check data quality (dedupe, geo-mapping accuracy)

### Module 7 — Testing & Launch Prep
- End-to-end test of full user journey (signup → search → hit free quota → subscribe via PayPal sandbox → unlocked access)
- Load-test search endpoints against the full 5M-row table
- Deploy, monitoring/alerting setup (Sentry, DB slow-query logging)

**Note:** RBAC and PayPal webhook correctness (Modules 1 & 3) are the two places bugs are costly — wrong role assignment means a data leak, an unverified webhook means free unauthorized access. Don't shortcut those two even if you're moving fast elsewhere.

---

## 5. API Design (representative endpoints)

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/leads?country=&industry=&city=&q=&cursor=&limit=
GET    /api/leads/:id
POST   /api/leads/export           (paid only, queues a job)

GET    /api/plans
POST   /api/billing/subscribe      (creates PayPal subscription)
POST   /api/billing/webhook        (PayPal webhook receiver)
GET    /api/billing/me

-- Admin (requires RBAC permission)
GET    /api/admin/leads
POST   /api/admin/leads/import
GET    /api/admin/users
PATCH  /api/admin/users/:id/role
GET    /api/admin/audit-logs
```

---

## 6. Security Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Data scraping of leads dataset** (your core asset can be bulk-harvested via the search API) | Loss of competitive value, potential resale by scrapers | Per-user/IP rate limiting, pagination caps, CAPTCHA after suspicious velocity, watermark/canary records to detect leaks, contractual ToS against scraping |
| **PII exposure** (emails, social profiles are personal data) | Legal exposure (GDPR/CCPA), reputational damage | Mask unpaid-tier fields server-side (never send full data to the client then hide with CSS), data processing agreement, right-to-erasure endpoint, encrypt sensitive columns at rest if required by your jurisdiction |
| **JWT theft / replay** | Account takeover | Short-lived access tokens (~15 min), httpOnly+secure refresh cookie, refresh token rotation with reuse detection, revoke-on-logout list in Redis |
| **Broken RBAC / privilege escalation** | Unauthorized data access or admin actions | Centralize permission checks in middleware (never trust client role claims), deny-by-default, test every admin route for auth bypass |
| **PayPal webhook spoofing** | Fake "payment completed" events grant free access | Verify webhook signature via PayPal's `Verify Webhook Signature` API on every event; never trust client-side "payment success" redirects alone |
| **SQL injection** | Data breach/corruption | Use parameterized queries/ORM exclusively; no string-concatenated SQL, especially in dynamic filter-building for search |
| **Mass data exfiltration via export feature** | Entire dataset walked out via repeated exports | Queue-based exports with quota + audit log, cap rows per export, log every export with user/IP |
| **Credential stuffing / brute force login** | Account takeover | Rate limit + account lockout/backoff, bcrypt/argon2 with proper cost factor, breached-password check (e.g., HaveIBeenPwned API) |
| **Insecure direct object references** (`/leads/:id` guessing) | Enumeration of full dataset bypassing search limits | Rate limit by ID pattern too, don't assume search-only access is the only vector |
| **Admin dashboard exposure** | Full data/user control if compromised | Separate subdomain, IP allowlist optional, mandatory MFA for admin/super_admin roles |
| **Dependency vulnerabilities** | RCE, supply chain attack | `npm audit`/Snyk in CI, lockfile discipline, minimize dependencies |
| **Sensitive data in logs** | PII leakage via log aggregation tools | Redact email/tokens in logging middleware |
| **CSRF on cookie-based flows** | Unauthorized actions | SameSite=strict cookies for refresh token, CSRF token on state-changing admin routes |
| **CORS misconfiguration** | Unauthorized cross-origin API access | Explicit allowlist of frontend origins, no wildcard `*` with credentials |

**Compliance note:** since the dataset includes personal contact information at scale, review GDPR/CCPA obligations (lawful basis for holding the data, opt-out/deletion requests, data source provenance) — this is a legal question outside what I can advise on, but it's worth a lawyer's review before launch, especially given how much of your value proposition is exposing PII.

---

## 7. Non-Functional Requirements

- **Performance:** search queries should return in <300ms at p95 for indexed filters on 5M rows; use `EXPLAIN ANALYZE` during development, not just at launch.
- **Caching:** cache popular filter combinations and country/industry facet counts in Redis (TTL 5–15 min) to avoid recomputing aggregates per request.
- **Backups:** daily PostgreSQL backups + point-in-time recovery (WAL archiving) given the dataset is effectively your product.
- **Environment separation:** never point a dev/staging environment at the production dataset with production credentials.



---

## 8. CSV Import: Out-of-Memory Fix & Row-Limit Support

**Why large uploads ran out of memory.** The original import pipeline had two
places that buffered the whole file in memory at once:

1. The frontend called `file.text()`, which read the entire CSV into a single
   string and sent it as a JSON request body (`{ csv: "<entire file>" }`).
2. The backend used `csv-parse/sync`'s `parse()`, which materialised *every
   row* into a JavaScript object array before a single row was inserted.

For a 1 012 493-row file this means the full text plus an array of ~1M objects
(plus 4 fingerprint hashes each) all live in the Node heap at the same time —
easily exceeding the default heap and crashing with "out of memory".

**Fix (now in place).**
- Imports accept `multipart/form-data` and the uploaded file is **streamed**
  straight into the CSV parser — the file is never read into memory (see
  `importLeadsFromStream` in `backend/src/services/leadService.js`).
- The parser is the streaming `csv-parse` (not `/sync`), so rows are yielded
  one at a time.
- `bulkInsertFromIterable` holds only one batch (1 000 rows) in memory at a
  time and geo-maps / dedups / inserts inside one transaction.

**Limiting how much is read ("from start to end").** The `/api/leads/import`
endpoint now accepts optional `limit` and `offset` (query or body/form):

- `limit` — how many **data rows** to import, starting from the beginning of
  the file. Unset / `0` imports everything.
- `offset` — how many data rows to skip before importing (for reading a window,
  e.g. re-running rows 100 001–150 000).

The response's `total` always reflects the whole file, so you can see how many
rows were left over. The admin **Import CSV** page exposes a "Max rows to
import" field that sends `limit` and streams the file via multipart.
