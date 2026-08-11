# FreeLeads — Workflows: Spec vs. Current Repo (Gap Analysis)

> Basis: the FreeLeads plugin workflows document you sent, cross-referenced against
> (a) everything actually built in this repo (backend `src/` + frontend `src/` +
> DB migrations) and (b) the in-repo spec `leads-webapp-dev-doc.md`, which contains
> the source-of-truth design for quotas/subscriptions/usage logging.
>
> ⚠️ The attached PDF (`freeleads-plugin-workflows.pdf`) still never landed on the
> filesystem (no `.pdf` exists anywhere in the sandbox), so I could not read its
> exact text. This document is based on the repo + the spec doc, and calls out the
> flows you asked about (search quota, download quota) directly.

---

## 1. What the spec wants (quotas & monetization), per `leads-webapp-dev-doc.md`

The spec describes a freemium model where **tiers are enforced by usage quotas**, not just by masking:

- **Plans** — `free` / `pro` / `business`, each with:
  - `monthly_lead_quota` (how many lead *views/downloads* per month)
  - `daily_search_quota` (how many searches per day)
  - `can_export` (bool — whether CSV export is allowed at all)
  - `billing_cycle` (`monthly`/`yearly`), `price_cents`, `paypal_plan_id`
- **Subscriptions** — per-user active plan, period start/end, PayPal subscription id.
- **Payment transactions** — PayPal orders + webhook payloads.
- **Usage tracking** — `usage_logs` rows (`action` = `search`, `view_lead`, `export`) to *enforce* quotas.
- **Quota middleware** — ties the plan's quota to `usage_logs` (the enforcement point).
- **API keys** — for API-plan customers.
- **Saved lists** — saved searches/lists to drive retention.
- **Export** = server-side, **queued, quota-checked, capped per row, and audited** (the §6 security table explicitly: *"Queue-based exports with quota + audit log, cap rows per export, log every export with user/IP"*).
- Full journey test: *signup → search → hit free quota → subscribe via PayPal sandbox → unlocked access*.

---

## 2. Flows that EXIST in the current repo

### Auth & account (fully built)
- Register → email verification code → resend → login → refresh → logout.
- JWT access (15 min) + httpOnly refresh cookie with rotation & reuse detection.
- Forgot / reset password (with token revocation of all sessions).
- `GET/PATCH /api/auth/me` — profile incl. map-picked location.
- Rate limiting (Redis) on register/login/verify/resend/forgot/reset + a global limiter.

### RBAC & admin (built)
- Roles/permissions tables + `requireRole` / `requirePermission` middleware, deny-by-default.
- Seeded roles: `super_admin`, `admin`, `editor`, `user`.
- Admin endpoints: list users, view user, create user, assign/remove role, toggle active, list roles.
- Frontend: `/admin` dashboard (Overview, Leads, Add Lead, Import CSV, Users, Roles) behind AuthGuard + RoleGuard.

### Leads data layer (built)
- `GET /api/leads` — keyset pagination (no `OFFSET`), filters (country/region/city/industry), full-text `tsvector`, "Near Me" PostGIS radius search.
- `GET /api/leads/:id`, `GET /api/leads/stats`.
- `POST /api/leads` (single, editor/admin/super_admin).
- `POST /api/leads/import` — CSV → UNNEST batch insert, geo-mapping, per-row error report.
- **Field masking** at the service layer: non-paid users get masked email (`s****@…`) and `NULL` social/website/about.
- Frontend `/app` directory: search, industry filter, Near Me, card grid, detail modal, save-to-local list, export CSV.

---

## 3. Flows that DO NOT exist — the gaps

This is the important part. Your two examples (**search quota**, **download quota**) are both **absent**, and they're part of a whole **billing/quota subsystem** that was never built.

### ❌ 3.1 Search quota (`daily_search_quota`) — MISSING
- There is **no quota counter** on `GET /api/leads`. A free user can search **unlimited times**.
- The only protection is the Redis **rate limiter** (`globalLimiter` = 100 req/60s default), which is a *request-rate* cap, **not** a *daily usage quota*. It is per-IP-ish, not per-user plan, and it resets every minute — a free user could scrape the whole catalog by pacing requests.
- No `usage_logs` rows are written for `search` actions. No per-user daily counter in Redis/DB.

### ❌ 3.2 Download / export quota (`monthly_lead_quota`, `can_export`) — MISSING
- **Server-side export is effectively open to any admin/super_admin** — `exportLeads()` in `leadService.js` checks only `is_paid` (which is just *"has admin/super_admin role"*), then exports up to **10,000 rows in one synchronous response**:
  ```js
  if (!is_paid) throw new ApiError(403, "Only paid users can export leads");
  const { leads } = await getLeads({ ...filters, limit: 10000, is_paid: true });
  ```
- **No quota check, no cap other than the hardcoded 10k, no queue/background job, no audit log, no per-user export count.**
- Worse: the **frontend doesn't even use the backend export endpoint**. The "Export CSV" button in the directory runs `exportLeadsToCsv()` **fully client-side** in the browser (`savedLeads.js`) — it builds a CSV from whatever the page already loaded. So the export path completely bypasses any server-side authorization/quota/logging. A logged-in user can export whatever search results they see, regardless of plan.

