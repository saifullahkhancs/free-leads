# FreeLeads — Workflows Master Document

> Complete inventory of every workflow in the FreeLeads product, mapped onto the
> **current Node.js/Express/PostgreSQL/Redis + React repo** (`free-leads`).
>
> Two sources were reconciled:
> 1. **The current repo** — what is actually built today (`backend/src/**`,
>    `frontend/src/**`, `backend/src/db/migrations/**`).
> 2. **The two production WordPress plugins** (FreeLeads Pro + freeLeads.site Manager)
>    — the previous, working product. Their workflows are **translated** below into
>    concrete this-repo implementation terms (files, tables, routes, functions).
>
> Status legend:
> - 🟢 **Implemented** — exists and works in this repo.
> - 🟡 **Partial** — exists in some form, but not equivalent to the previous product.
> - 🔴 **Not implemented** — absent; includes the concrete plan to build it here.

---

## PART A — AUTHENTICATION & ACCOUNT

### A1. Registration — 🟡 Partial
**Current state (this repo):**
- `POST /api/auth/register` → `authRoutes.js` → `authController.register` → `authService.register`.
- Validates via zod (`registerSchema` in `src/validators/authValidators.js`).
- Hashes password with **argon2id** (`security.js`).
- Returns a **generic** message if the email already exists (no enumeration).
- Sends a 5-digit verification email, but the account is **not** logged in until verified.

| WP-plugin step | Status here | Repo translation |
|---|---|---|
| CSRF nonce | 🟡 | No nonce needed (no cookie auth); relies on CORS + JSON body |
| Honeypot bot trap | 🔴 | Not present |
| Per-IP lockout | 🟡 | Redis rate limiter (5/min) on the route; no escalating lockout |
| Email/password validation | 🟢 | `authValidators.js` |
| Generic "already exists" | 🟢 | `authService.register` returns generic message |
| Argon2 / bcrypt-class hashing | 🟢 | `hashPassword()` argon2id |
| Auto-login after register | 🟡 | Must verify code → login instead |
| Email verification | 🟢 **repo extra** | `POST /api/auth/verify-email` |
| Assign free plan / redirect to plan picker | 🔴 | No plan concept yet |
| Audit log of registration | 🔴 | `audit_logs` table unused |

