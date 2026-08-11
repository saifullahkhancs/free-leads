# FreeLeads — WordPress Plugins Workflows vs. Current Node/React Repo

> Comparison of the two production WordPress plugins (FreeLeads Pro + freeLeads.site
> Manager) against the current repo (`free-leads`: Node/Express/Postgres/Redis backend
> + React frontend).
>
> Legend: ✅ = equivalent built · 🔶 = partial / different approach · ❌ = not present.

---

## 0. Architecture — fundamental differences

| Dimension | WordPress plugins | Current repo |
|---|---|---|
| Stack | PHP + WordPress + MySQL ($wpdb) | Node.js + Express + PostgreSQL (+PostGIS) + Redis |
| Auth | Native WP sessions (`wp_signon` / cookies) | JWT access token + httpOnly refresh cookie (rotation) |
| Lead model | **Businesses**: `business_name, owner_name, phone, email, website, revenue, num_employees` | **People**: `full_name, headline, email, linkedin/twitter/facebook, industry, job_title, company_name` |
| Access control | Binary: WP `manage_options` (Admin) vs. everyone | Multi-role RBAC (`super_admin/admin/editor/user`) |
| Paid gate | Plan quota system (search/day, export/day, formats) | Not built (only role-based masking) |

**Bottom line:** these are two different architectures and two different data models. The
current repo is a rewrite on a different stack, so the comparison is about **feature
equivalence**, not code porting.

---

## 1. Authentication workflows

### 1.1 Registration — 🔶 partial
| Step (WP) | In repo? | Notes |
|---|---|---|
| CSRF nonce | 🔶 | No nonce; JSON body + CORS credentials (no classic CSRF since no cookie auth) |
| Honeypot bot-trap | ❌ | Not present |
| Per-IP lockout | 🔶 | Redis rate limiter on register (5/min default) but no escalating lockout |
| Validate email/password rules | ✅ | zod validators (`authValidators.js`) |
| Generic "already exists" (no enumeration) | ✅ | `register()` returns generic message, also on unique-violation race |
| Password hashing | ✅ | **argon2id** (WP uses phpass/bcrypt-class) |
| Auto-login after register | 🔶 | WP logs in immediately; here you must go through verify-code → login |
| Email verification | ✅ **adds this** | WP has no verify step; repo requires 5-digit code verification |
| Assign free plan / redirect to plan picker | ❌ | No plans/subscriptions concept |
| Audit log | 🔶 | `audit_logs` table **exists but is never written to** |

### 1.2 Login — ✅ mostly
| Step | In repo? | Notes |
|---|---|---|
| Generic "Invalid credentials" (no enumeration) | ✅ | `login()` throws same 401 for bad user/password |
| Deactivated-account check | ✅ | `!user.is_active` → 403 |
| Unverified-account re-send | ✅ | re-sends verification code → 403 |
| Per-IP escalating lockout (15m→1h→24h) | 🔶 | Redis rate limiter (fixed 10/min) — **no escalation tiers** |
| Failure audit logging | 🔶 | audit table exists but not written |
| Session/jwt issuance | ✅ | access + refresh with rotation |

### 1.3 Google OAuth login — ❌
Not present at all. No Google OAuth, no `state` nonce flow, no auto-provisioning.

