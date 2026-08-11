# FreeLeads — Implementation of the 9 Missing Workflows

This documents what was built in this repo to bring it to feature-parity with the
previous WordPress plugins (FreeLeads Pro + freeLeads.site Manager), translated to the
current Node/Express/Postgres/Redis + React stack.

> **Lead model decision (#9):** Kept the existing **person** model (`full_name`,
> `headline`, `email`, `linkedin`, ...) rather than switching to the business model.
> That's the current app's shape and all the other 8 flows work on top of it. A `phone`
> column was added (used by dedup), but no business-model rewrite was done.

---

## Backend — new files

| File | Purpose |
|---|---|
| `src/db/migrations/004_quota_billing.sql` | `plans`, `subscriptions`, `payment_transactions`, `usage_logs`, `api_keys` |
| `src/db/migrations/005_dedup_google.sql` | `leads.phone` + dedup hash columns + `is_duplicate`/`duplicate_of`, `lead_hashes` table, `users.google_id`/`google_email` |
| `src/services/quotaService.js` | Plan resolution + atomic daily quota enforcement (Redis Lua script) |
| `src/services/auditService.js` | Writes to the previously-dead `audit_logs` table |
| `src/services/lockoutService.js` | Escalating lockout tiers (15m→1h→24h) + per-user throttle |
| `src/services/dedupService.js` | SHA fingerprints + import dedup + pure-SQL admin dedup |
| `src/services/paypalService.js` | PayPal OAuth, subscription lookup/cancel, webhook signature verify (mock mode when no creds) |
| `src/services/googleService.js` | Google OAuth consent URL, state nonce (Redis), token exchange, userinfo |
| `src/controllers/billingController.js` | `GET /api/plans`, `GET /api/billing/me`, subscribe/cancel/upgrade, webhook |
| `src/routes/billingRoutes.js` | Mounts the billing + plans routes |
| `src/middleware/ingest.js` | 4-layer machine-to-machine auth (Bearer + timestamp + nonce + HMAC) |

## Backend — modified files

| File | Change |
|---|---|
| `src/services/leadService.js` | Reworked `exportLeads` to be server-gated (format + row cap + quota + audit); import now dedups + stores hashes; added `ingestLeads`; phone support; `bulkInsertRecords` shared pipeline |
| `src/services/authService.js` | Audit logging on login/register/verify/reset/forgot; escalating lockout on login/register/forgot; generic no-enumeration `resendVerification`; added `googleLogin` |
| `src/services/quotaService.js` | `requireQuota` middleware |
| `src/controllers/authController.js` | Google `url` + `callback` handlers; passes request meta |
| `src/controllers/leadController.js` | `is_paid` is subscription-aware; reworked export; added `ingestLeads`; returns `quota` in search responses |
| `src/controllers/adminController.js` | Added `GET /api/admin/audit-logs`, `POST /api/admin/leads/dedup` |
| `src/routes/leadRoutes.js` | Added per-user throttle + quota middleware on search/view/export; added `POST /api/leads/ingest` |
| `src/routes/authRoutes.js` | Added `GET /api/auth/google/url` + `GET /api/auth/google/callback` |
| `src/routes/adminRoutes.js` | Added audit-logs + dedup routes |
| `src/routes/index.js` | Mounted billing routes |
| `src/config/env.js` / `.env.example` | Added PayPal, Google, ingest, dedup, lockout, quota env vars |
| `src/db/seed.js` | Seeds the 4 plans (free/starter/growth/pro) |

---

## Frontend — new files

| File | Purpose |
|---|---|
| `src/pages/app/BillingPage.jsx` | Plan picker + usage bars + subscribe/upgrade/cancel |
| `src/pages/auth/GoogleCallbackPage.jsx` | Handles the OAuth redirect and logs the user in |

## Frontend — modified files

| File | Change |
|---|---|
| `src/api/client.js` | Added plans/billing/export/google/audit/dedup/ingest API calls; exports `setAccessToken` |
| `src/pages/app/DirectoryPage.jsx` | **Export now calls the server** (was building CSV in the browser); added a quota pill |
| `src/pages/LoginPage.jsx` / `SignupPage.jsx` | "Continue with Google" buttons |
| `src/context/AuthContext.jsx` | Exposes `setUser` (used by Google callback) |
| `src/App.jsx` | Routes for `/app/billing` and `/auth/google/callback` |
| `src/components/AppShell.jsx` | "My Plan & Usage" links in dropdown + mobile drawer |
| `src/styles/app.css` / `auth.css` | Billing + quota-pill + Google-button styles |

---

## How the 9 flows map

1. **Quota & Billing** — `004` migration + `quotaService` (atomic Redis daily counters) +
   `paypalService` + `billingController/routes` + seeded plans + subscription-aware
   `is_paid` + `BillingPage` + quota pill. PayPal runs in **mock mode** (activates
   immediately) until `PAYPAL_CLIENT_ID/SECRET/WEBHOOK_ID` are set.
2. **Server-side gated export** — `leadService.exportLeads` rework + controller; frontend
   export button calls `POST /api/leads/export` and downloads the response.
3. **Dedup engine** — `005` migration + `dedupService`; import skips known duplicates;
   `POST /api/admin/leads/dedup` (preview/mark/delete).
4. **External ingest API** — `api_keys` + `middleware/ingest.js` (Bearer + timestamp +
   nonce + HMAC) + `POST /api/leads/ingest`.
5. **Google OAuth** — `googleService` + `authService.googleLogin` + routes + frontend
   buttons + callback page (hidden unless `GOOGLE_CLIENT_ID` is set).
6. **Audit log** — `auditService` writes to `audit_logs`; wired into auth/export/admin;
   `GET /api/admin/audit-logs`.
7. **No-enumeration forgot-password** — already generic; also fixed `resendVerification`
   to stop leaking account existence.
8. **Escalating lockout** — `lockoutService` (per-IP tiers + per-user search/export
   throttle) wired into login/register/forgot and lead routes.
9. **Lead model** — kept the person model (decision documented above).

---

## Configuration / running

Backend needs Redis + Postgres (existing `docker-compose.yml`). After starting them:

```bash
cd backend
cp .env.example .env   # optionally add PayPal / Google creds
npm install
npm run setup          # runs migrations + seeds (roles, permissions, plans)
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev            # http://localhost:5178
```

Notes:
- **Billing is in mock mode** until `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` are set
  (`PAYPAL_MODE=sandbox` default). `PAYPAL_TEST_WEBHOOK=true` lets you POST a fake
  webhook payload to `/api/billing/webhook` for testing.
- **Google button** appears once `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set and
  `GOOGLE_REDIRECT_URI` points at the frontend `/auth/google/callback`.
- **Ingest** is disabled until `INGEST_API_TOKEN` + `INGEST_HMAC_SECRET` are set.

## Verification done

- All backend files pass `node --check`; `src/app.js` loads with mocked env.
- Frontend `npm run build` (Vite) succeeds cleanly.
- Full DB-backed integration testing wasn't possible in this sandbox (no Postgres/Redis/
  Docker), so the SQL migrations and Redis flows are untested at runtime — worth running
  `npm run setup` locally to confirm, then exercising register → search (watch the quota
  pill) → subscribe (mock) → export.