### ❌ 3.3 Subscription & PayPal billing subsystem — MISSING (whole Module 3)
None of these exist in code or DB:
- `plans`, `subscriptions`, `payment_transactions`, `usage_logs`, `api_keys`, `saved_lists`, `saved_list_leads` tables — **none are in the 3 migrations** (`001` auth, `002` leads, `003` profile).
- No `GET /api/plans`, no `POST /api/billing/subscribe`, no `POST /api/billing/webhook`, no `GET /api/billing/me`.
- No PayPal Subscriptions create/approve flow, no webhook signature verification (`BILLING.SUBSCRIPTION.*`, `PAYMENT.SALE.COMPLETED`).
- No frontend billing/account page (upgrade/cancel), no plan selection, no subscription status UI.

### ❌ 3.4 `is_paid` is fake / not subscription-aware
- In `leadController.js`, "paid" is decided by:
  ```js
  const is_paid = req.user && (req.user.roles.includes("admin") || req.user.roles.includes("super_admin"));
  ```
- So a paying **regular `user`** with an active Pro subscription is still treated as **free** — they get masked emails and are blocked from export. There is **no link between a user's subscription and their access level**.

### ❌ 3.5 Lead-view quota (`view_lead`) — MISSING
- No per-user limit on how many lead details (`GET /api/leads/:id`) a free user can open per day/month.

### ❌ 3.6 Export abuse protection (per §6 security table) — MISSING
- No queue, no per-export row cap, no audit log, no watermark/canary records, no ID-pattern rate limiting on `/api/leads/:id`, no CAPTCHA after suspicious velocity.

### ❌ 3.7 API keys / developer API plan — MISSING
- `api_keys` table and any key-based auth don't exist.

### ❌ 3.8 Saved lists (retention flow) — MISSING
- The frontend has a **localStorage** "saved leads" list (`savedLeads.js`), but it's per-browser only. There's no server-side `saved_lists` / `saved_list_leads`, no sync across devices, no saved-search persistence.

---

## 4. Quick reference table

| Flow | In repo? | Where / Status |
|---|---|---|
| Register → verify → login | ✅ | `authRoutes.js` + `authService.js` |
| JWT access + httpOnly refresh rotation | ✅ | `security.js` |
| Forgot / reset password | ✅ | `authService.js` |
| Profile + map location picker | ✅ | `PATCH /api/auth/me`, `/app/profile` |
| RBAC + roles/permissions | ✅ | `middleware/auth.js`, `adminRoutes.js` |
| Lead search/filter/pagination | ✅ | `leadService.getLeads` (keyset, no OFFSET) |
| Near-Me geo search (PostGIS) | ✅ | `ST_DWithin` in `getLeads` |
| Field masking for free tier | ✅ | `leadService` (`s****@…`) |
| Lead import (CSV → UNNEST) | ✅ | `importLeadsCsv` |
| **Daily search quota** | ❌ | none — unlimited searches |
| **Monthly lead/download quota** | ❌ | none |
| **Export enabled flag per plan** | ❌ | none |
| Server-side queued/audited export | ❌ | synchronous, role-only, ≤10k, client-side in frontend |
| Plans / subscriptions tables | ❌ | no migration |
| PayPal billing + webhook | ❌ | no endpoints |
| `usage_logs` quota enforcement | ❌ | no table, no middleware |
| Saved lists (server-side) | ❌ | only client localStorage |
| API keys | ❌ | none |
| Subscription-aware `is_paid` | ❌ | role-based stub only |

---

## 5. What building the quota flows would take

To close the gaps you care about (search + download quotas), the minimal build is:

1. **New migration `004_billing_usage.sql`**: `plans`, `subscriptions`, `payment_transactions`, `usage_logs`, `api_keys`, `saved_lists`, `saved_list_leads`; add `plan_id`/subscription status columns or resolve via `subscriptions`. Seed the 3 default plans (`free`/`pro`/`business`) with `daily_search_quota`, `monthly_lead_quota`, `can_export`.
2. **Quota middleware/service** (`quotaService.js`):
   - Resolve the user's active subscription → effective quota.
   - On `search`: increment a **daily counter** (Redis key `quota:search:{userId}:{yyyymmdd}`) and reject `429` when it exceeds `daily_search_quota`; also write a `usage_logs` row.
   - On `view_lead`: increment monthly counter (Redis + `usage_logs`), reject when over `monthly_lead_quota`.
   - On `export`: require `can_export` + quota, enqueue a job, cap rows, write audit log.
3. **Wire it into routes** (`leadRoutes.js`) so every `GET /api/leads`, `GET /api/leads/:id`, and `POST /api/leads/export` passes through quota checks.
4. **Make `is_paid` subscription-aware** in `leadController.js` (active subscription → paid, not just role).
5. **Point the frontend export at the server endpoint** instead of the client-side `exportLeadsToCsv` (or at least gate it behind a server call that checks `can_export`).
6. (Full monetization) PayPal subscriptions + webhook signature verification + `/api/billing/*` + a billing page.

> Until step 2–5 are done, the "free tier" is effectively **unlimited search + unlimited client-side export**, and nobody can pay to unlock more — the quota and monetization flows simply don't exist yet.