### 1.4 Forgot password — ✅
- Nonce/honeypot: honeypot absent (❌); but flow exists.
- Per-IP lockout on forgot: 🔶 (rate limiter only, no escalation).
- Record failure for every attempt regardless of account existence: 🔶 (repo doesn't record, but also doesn't leak — the repo just doesn't distinguish; need to check response timing — it returns 404 "User not found" on missing user, which **is** an enumeration signal, unlike WP which always succeeds).
  - Actually repo `resendVerification`/`forgotPassword` throws 404 on missing user. WP deliberately returns success always. So repo **leaks account existence**. → 🔶/❌ gap.
- Delegates secure token to core: ✅ repo generates its own reset token (jti) stored hashed, one-time-use, revokes all sessions on reset.

### 1.5 Rate limiting & lockout primitives — 🔶
| WP primitive | Repo equivalent |
|---|---|
| Per-IP, per-action failure counters (`login/register/forgot`) | Redis `express-rate-limit` per-route (register 5, login 10, verify 10, resend 3, forgot 5, reset 5) |
| Escalating lockout tiers (15m→1h→24h) | ❌ fixed windows only |
| `flapp_throttle_user` per-user throttle (search 30/min, export 10/min) | ❌ no per-user throttle |
| Lockout wait-time messaging | ❌ returns generic 429 only |

---

## 2. Billing & quota — the big missing area

### 2.1 Plan configuration — ❌
| WP plan | Current repo |
|---|---|
| 4 tiers with daily search / daily export / max-per-export / allowed formats | **No plan concept exists** |
| Free: 3 searches/day, 500 exports/day, max 500/export | ❌ |
| DB-editable overrides + live PayPal price overlay | ❌ |

### 2.2–2.5 PayPal subscription create / cancel / upgrade / webhook — ❌
- No `/api/plans`, no `/api/billing/subscribe`, no `/api/billing/webhook`, no `/api/billing/me`.
- No `plans`, `subscriptions`, `payment_transactions` tables.
- No webhook signature verification (the spec's `verify-webhook-signature`).
- No "pending → active only on ACTIVATED webhook" trust model.

### 2.6 Quota check-and-increment (atomic) — ❌
- No `usage_logs`, no plan lookup, no row-lock/transaction quota enforcement.
- The only guard is the Redis global rate limiter (requests/min) — **not** a per-user daily quota.
- Concurrency-safe TOCTOU protection (`SELECT ... FOR UPDATE`) doesn't exist because the whole quota system doesn't exist.

---

## 3. Search & export

### 3.1 Search — 🔶 partial
| WP step | In repo? | Notes |
|---|---|---|
| Login required | ✅ | `GET /api/leads` behind `authenticate` |
| Daily quota reset by user's local date | ❌ | none |
| Per-user throttle (30/min) | ❌ | only global/request-rate limiter |
| Sanitize/cap filter params (100 chars) | 🔶 | zod validates some; no explicit length caps on q/industry |
| **Atomic quota check before running query** | ❌ | none |
| Search engine delegation (Meilisearch) | ❌ | Postgres `tsvector` full-text instead (a fine substitute, but no external engine switch) |
| Parameterized WHERE on normalized *_id columns + composite index | ✅ | `country_id/region_id/city_id/industry` filters + indexes; but **not** normalized to lookup tables like WP's categories/industries (repo stores `industry` as free text column, filters directly) |
| COUNT + paginated SELECT (LIMIT 50) | ✅ | keyset pagination `LIMIT 50` default |
| Hydrate *_id → names | ✅ | LEFT JOINs to countries/regions/cities |
| Return updated quota numbers in response | ❌ | no quota to report |

### 3.2 Export — ❌ (and currently bypasses the server entirely)
| WP step | In repo? | Notes |
|---|---|---|
| Login + per-user throttle (10/min) | 🔶 | export endpoint requires auth+role; no per-user throttle |
| Format whitelist (csv/excel/pdf/json) + plan-allowed formats | ❌ | CSV only; no plan gating |
| Clamp to plan max-per-export | ❌ | hardcoded 10k cap in `exportLeads` |
| Chunked streaming for large exports (memory-safe) | ❌ | synchronous, loads 10k rows into memory |
| Quota check before/inline export | ❌ | only role check |
| Format handlers (csv/xlsx/pdf/json) | ❌ | CSV only |
| Audit log every export | ❌ | none |

**Critical finding:** the frontend "Export CSV" button **never calls the backend** —
`DirectoryPage.handleExport()` → `exportLeadsToCsv()` in `savedLeads.js` builds the CSV
100% in the browser from whatever rows are on screen. So export fully bypasses
authorization, quota, format gating, and logging. The WP flow at least ran server-side.

---

## 4. Import & database architecture

### 4.1 Chunked import (AJAX, admin) — 🔶 partial (import exists, chunked/admin UI differs)
| WP step | In repo? | Notes |
|---|---|---|
| Chunk cap (500 rows) | 🔶 | repo batches by 1000 rows in one request (no client chunking) |
| Batch-resolve lookup IDs once per unique value | ✅ | `GeoMapper` resolves country/region/city; dedup within batch by geography |
| **SHA1 email hash dedup across whole history** | ❌ | no hash-based dedup at all — no `lead_hashes` table, no duplicate detection |
| Multi-row INSERT (one round-trip) | ✅ | UNNEST batch insert |
| Record hashes for future dedup | ❌ | none |
| Meilisearch index queue | ❌ | none |
| Import role-gated | ✅ | editor/admin/super_admin |
| Per-row error report | ✅ | `{imported, failed, errors}` |

### 4.2 Database architecture differences
| WP technique | In repo? | Notes |
|---|---|---|
| Normalized lookup tables (category/industry/country/state/city → smallint ids) | 🔶 | Geo (countries/regions/cities) is normalized; **industry is free text**, no categories table |
| Hash partitioning (16 partitions) | ❌ | single table |
| Logical sharding (`category_id % shard_count`, separate PDO/DSN) | ❌ | single DB |
| Dedup email_hash + global hash table | ❌ | none |
| Denormalized `has_email/has_phone` quality flags for covering index | ❌ | none |
| ROW_FORMAT=COMPRESSED | ❌ | default |
| Search engine abstraction (MySQL LIKE vs Meilisearch) | ❌ | Postgres tsvector only |

---

## 5. freeLeads.site Manager — Import pipeline

### 5.1 Chunked upload (direct-to-disk) — ❌
- Repo has no file upload path at all; the import accepts **raw CSV text in the JSON body** (`POST /api/leads/import` with `{csv}`). No chunk_init/store/assemble, no direct-to-disk streaming, no legacy `$_FILES` path.
- This also means repo is bound by `express.json({limit:'10mb'})` for imports, whereas WP's chunked path exists specifically to bypass size limits.

### 5.2 Preview & field-mapping — ❌
- No file-type sniffing, no sample-row preview, no auto field-mapping with synonym dictionary, no state→country inference UI. Repo expects columns in a fixed expected shape and parses with `csv-parse`.

### 5.3 Mapped import — ❌
- No human-confirmed field-mapping step; no dedup fingerprints (email/phone/website/biz hash).

### 5.4 External ingest REST API (HMAC + nonce + timestamp) — ❌
- No `POST /wp-json/freeleads/v4/ingest` equivalent.
- No Bearer token with `hash_equals`, no timestamp freshness window, no nonce replay table, no HMAC-SHA256 signature.
- The repo does have a `source` field on leads (`csv_upload`/`manual`), but no authenticated machine-to-machine ingest endpoint.

---

## 6. Admin data tools

| WP tool | In repo? | Notes |
|---|---|---|
| Bulk actions (delete / change_cat / mark_dup / mark_unique) | ❌ | admin can create/import but no bulk row ops, no dup marking |
| Inline update (whitelisted fields) | ❌ | no inline editor; admin has no lead-edit endpoint at all |
| Dedup engine (pure-SQL self-join, preview/mark/delete) | ❌ | none |
| Category / non-dup cleanup | ❌ | none |
| Stats cards + server-side DataTables grid | 🔶 | `/api/leads/stats` + admin Leads page, but simpler |
| Custom columns (tbl_custom_cols) | ❌ | fixed schema |
| Manual cache clear | 🔶 | Redis cache; no admin cache-bust endpoint |

---

## 7. Cross-cutting security patterns

| WP pattern | In repo? | Notes |
|---|---|---|
| Nonce on every state-changing handler | 🔶 | No nonces; CORS+JWT instead (no cookie-CSRF surface) |
| Role/`manage_options` authorization | ✅ | `requireRole` / `requireAdmin` / `requirePermission` |
| Outbound HTTP timeouts + sslverify | 🔶 | geoService calls exist; check timeouts; **no outbound PayPal/Google yet** |
| Regex-validate IDs before external API use (SSRF guard) | 🔶 | no external API with IDs yet |
| Parameterized SQL everywhere | ✅ | `pg` parameterized queries |
| Generic no-enumeration error messages | 🔶 | login is generic, but **forgot-password returns 404 on missing user** (enumeration leak vs WP's always-succeed) |
| Audit logging (`flapp_audit_log`) | 🔶 | `audit_logs` table created but **never written to** in the repo |

---

## Summary of the biggest gaps (vs. the working WP plugins)

1. **No quota/billing system at all** — plans, subscriptions, usage_logs, PayPal webhook,
   atomic quota enforcement, per-user search/export throttling are all absent. The WP
   plugin's core value (free tier with hard quotas + paid unlock) is not reproduced.
2. **Export is client-side only** in the frontend — it bypasses the server entirely, so
   there's no authorization/quota/audit; the WP flow was server-side and gated.
3. **No dedup engine** — the WP import had email-hash dedup + a full dedup admin tool; the
   repo has neither.
4. **No external ingest API** — no HMAC-signed machine-to-machine endpoint (WP had one).
5. **No Google OAuth** — WP had it; repo is email-only.
6. **Audit log is a dead table** — schema exists, nothing writes to it.
7. **Forgot-password leaks account existence** — WP deliberately never did.
8. **No per-user escalating lockout** — only fixed request-rate limiters.
9. **Lead data model differs** — businesses (WP) vs. people/profiles (repo); not a "gap" but
   means the schemas and fields aren't interchangeable.
