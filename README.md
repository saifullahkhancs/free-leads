# Auth System — Node.js + React (JWT + RBAC)

Converted from the `job-easy` FastAPI/React auth flow (register → verify →
login) into the Node.js/Express/React/PostgreSQL/Redis stack specified in
the "Leads Directory Web App" dev document (Module 1 — Foundation + Auth).

## What's included

**Backend** (`backend/`) — Express API
- Register → 5-digit email verification code → login
- JWT access token (15 min) + refresh token (7 days), refresh persisted
  **hashed** in Postgres with rotation and reuse detection
- Refresh token delivered as an **httpOnly, Secure, SameSite=strict cookie**
  (never touches client-side JS) — per the doc's Section 6 security checklist
- Password hashing with **argon2id** (per the doc; the source repo used bcrypt)
- RBAC: `roles` / `permissions` / `role_permissions` / `user_roles` tables,
  `requireRole()` and `requirePermission()` middleware, deny-by-default
- Redis-backed rate limiting on register/login/verify/forgot-password
- Forgot / reset password flow, `/api/auth/me` profile endpoint
- **User profile management**: `PATCH /api/auth/me` — users can update their
  first/last name and their location, picked on a **free Leaflet/OpenStreetMap
  map picker** (`/app/profile`). City, province/state and country are
  auto-filled via **reverse geocoding** (free Nominatim — no API key; or
  Geoapify, 3,000 free credits/day, when `GEOAPIFY_API_KEY` is set).
- Free geocoding proxy endpoints: `GET /api/geo/search?q=...` (place
  autocomplete) and `GET /api/geo/reverse?lat=..&lng=..` (coordinates →
  city/region/country). The browser never calls the provider directly.
- Leads API:
  - `GET /api/leads` — search/filter/keyset-paginated listing (PII masked for
    non-paid tiers)
  - `GET /api/leads/stats` — dashboard overview numbers + industry list
  - `POST /api/leads` — create a single lead manually (editor/admin/super_admin)
  - `POST /api/leads/import` — bulk import leads (editor/admin/super_admin);
    rows are geo-mapped and inserted in UNNEST batches, with a per-row error
    report. The CSV is **streamed** into the parser (never loaded fully into
    memory) so multi-million-row files won't run out of memory. Accepts
    either `multipart/form-data` (`file` field) or JSON `{ csv }`. Optional
    `limit` / `offset` query-or-body fields import only a window of rows
    (e.g. `limit=50000` reads the first 50 000 rows; `offset=100000&limit=50000`
    reads rows 100 001–150 000).
  - `GET /api/leads/:id`, `POST /api/leads/export`
- Postgres migrations + a seed script for default roles/permissions

**Frontend** (`frontend/`) — React (Vite)
- `LandingPage` — public marketing landing page served at `/`. Authenticated
  visitors see their name/email, a **Log out** button, and two entry buttons:
  **Dashboard** (`/admin`) and **App** (`/app`)
- `PlansPage` (`/plans`, `/pricing`) — dedicated public pricing page showcasing
  the 4 membership tiers (**Free**, **Starter**, **Growth**, **Pro**), daily
  search and export limits, allowed file formats (EXCEL, CSV, PDF, JSON), and
  direct signup/checkout links
- `App view` (`/app`) — the leads directory: search, industry filter,
  "Near Me" geo search, responsive card grid, and lead detail modal (`/app/billing` displays your plan & daily usage)
- `Dashboard` (`/admin`) — a responsive CMS-style workspace with a sidebar
  (Overview, Leads, Add Lead, Import CSV, Users, Roles), stat cards, and a
  topbar with the logged-in user's info and logout
- `LoginPage`, `SignupPage` (with inline verification step), `ForgotPasswordPage`,
  `ResetPasswordPage` — ported 1:1 in behavior from the original job-easy pages
- `AuthContext` — holds the access token in memory, silently refreshes it on
  page load using the httpOnly cookie
- `ProfilePage` (`/app/profile`) — edit name + pick your exact location on a
  free Leaflet/OpenStreetMap map: click or drag the pin, search any city/area,
  or use the browser's current location; city, province and country are
  auto-filled by reverse geocoding
- `AuthGuard` (must be logged in) and `RoleGuard` (must have a given role)
  route wrappers
- API client with automatic single-retry-after-refresh on 401s

## Local setup

### 1. Start Postgres + Redis

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# edit .env if needed (DB creds, JWT secrets, SMTP/Resend key, etc.)
npm install
npm run setup     # runs migrations, then seeds default roles/permissions
npm run dev        # http://localhost:8004
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev         # http://localhost:5178
```

The Vite dev server proxies `/api/*` to `http://localhost:8004`, so
`VITE_API_URL` can be left blank in dev.

## Default roles

Seeded by `npm run seed`: `super_admin`, `admin`, `editor`, `user`. New
registrations are assigned `user` by default (see `assignDefaultRole` in
`backend/src/services/authService.js`) — adjust this, and the
`ROLE_PERMISSIONS` map in `backend/src/db/seed.js`, to match your app.

## Notes / things to configure before production

- Generate strong secrets: `openssl rand -hex 32` for both
  `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- Set `REFRESH_COOKIE_SECURE=true` and serve over HTTPS in production.
- Set `SMTP_PASSWORD` (Resend API key) or swap `emailService.js` for your
  provider — without it, verification/reset emails are just logged to the
  console instead of sent, so local dev works without SMTP configured.
- `BACKEND_CORS_ORIGINS` must exactly match your deployed frontend origin(s)
  — no wildcards, per the doc's CORS guidance.
- This package covers Module 1 (Foundation + Auth) only. The doc's later
  modules (leads data layer, PayPal billing, admin dashboard) aren't included.