**To reach full parity:** add honeypot field + per-IP escalating lockout + write an
`auditService` (see 🔴 #6). Plan assignment depends on the quota system (🔴 #1).

---

### A2. Login — 🟢 Implemented
**Current state:**
- `POST /api/auth/login` → `authController.login` → `authService.login`.
- Generic "Invalid credentials" on bad email/password (no enumeration).
- Blocks deactivated accounts (`is_active = false` → 403).
- Re-sends a verification code if the email isn't verified yet.
- Issues access JWT (15 min) + refresh JWT, refresh persisted **hashed** in
  `refresh_tokens` with rotation/reuse detection, delivered as httpOnly cookie.

| WP-plugin step | Status here | Repo translation |
|---|---|---|
| Generic invalid-credentials message | 🟢 | `login()` → 401 "Invalid credentials" |
| Deactivated-account block | 🟢 | `!user.is_active` → 403 |
| Per-IP escalating lockout (15m→1h→24h) | 🟡 | Fixed Redis limiter (10/min); no tiers (see 🔴 #8) |
| Failure audit logging | 🔴 | Not written (see 🔴 #6) |
| Session issuance | 🟢 | JWT access + refresh with rotation |

---

### A3. Google OAuth Login — 🔴 Not implemented
**Current state:** Not present. Auth is email + password + verification code only.
`grep -ri google backend/src` → only a Google Fonts import on the frontend.

**Repo translation (how to build it here):**
- Add `google_id VARCHAR` + `google_sub` columns to `users` (migration `004` or `005`).
- New endpoints:
  - `GET /api/auth/google/url` → returns the Google consent URL (store the `state` nonce
    in Redis, return it).
  - `GET /api/auth/google/callback?code=...&state=...` → verify `state` against Redis,
    server-side POST to `https://oauth2.googleapis.com/token`, fetch userinfo, upsert the
    user (auto-provision with a random password if new), link `google_id`, issue JWTs.
- New files: `src/services/googleService.js` (token exchange + userinfo fetch),
  `src/controllers/authController.js` (+handlers), `src/routes/authRoutes.js` (+routes).
- Frontend: "Continue with Google" button on `LoginPage.jsx` / `SignupPage.jsx` that
  redirects to `/api/auth/google/url`.
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in
  `.env.example` + `config/env.js`.

---

### A4. Forgot / Reset Password — 🟡 Partial (has an enumeration leak)
**Current state:**
- `POST /api/auth/forgot-password` → `authService.forgotPassword`.
- `POST /api/auth/reset-password` → `authService.resetPassword` (token one-time-use,
  revokes all refresh tokens).

**Gap (regression vs. WP):** `forgotPassword` throws `ApiError(404, "User not found")`
when the email isn't registered → **leaks account existence**. The WP plugin deliberately
always returned the same outcome.

**Repo translation (fix):**
- In `authService.forgotPassword`, do **not** throw 404. Return a generic success message
  in both cases ("If that email exists, a reset link has been sent"). Only generate/send
  the token when the user exists. Optionally record a failure counter regardless of
  existence (see 🔴 #8).

---

### A5. Rate Limiting & Lockout — 🟡 Partial
**Current state:**
- Redis-backed `express-rate-limit` per route in `src/middleware/rateLimiter.js`:
  register 5/min, login 10/min, verify 10, resend 3, forgot 5, reset 5 + a global 100/min.
- Keyed by IP; fixed windows; generic `429`.

| WP primitive | Status here | Repo translation |
|---|---|---|
| Per-IP, per-action failure counters | 🟡 | Route limiters; not tied to success/failure |
| Escalating tiers (15m→1h→24h) | 🔴 | See 🔴 #8 |
| Per-user throttle (search 30/min, export 10/min) | 🔴 | See 🔴 #8 |
| Lockout wait-time message | 🔴 | Returns generic 429 only |

---

## PART B — ACCESS CONTROL (RBAC)

### B1. Roles & Permissions — 🟢 Implemented
**Current state:**
- Tables: `roles`, `permissions`, `role_permissions`, `user_roles` (migration `001`).
- Seeded (`src/db/seed.js`): `super_admin` / `admin` / `editor` / `user`;
  permissions `users.read`, `users.manage`, `roles.manage`, `leads.read`,
  `leads.export`, `admin.access`.
- Middleware: `authenticate`, `requireRole(...)`, `requirePermission(...)`,
  `authenticateOptional` in `src/middleware/auth.js`. Deny-by-default.

### B2. Admin User & Role Management — 🟢 Implemented
- `src/routes/adminRoutes.js` + `src/controllers/adminController.js`:
  - `GET /api/admin/users`, `GET /api/admin/users/:id`
  - `POST /api/admin/users` (create user, auto-verify, assign role)
  - `PATCH /api/admin/users/:id/role` (assign/remove, self-demotion guard)
  - `PATCH /api/admin/users/:id/active` (deactivate, self-guard)
  - `GET /api/admin/roles`
- Frontend: `/admin` dashboard (`UsersPage.jsx`, `RolesPage.jsx`) behind `RoleGuard`.

---

## PART C — LEADS DATA LAYER

### C1. Lead Search & Filter — 🟢 Implemented
**Current state:**
- `GET /api/leads` → `leadController.getLeads` → `leadService.getLeads`.
- Keyset pagination (`id > cursor`, `LIMIT`), **no OFFSET** (per `rules.md`).
- Filters: `q` (full-text `tsvector`), `country_id`, `region_id`, `city_id`, `industry`,
  plus `lat`/`lon`/`radius` for "Near Me" PostGIS `ST_DWithin`.
- LEFT JOINs hydrate `country_name`/`region_name`/`city_name`.
- Masked email + nulled socials for non-paid (`leadService`).

| WP-plugin step | Status here | Repo translation |
|---|---|---|
| Login required | 🟢 | route behind `authenticate` |
| Per-user search throttle (30/min) | 🔴 | See 🔴 #8 |
| Sanitize/cap filter params | 🟡 | zod on auth; no explicit 100-char caps on `q`/`industry` |
| Daily search quota (atomic) | 🔴 | See 🔴 #1 |
| Search engine delegation (Meilisearch) | 🟡 | Postgres `tsvector` used instead |
| Parameterized WHERE + composite index | 🟢 | `idx_leads_country_city` etc. |
| COUNT + LIMIT 50 page | 🟢 | keyset + `LIMIT 50` default |
| Return updated quota in response | 🔴 | See 🔴 #1 |

### C2. Lead Detail — 🟢 Implemented
- `GET /api/leads/:id` → `leadService.getLeadById` (masks fields for non-paid).

### C3. Lead Stats — 🟢 Implemented
- `GET /api/leads/stats` → `leadService.getStats` (totals, verified, industries, recent).

### C4. Create Lead (manual) — 🟢 Implemented
- `POST /api/leads` → `leadService.createLead`, editor/admin/super_admin only.
- Resolves free-text geo to `country_id`/`region_id`/`city_id` via `GeoMapper`.

### C5. Lead Import (CSV) — 🟡 Partial
**Current state:**
- `POST /api/leads/import` → `leadService.importLeadsCsv` (editor/admin/super_admin).
- Accepts **raw CSV text** in the JSON body; parses with `csv-parse`; UNNEST batch inserts
  (1000 rows); geo-mapping; per-row error report `{imported, failed, total, errors}`.

| WP-plugin step | Status here | Repo translation |
|---|---|---|
| Client chunked upload (direct-to-disk) | 🔴 | No file upload path; JSON body capped at 10mb |
| Field mapping / preview | 🔴 | Fixed expected column names; no mapping UI |
| **Dedup via email hash** | 🔴 | See 🔴 #3 |
| Multi-row insert (one round-trip) | 🟢 | `insertLeadBatch` UNNEST |
| Per-row error report | 🟢 | `{imported, failed, errors}` |

### C6. Lead Export — 🔴 Not implemented (frontend bypasses server)
**Current state:**
- Backend `POST /api/leads/export` exists (`leadService.exportLeads`) but is trivial:
  checks role-based `is_paid`, loads up to 10,000 rows synchronously, builds CSV.
- **Frontend does not call it.** `DirectoryPage.handleExport()` → `exportLeadsToCsv()`
  (`frontend/src/utils/savedLeads.js`) builds the CSV **100% in the browser**. No server
  auth, quota, format, throttle, or audit is applied.
- Full detail and build plan: see 🔴 #2.

### C7. DB Architecture (schema/indexing) — 🟡 Partial
| WP technique | Status here | Repo translation |
|---|---|---|
| Normalized geo hierarchy | 🟢 | `countries`/`regions`/`cities` tables |
| Normalized category/industry table | 🟡 | `industry` is a free-text column; no `categories` table |
| Dedup hash columns + hash table | 🔴 | See 🔴 #3 |
| `has_email`/`has_phone` quality flags | 🔴 | Not present |
| Hash partitioning / sharding / compression | 🔴 | Single table, default layout |
| Search engine abstraction | 🟡 | Postgres `tsvector` only |

---

## PART D — ADMIN DATA TOOLS (freeLeads.site Manager equivalents)

| WP tool | Status here | Repo translation |
|---|---|---|
| Bulk actions (delete/change_cat/mark_dup/mark_unique) | 🔴 | No bulk lead ops |
| Inline field edit (whitelisted cols) | 🔴 | No lead-edit endpoint at all |
| Dedup engine (preview/mark/delete) | 🔴 | See 🔴 #3 |
| Category / non-dup cleanup | 🔴 | Not present |
| Stats + server-side grid | 🟡 | `/api/leads/stats` + `/admin/leads` (simpler) |
| Custom columns | 🔴 | Fixed schema |
| Manual cache clear | 🟡 | Redis cache; no admin clear endpoint |

---

## PART E — CROSS-CUTTING SECURITY

| WP pattern | Status here | Repo translation |
|---|---|---|
| Nonce on state-changing handlers | 🟡 | N/A (no cookie CSRF); JWT+CORS instead |
| Role/`manage_options` authorization | 🟢 | `requireRole`/`requireAdmin`/`requirePermission` |
| Parameterized SQL everywhere | 🟢 | `pg` prepared statements |
| Generic no-enumeration errors | 🟡 | Login ok; forgot-password leaks (🔴 #7) |
| Audit logging | 🔴 | Table exists, never written (🔴 #6) |
| Outbound HTTP timeouts + TLS verify | 🟡 | `geoService`; no PayPal/Google yet |
| Regex-validate external IDs (SSRF guard) | 🟡 | No external ID calls yet |

---

# PART F — THE 9 MISSING WORKFLOWS (translated into this repo)

Each of the 9 requirements from the previous product, restated in concrete terms for the
**Node/Express/Postgres/Redis + React** repo, with the exact files/tables/routes to create.

---

## 🔴 #1 — Quota & Billing System

**What:** Plans with hard per-day/per-month usage limits + paid upgrades via PayPal. This
is what makes the product monetizable and is the commercial core.

**How to build it here:**

1. **Migration `004_billing_usage.sql`** (new file `backend/src/db/migrations/`):
   ```sql
   CREATE TABLE plans (
     id SERIAL PRIMARY KEY,
     code VARCHAR(30) UNIQUE NOT NULL,        -- 'free' | 'starter' | 'growth' | 'pro'
     name VARCHAR(100) NOT NULL,
     price_cents INT NOT NULL DEFAULT 0,
     billing_cycle VARCHAR(20) DEFAULT 'monthly',
     daily_search_quota INT DEFAULT 0,        -- -1 = unlimited
     daily_export_quota INT DEFAULT 0,
     max_export_per_req INT DEFAULT 100,
     allowed_formats TEXT[] DEFAULT '{csv}',
     paypal_plan_id VARCHAR(100)
   );
   CREATE TABLE subscriptions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     plan_id INT REFERENCES plans(id),
     paypal_subscription_id VARCHAR(150) UNIQUE,
     status VARCHAR(30) NOT NULL DEFAULT 'pending',  -- pending/active/cancelled/past_due/expired
     current_period_start TIMESTAMPTZ,
     current_period_end TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   CREATE TABLE payment_transactions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id),
     subscription_id UUID REFERENCES subscriptions(id),
     paypal_order_id VARCHAR(150),
     amount_cents INT NOT NULL,
     currency VARCHAR(10) DEFAULT 'USD',
     status VARCHAR(30),
     raw_payload JSONB,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   CREATE TABLE usage_logs (
     id BIGSERIAL PRIMARY KEY,
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     action VARCHAR(50),          -- 'search' | 'view_lead' | 'export'
     lead_id BIGINT REFERENCES leads(id),
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```
   Add `plan_code`/free-tier default to the seed in `src/db/seed.js` (or a new
   `src/db/seedPlans.js`).

2. **`backend/src/services/quotaService.js`** (new):
   - `getActivePlan(userId)` — query `subscriptions` joined to `plans`, status `active`;
     default `free` if none.
   - `checkAndIncrement(userId, action, amount)` — mirror `flapp_check_and_increment_quota`:
     daily counter in Redis key `quota:{action}:{userId}:{yyyymmdd}`, increment atomically,
     reject with `429` when over limit; write a `usage_logs` row. Admins/super_admins bypass.
   - `getQuotaStatus(userId)` — returns remaining searches/exports + next plan, for the UI.

3. **Middleware** in `leadRoutes.js`: wrap `GET /`, `GET /:id`, `POST /export` with a
   `requireQuota('search')` / `requireQuota('view_lead')` / `requireQuota('export')`.

4. **Make `is_paid` subscription-aware** in `leadController.js` (replace the role-only stub
   with `quotaService.hasActivePaidPlan(userId)`).

5. **PayPal integration**:
   - `backend/src/services/paypalService.js` (new): create subscription, fetch details,
     OAuth token, cancel.
   - `backend/src/routes/billingRoutes.js` (new): `GET /api/plans`,
     `POST /api/billing/subscribe`, `POST /api/billing/cancel`, `POST /api/billing/upgrade`,
     `POST /api/billing/webhook`, `GET /api/billing/me`.
   - `billing/webhook` verifies PayPal signature (server-side `verify-webhook-signature`),
     then activates subscriptions on `BILLING.SUBSCRIPTION.ACTIVATED`.

6. **Frontend:** `src/api/client.js` + new `BillingPage` / plan-picker under `/admin` or
   `/app/billing`; quota pill on `DirectoryPage.jsx`.

**Files to create/edit:** migration `004`, `quotaService.js`, `paypalService.js`,
`billingRoutes.js`, edits to `leadRoutes.js`, `leadController.js`, `env.js`,
`authRoutes.js` (free-plan assignment), `client.js`, new billing UI.

---

## 🔴 #2 — Server-Side, Gated Export

**What:** Export generated and gated on the server (login + throttle + format whitelist +
quota + row cap + audit), so a user can't walk out the dataset for free.

**How to build it here:**

1. **Rewrite `leadService.exportLeads`** (currently loads ≤10k rows synchronously):
   - Require an active **paid** plan (`quotaService`) or `leads.export` permission.
   - Validate the format against the plan's `allowed_formats` (`csv`/`xlsx`/`pdf`/`json`).
   - Clamp rows to the plan's `max_export_per_req`.
   - For large exports, stream in batches using a Postgres cursor
     (`pg` query with `rows: 1` / a loop over the keyset) instead of one 10k-row array —
     keeps memory bounded.
2. **Enforce export quota** via `quotaService.checkAndIncrement(userId, 'export', rows)`.
3. **Audit every export** via `auditService` (see 🔴 #6).
4. **Per-user export throttle** (see 🔴 #8).
5. **Frontend fix (critical):** change `DirectoryPage.handleExport()` to call
   `POST /api/leads/export` (via `client.js`) and stream/download the response, instead of
   `exportLeadsToCsv()` building the file in the browser. Delete or gate
   `frontend/src/utils/savedLeads.js` export helper.

**Files:** edit `leadService.js`, `leadController.js`, `leadRoutes.js`, `DirectoryPage.jsx`,
`client.js`.

---

## 🔴 #3 — Dedup Engine

**What:** Detect and prevent duplicate leads across the whole dataset and across repeated
imports.

**How to build it here:**

1. **Migration:** add hash columns to `leads`
   (`email_hash CHAR(40)`, optionally `phone_hash`/`website_hash`/`biz_hash`) + a global
   `lead_hashes` table (`id`, `email_hash UNIQUE`, `lead_id`, `created_at`).
2. **At import** — in `leadService.importLeadsCsv`:
   - Compute `SHA1(lowercase(email))` for each row (random hash if no email).
   - Before inserting a batch, `SELECT ... WHERE email_hash IN (...)`, skip existing rows
     (count them), and insert new hashes alongside the leads.
   - Add `skipped` to the result object.
3. **Admin dedup tool** — new `POST /api/admin/leads/dedup` in `adminController.js`:
   - SQL self-join groups rows by chosen hash, `MIN(id)` as keeper; modes `preview` /
     `mark` / `delete`; batch of 2000 with a small delay to avoid long locks.

**Files:** migration `004`/`005`, edit `leadService.js`, `leadController.js`,
`adminController.js`, `adminRoutes.js`, optional admin UI.

---

## 🔴 #4 — External Ingest REST API (machine-to-machine)

**What:** An authenticated endpoint for a scraper/external pipeline to push leads in,
bypassing the admin UI.

**How to build it here:**

1. **Table `api_keys`** (migration): `id UUID`, `user_id`, `key_hash`, `key_prefix`,
   `is_active`, `last_used_at`, `created_at`. Env: `INGEST_API_TOKEN`/`INGEST_HMAC_SECRET`.
2. **New route `POST /api/leads/ingest`** with a 4-layer guard (a `requireIngestAuth`
   middleware in `src/middleware/ingest.js`):
   - Bearer token compared with `crypto.timingSafeEqual` (constant-time).
   - Timestamp freshness (reject if `|clientTs - now| > window`, e.g. 5 min).
   - Nonce replay protection (store used nonces in Redis, reject duplicates).
   - HMAC-SHA256 over `timestamp + nonce + body`, verified with constant-time compare.
3. Reuse `GeoMapper` + `insertLeadBatch`; write via `withTransaction`.

**Files:** migration, `src/middleware/ingest.js`, edit `leadRoutes.js`/`index.js`,
`ingestController.js`/reuse `leadService`.

---

## 🔴 #5 — Google OAuth Login

(Full plan in **A3** above.)

**Files:** migration (add `google_id`), `src/services/googleService.js`, edits to
`authRoutes.js`, `authController.js`, `env.js`, `.env.example`, `LoginPage.jsx`,
`SignupPage.jsx`.

---

## 🔴 #6 — Working Audit Log

**What:** Actually write to the existing `audit_logs` table so there's a real security
trail. Today the table exists but nothing inserts into it.

**How to build it here:**

1. **`backend/src/services/auditService.js`** (new):
   ```js
   async function log({ actorId, action, entityType, entityId, metadata, ip }) {
     await query(
       `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
        VALUES ($1,$2,$3,$4,$5,$6)`,
       [actorId, action, entityType, entityId, metadata, ip]
     );
   }
   ```
2. **Call it** from:
   - `authService.login` (ok/fail), `register`, `verifyEmail`, `forgotPassword`,
     `resetPassword`.
   - `leadController.exportLeads` (every export).
   - `adminController.updateUserRole`, `toggleUserActive`, `createUser`.
3. **Optionally** `GET /api/admin/audit-logs` (the dev doc already lists this route).

**Files:** new `auditService.js`, edits to `authService.js`, `leadController.js`,
`adminController.js`, `adminRoutes.js`.

---

## 🔴 #7 — No-Enumeration Forgot-Password

**What:** Stop `forgot-password` from revealing whether an email is registered.

**How to build it here:**
- In `authService.forgotPassword`, replace the `throw new ApiError(404, "User not found")`
  with a generic success response in both cases; only generate + email the token when the
  user exists. Same for `resendVerification`.

**Files:** edit `authService.js`.

---

## 🔴 #8 — Per-User Escalating Lockout

**What:** Brute-force protection that tracks failures per **user** and **escalates**
(15m → 1h → 24h), plus a per-user throttle on search/export.

**How to build it here:**

1. **`backend/src/services/lockoutService.js`** (new), on top of Redis:
   - `recordFailure(action, key)` where `key` = IP or userId; store count + first-ts.
   - `checkLockout(action, key)` returns remaining wait time; tiers `[900, 3600, 86400]`.
   - `clearFailures(action, key)` on success.
2. **Per-user throttle** for search/export using a Redis windowed counter keyed on
   `userId` (e.g. `throttle:search:{userId}` → 30/min, `throttle:export:{userId}` → 10/min).
3. Wire into `login`/`register`/`forgot` (lockout) and `GET /api/leads` / `POST /export`
   (throttle).

**Files:** new `lockoutService.js`, edits to `authService.js`, `leadRoutes.js`.

---

## 🔴 #9 — Lead Model: Businesses vs. People (architectural decision)

**What:** The WP plugins sell **business** leads (`business_name`, `owner_name`, `phone`,
`revenue`, `num_employees`, `category`). The current repo models **people/professionals**
(`full_name`, `headline`, `about`, `linkedin_url`, `job_title`, `company_name`, `industry`).
Not a bug — a fundamental schema difference that must be decided before building features on
top.

**Option A — keep person model (current):**
- Leave `leads` as-is. #1–#8 still apply unchanged.
- Drop WP concepts that assume businesses (category sharding, phone dedup) or adapt them.

**Option B — switch to business model (match the live WordPress site's "B2B leads" pitch):**
- Migration: add `business_name`, `owner_name`, `phone`, `revenue`, `num_employees` to
  `leads`; add a normalized `categories` table and replace free-text `industry` with a
  `category_id` FK.
- Add `has_email`/`has_phone` denormalized flags.
- Update `leadService.getLeads`, `createLead`, `importLeadsCsv`, `GeoMapper`, all
  validators, and the frontend (`DirectoryPage.jsx`, `LeadDetailModal.jsx`,
  `AddLeadPage.jsx`, `ImportLeadsPage.jsx`).

**Recommendation:** This decision gates how much of #1–#8 needs adapting. If the product
sells business leads, decide Option B **before** building the schema-heavy quota/dedup
layers so you only write them once.

---

## QUICK STATUS TABLE

| # | Workflow | Status |
|---|---|---|
| — | A1 Registration | 🟡 Partial |
| — | A2 Login | 🟢 Implemented |
| — | A3 Google OAuth | 🔴 Not implemented |
| — | A4 Forgot/Reset Password | 🟡 Partial (enumeration leak) |
| — | A5 Rate limiting & lockout | 🟡 Partial |
| — | B1 Roles & permissions | 🟢 Implemented |
| — | B2 Admin user/role mgmt | 🟢 Implemented |
| — | C1 Lead search & filter | 🟢 Implemented |
| — | C2 Lead detail | 🟢 Implemented |
| — | C3 Lead stats | 🟢 Implemented |
| — | C4 Create lead | 🟢 Implemented |
| — | C5 Lead import (CSV) | 🟡 Partial |
| — | C6 Lead export | 🔴 Not implemented (frontend bypasses server) |
| — | C7 DB architecture | 🟡 Partial |
| — | D Admin data tools | 🔴 Mostly missing |
| — | E Cross-cutting security | 🟡 Partial |
| 1 | Quota & billing system | 🔴 Not implemented |
| 2 | Server-side gated export | 🔴 Not implemented |
| 3 | Dedup engine | 🔴 Not implemented |
| 4 | External ingest API | 🔴 Not implemented |
| 5 | Google OAuth login | 🔴 Not implemented |
| 6 | Working audit log | 🔴 Not implemented (dead table) |
| 7 | No-enumeration forgot-password | 🔴 Not implemented (leaks existence) |
| 8 | Per-user escalating lockout | 🔴 Not implemented |
| 9 | Lead model (business vs person) | 🟡 Architectural — needs decision |

**Recommended build order:** #9 (decide model) → #1 + #2 (commercial core, coupled) →
#3 + #6 (cheap high-value quick wins) → #7 + #8 (security) → #4 + #5 (expansion).
