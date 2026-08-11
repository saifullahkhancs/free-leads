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
The central lead database.
- `id`: BigInt (Primary Key)
- `full_name`: String
- `headline`: String
- `email`: String (Masked for free users)
- `location`: GEOGRAPHY(POINT) - **Geospatial coordinates**
- `city_id`: FK to `cities`
- `industry`: String
- `search_vector`: tsvector (Search Index)

### `countries` / `regions` / `cities`
The Geo-Hierarchy. Standardized using ISO-3166 codes.

### `roles` / `permissions`
RBAC system (Super Admin, Admin, Editor, User).

### `refresh_tokens`
JWT rotation and session management.

## Indexes
| Column | Type | Purpose |
|---|---|---|
| `search_vector` | GIN | Full-text search |
| `location` | GIST | Nearest-neighbor/Radius search |
| `company_name` | GIN (trgm) | Fuzzy matching |
| `city_id` | B-Tree | Hierarchical filtering |
