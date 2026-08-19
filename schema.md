# Database Schema

## Tables

### `users`
Core user accounts.
- `id`: UUID (Primary Key)
- `email`: Unique string
- `password_hash`: Argon2id hash
- `first_name` / `last_name`: Strings (editable by the user via `PATCH /api/auth/me`)
- `is_email_verified`: Boolean
- `is_active`: Boolean
- `location_lat` / `location_lng`: Double precision — exact spot picked on the
  free Leaflet/OSM map picker
- `location_city` / `location_region` / `location_country`: Strings auto-filled
  by reverse geocoding when the user selects a location
- `location_label`: Human-readable address string (e.g. `Gulberg, Lahore, Punjab, Pakistan`)
- `interest_category`: String — the lead **category** the user is interested in,
  picked on the profile page from the same facet list that powers the directory's
  Category filter. Used to pre-select that filter for the signed-in user.
- `interest_industry`: String — the **industry** the user works in / sells into,
  picked from the directory's Industry facet list and used the same way.

### `leads`
The central lead database (optimized for maximum capacity & throughput).
- `id`: BigInt (Primary Key)
- `full_name`: String (**Part 1 of Uniqueness Filter**)
- `email`: String (**Part 2 of Uniqueness Filter**, masked for free users)
- `headline`: String
- `about`: Text
- `phone`: String
- `linkedin_url` / `twitter_url` / `facebook_url` / `website_url`: Strings
- `location`: GEOGRAPHY(POINT) - **Geospatial coordinates**
- `city_id` / `region_id` / `country_id`: FKs to Geo-Hierarchy tables
- `category` / `industry`: Standardized business classifications
- `company_name` / `job_title`: Strings
- `source`: String
- `is_verified` / `is_active`: Booleans
- `search_vector`: tsvector (Search Index)

> **Uniqueness Rule on `leads`**:
> Uniqueness is strictly evaluated on **`(full_name + email)`**. During ingestion, a row is treated as a duplicate only if both the normalized `full_name` and normalized `email` match an existing record.

### `countries` / `regions` / `cities`
The Geo-Hierarchy. Standardized using ISO-3166 codes.

### `roles` / `permissions`
RBAC system (Super Admin, Admin, Editor, User).

### `refresh_tokens`
JWT rotation and session management.

### `plans` / `subscriptions` / `payment_transactions`
Monetization and subscription billing system.

### `usage_logs` / `api_keys` / `audit_logs`
Usage quota enforcement, developer API access, and admin action audit trails.

### `lead_hashes` *(Removed from Active DB — To Be Included in Future)*
- **Status**: **Removed from active schema** (Migration `015_drop_lead_hashes_and_hash_indexes.sql`).
- **Rationale**: Removed to maximize lead capacity and eliminate table lock/index amplification during bulk 5M+ record CSV imports.
- **Future Roadmap**: Must be re-included in the future if cross-file global deduplication ledger is required.

---

## Indexes
For complete specifications of all index relations, target queries, status, and tuning guidelines, see **[INDEX_SETTINGS.md](INDEX_SETTINGS.md)**.

| Column / Expression | Type | Purpose | Status |
|---|---|---|---|
| `id` (PK) | B-Tree | Keyset pagination & single lead fetch | Implemented |
| `search_vector` | GIN | Full-text search (`q=`) | Implemented |
| `location` | GIST | Geospatial radius search ("Near Me") | Implemented |
| `lat, lon` (Partial) | B-Tree | Coordinate bounds & non-PostGIS geo fallback | Implemented |
| `company_name` | GIN (trgm) | Future fuzzy company matching & autocomplete | **Removed from DB (To Be Included in Future)** (Migration 018) |
| `full_name` | GIN (trgm) | Future fuzzy name matching | **Removed from DB (To Be Included in Future)** (Migration 018) |
| `country_id` | B-Tree | Country filtering & joins | Implemented |
| `region_id` | B-Tree | Region/State filtering & joins | Implemented |
| `city_id` | B-Tree | City filtering & joins | Implemented |
| `category` | B-Tree | Top-level category dropdown filter | Implemented |
| `industry` | B-Tree | Sub-industry filter & distinct list | Implemented |
| `(country_id, city_id)` | B-Tree | Combined country + city drilldown | **Removed from DB** (See Migration 016 & INDEX_SETTINGS.md) |
| `(is_active, country_id)` | B-Tree | Active country facet counts | **Removed from DB** (See Migration 016 & INDEX_SETTINGS.md) |
| `(is_active, region_id)` | B-Tree | Active region facet counts | **Removed from DB** (See Migration 016 & INDEX_SETTINGS.md) |
| `(is_active, city_id)` | B-Tree | Active city facet counts | **Removed from DB** (See Migration 016 & INDEX_SETTINGS.md) |
| `(category, industry)` | B-Tree | Cascading category-industry facet counts | **Removed from DB** (See Migration 016 & INDEX_SETTINGS.md) |
| `is_verified` | B-Tree | Verified filter | **Removed from DB** (See Migration 014 & INDEX_SETTINGS.md) |
| `email_hash` / `phone_hash` / `website_hash` / `biz_hash` | B-Tree | Hash deduplication indexes | **Removed from DB (To Be Included in Future)** (See Migration 015 & INDEX_SETTINGS.md) |
