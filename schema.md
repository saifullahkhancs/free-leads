# Database Schema

## Tables

### `users`
Core user accounts.
- `id`: UUID (Primary Key)
- `email`: Unique string
- `password_hash`: Argon2id hash
- `is_email_verified`: Boolean
- `is_active`: Boolean

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
