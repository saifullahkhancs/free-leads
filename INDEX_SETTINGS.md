# Database Index Settings & Architecture Guide

This document is the single source of truth for all database indexes and table structures across the **Free Leads** platform. It details every index relation, what it does, which table and search operations it accelerates, its current implementation status, and performance trade-offs for **maximizing lead storage capacity and bulk ingestion throughput at 5,000,000+ lead records**.

---

## Table of Contents

1. [Capacity Maximization & Ingestion Throughput Strategy](#1-capacity-maximization--ingestion-throughput-strategy)
2. [Lead Uniqueness Standard: `(full_name + email)`](#2-lead-uniqueness-standard-full_name--email)
3. [Master Index Matrix](#3-master-index-matrix)
4. [Master Database Tables Matrix](#4-master-database-tables-matrix)
5. [Detailed Index Specifications](#5-detailed-index-specifications)
   - [A. Active Search, Fuzzy Matching & Geospatial Indexes (`leads`)](#a-active-search-fuzzy-matching--geospatial-indexes-leads)
   - [B. Active Location & Taxonomy Hierarchy Indexes (`leads`)](#b-active-location--taxonomy-hierarchy-indexes-leads)
   - [C. Active Primary Key & Keyset Pagination (`leads`)](#c-active-primary-key--keyset-pagination-leads)
   - [D. Active Auxiliary Table Indexes (`users`, `billing`, `auth`, `geo`)](#d-active-auxiliary-table-indexes)
6. [Removed Indexes & Future Roadmap](#6-removed-indexes--future-roadmap)
   - [A. Removed Composite Indexes (`country_city`, `active_locations`, `category_industry`)](#a-removed-composite-indexes)
   - [B. Removed Low-Cardinality Index (`is_verified`)](#b-removed-low-cardinality-index-is_verified)
   - [C. Removed Ingest Hash Indexes & Ledger (`lead_hashes`)](#c-removed-ingest-hash-indexes--ledger-lead_hashes)
7. [Proposed Future Indexes](#7-proposed-future-indexes)
8. [Index Maintenance & Bulk Import Guidelines (5M Scale)](#8-index-maintenance--bulk-import-guidelines-5m-scale)

---

## 1. Capacity Maximization & Ingestion Throughput Strategy

To maximize the number of leads the database can store without running out of disk space or RAM:

1. **Write Amplification Reduction**:
   - Each index on `leads` forces PostgreSQL to perform random disk I/O updates during every `INSERT`/`UPDATE`.
   - By trimming down non-essential composite indexes, hash indexes, and low-selectivity boolean indexes, the database now writes to **only 10 core indexes on `leads`** instead of 20+.
   - This eliminates **~10,000,000 index writes per 1M rows imported** during streaming CSV uploads.

2. **Disk & RAM Cache Optimization**:
   - Dropping composite indexes and the separate `lead_hashes` ledger frees up **over 50% of the index footprint**.
   - PostgreSQL's `shared_buffers` cache is freed up to store active lead search data rather than redundant composite B-Trees.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ACTIVE LEADS TABLE INDEX SUITE (10)                   │
├────────────────────────┬──────────────────────────┬─────────────────────────┤
│ 1. Search & Geo (4)    │ 2. Location (3)          │ 3. Taxonomy (2)         │
│ - search_vector (GIN)  │ - country_id (B-Tree)    │ - category (B-Tree)     │
│ - company_name (trgm)  │ - region_id (B-Tree)     │ - industry (B-Tree)     │
│ - full_name (trgm)     │ - city_id (B-Tree)       │                         │
│ - location (GiST)      │                          │                         │
├────────────────────────┴──────────────────────────┴─────────────────────────┤
│ 4. Coordinates (1)                                │ 5. Primary Key (1)      │
│ - (lat, lon) partial                              │ - leads_pkey (id)       │
└───────────────────────────────────────────────────┴─────────────────────────┘
```

---

## 2. Lead Uniqueness Standard: `(full_name + email)`

The platform's lead deduplication and identity model is defined strictly by two fields:

$$\text{Lead Identity Key} = \text{normalized}(\text{full\_name}) + \text{"::"} + \text{normalized}(\text{email})$$

- **Rules**:
  1. **Strictly 2 Fields**: Uniqueness only compares `full_name` and `email`.
  2. **Normalization**: Both values are trimmed of whitespace and converted to lower-case (e.g. `"John Doe"` $\rightarrow$ `"john doe"`).
  3. **Non-Empty Requirement**: A record is only deduplicated if **both** `full_name` and `email` are non-empty. Records without an email are never treated as duplicates of each other.
  4. **In-Memory Streaming Dedup**: Handled in `dedupService.filterDuplicates` using a high-speed in-memory hash set without issuing slow queries or table locks.

---

## 3. Master Index Matrix

| # | Index Name | Table | Columns / Expression | Index Type | Target Search / Feature | Status |
|---|---|---|---|---|---|---|
| **1** | `leads_pkey` | `leads` | `(id)` | B-Tree (Unique) | Keyset pagination (`id > cursor`), Single Lead Lookup | **Implemented** |
| **2** | `idx_leads_search_vector` | `leads` | `(search_vector)` | GIN | Global keyword search (`q=...` full-text tsquery) | **Implemented** |
| **3** | `idx_leads_company_trgm` | `leads` | `(company_name gin_trgm_ops)` | GIN (`pg_trgm`) | Fuzzy company name search, typo tolerance, autocomplete | **Implemented** |
| **4** | `idx_leads_full_name_trgm` | `leads` | `(full_name gin_trgm_ops)` | GIN (`pg_trgm`) | Fuzzy person name search, partial name matches | **Implemented** |
| **5** | `idx_leads_location` | `leads` | `(location)` | GiST (PostGIS) | "Near Me" radius search (`ST_DWithin`, `ST_Distance`) | **Implemented** |
| **6** | `idx_leads_lat_lon` | `leads` | `(lat, lon) WHERE ...` | B-Tree (Partial) | Coordinate bounds & non-PostGIS geo lookups | **Implemented** |
| **7** | `idx_leads_country_id` | `leads` | `(country_id)` | B-Tree | Country filter dropdown, country-level aggregations | **Implemented** |
| **8** | `idx_leads_region_id` | `leads` | `(region_id)` | B-Tree | State / Province filter dropdown | **Implemented** |
| **9** | `idx_leads_city_id` | `leads` | `(city_id)` | B-Tree | City filter dropdown | **Implemented** |
| **10** | `idx_leads_category` | `leads` | `(category)` | B-Tree | Top-level category dropdown filter | **Implemented** |
| **11** | `idx_leads_industry` | `leads` | `(industry)` | B-Tree | Exact industry filter dropdown & DISTINCT list | **Implemented** |
| **12** | `idx_leads_country_city` | `leads` | `(country_id, city_id)` | B-Tree Composite | Combined Country + City drill-down filtering | **Removed from DB** |
| **13** | `idx_leads_active_country` | `leads` | `(is_active, country_id)` | B-Tree Composite | Active country facet counts (`getFacets`) | **Removed from DB** |
| **14** | `idx_leads_active_region` | `leads` | `(is_active, region_id)` | B-Tree Composite | Active state facet counts (`getFacets`) | **Removed from DB** |
| **15** | `idx_leads_active_city` | `leads` | `(is_active, city_id)` | B-Tree Composite | Active city facet counts (`getFacets`) | **Removed from DB** |
| **16** | `idx_leads_category_industry` | `leads` | `(category, industry)` | B-Tree Composite | Cascading category → industry facet aggregation | **Removed from DB** |
| **17** | `idx_leads_verified` | `leads` | `(is_verified)` | B-Tree | "Verified Only" toggle filter | **Removed from DB** |
| **18** | `idx_leads_email_hash` | `leads` | `(email_hash)` | B-Tree | Ingest dedup & admin email matching | **Removed from DB (To Be Included in Future)** |
| **19** | `idx_leads_phone_hash` | `leads` | `(phone_hash)` | B-Tree | Ingest dedup & admin phone matching | **Removed from DB (To Be Included in Future)** |
| **20** | `idx_leads_website_hash` | `leads` | `(website_hash)` | B-Tree | Ingest dedup & admin domain matching | **Removed from DB (To Be Included in Future)** |
| **21** | `idx_leads_biz_hash` | `leads` | `(biz_hash)` | B-Tree | Ingest dedup & business identity matching | **Removed from DB (To Be Included in Future)** |
| **22** | `uq_lead_hashes_type_hash` | `lead_hashes` | `(hash_type, hash)` | B-Tree Unique | Global cross-file deduplication ledger | **Removed from DB (To Be Included in Future)** |
| **23** | `idx_leads_created_at_id` | `leads` | `(created_at DESC, id DESC)` | B-Tree Composite | Default "Recent" recency sort pagination | **Not Implemented (Proposed)** |
| **24** | `idx_leads_verified_partial` | `leads` | `(id) WHERE is_verified = TRUE` | B-Tree Partial | Verified leads fast filter with low footprint | **Not Implemented (Proposed)** |
| **25** | `idx_leads_company_sort` | `leads` | `(company_name ASC, id ASC)` | B-Tree Composite | Alphabetical company sorting | **Not Implemented (Proposed)** |

---

## 4. Master Database Tables Matrix

| # | Table Name | Purpose / Responsibility | Scale Target | Current Status |
|---|---|---|---|---|
| **1** | `leads` | Central lead records (full name, email, phone, location, job title, industry, social links) | 5,000,000+ rows | **Active** |
| **2** | `countries` | Normalized country reference table (ISO 3166-1 alpha-2 codes) | ~250 rows | **Active** |
| **3** | `regions` | Normalized state / province reference table | ~5,000 rows | **Active** |
| **4** | `cities` | Normalized city reference table linked to regions/countries | ~150,000 rows | **Active** |
| **5** | `users` | User accounts, password hashes, auth profiles, and user geo preferences | ~100,000+ rows | **Active** |
| **6** | `roles` | RBAC role definitions (`super_admin`, `admin`, `editor`, `user`) | 4 rows | **Active** |
| **7** | `permissions` | RBAC granular action permissions (`leads.read`, `leads.export`, etc.) | ~20 rows | **Active** |
| **8** | `role_permissions` | Mapping table connecting roles to permissions | ~50 rows | **Active** |
| **9** | `user_roles` | Mapping table connecting users to assigned roles | ~100,000 rows | **Active** |
| **10** | `refresh_tokens` | JWT session rotation tokens and revocation flags | Ephemeral (~50k) | **Active** |
| **11** | `password_reset_tokens`| Secure temporary tokens for password reset flows | Ephemeral | **Active** |
| **12** | `plans` | Subscription tiers (Free, Pro, Business) and quota definitions | ~10 rows | **Active** |
| **13** | `subscriptions` | User subscription records linked to PayPal subscription IDs | ~50,000 rows | **Active** |
| **14** | `payment_transactions`| Billing transaction records and webhook payloads | ~200,000 rows | **Active** |
| **15** | `usage_logs` | Daily search and export quota tracking logs | High-volume | **Active** |
| **16** | `api_keys` | Developer API key hashes and identification prefixes | ~10,000 rows | **Active** |
| **17** | `audit_logs` | Administrative action audit trails (actor, action, metadata) | High-volume | **Active** |
| **18** | `contact_messages` | Inbound support and contact form inquiries | Low-volume | **Active** |
| **19** | `blog_posts` | Marketing and educational content management | Low-volume | **Active** |
| **20** | `lead_hashes` | Global cryptographic fingerprint ledger for cross-file duplicate prevention | High-volume | **Removed (To Be Included in Future)** |

---

## 5. Detailed Index Specifications

### A. Active Search, Fuzzy Matching & Geospatial Indexes (`leads`)

#### 1. `idx_leads_search_vector`
- **Table**: `leads`
- **Columns**: `search_vector` (`TSVECTOR`)
- **Index Type**: Generalized Inverted Index (GIN)
- **What it does**: Parses lexemes from full name, company name, and headline into an inverted index tree.
- **Target Search / Query**:
  ```sql
  SELECT * FROM leads WHERE search_vector @@ plainto_tsquery('english', 'software engineer');
  ```
- **Status**: `Implemented`

#### 2. `idx_leads_company_trgm`
- **Table**: `leads`
- **Columns**: `company_name` using `gin_trgm_ops`
- **Index Type**: GIN Trigram (`pg_trgm` extension)
- **What it does**: Breaks company names into 3-character slices (trigrams) for substring matching without sequential scans.
- **Target Search / Query**:
  ```sql
  SELECT * FROM leads WHERE company_name ILIKE '%acme%';
  ```
- **Status**: `Implemented`

#### 3. `idx_leads_full_name_trgm`
- **Table**: `leads`
- **Columns**: `full_name` using `gin_trgm_ops`
- **Index Type**: GIN Trigram (`pg_trgm` extension)
- **What it does**: Enables fuzzy and substring matching on person names.
- **Target Search / Query**:
  ```sql
  SELECT * FROM leads WHERE full_name ILIKE '%johnson%';
  ```
- **Status**: `Implemented`

#### 4. `idx_leads_location`
- **Table**: `leads`
- **Columns**: `location` (`GEOGRAPHY(POINT, 4326)`)
- **Index Type**: Generalized Search Tree (GiST / PostGIS R-Tree)
- **What it does**: Spatial bounding box index for radius and distance calculation.
- **Target Search / Query**:
  ```sql
  SELECT * FROM leads 
  WHERE ST_DWithin(location, ST_MakePoint(:lon, :lat)::geography, :radius_meters);
  ```
- **Status**: `Implemented`

#### 5. `idx_leads_lat_lon`
- **Table**: `leads`
- **Columns**: `(lat, lon)` WHERE `lat IS NOT NULL AND lon IS NOT NULL`
- **Index Type**: B-Tree Composite Partial
- **What it does**: Coordinate bounds and non-PostGIS geo fallback.
- **Status**: `Implemented`

---

### B. Active Location & Taxonomy Hierarchy Indexes (`leads`)

#### 6. `idx_leads_country_id`, `idx_leads_region_id`, `idx_leads_city_id`
- **Table**: `leads`
- **Columns**: `country_id`, `region_id`, `city_id` (Integer Foreign Keys)
- **Index Type**: B-Tree (Single-column)
- **What it does**: Direct foreign key lookups and standalone location filtering.
- **Status**: `Implemented`

#### 7. `idx_leads_category`
- **Table**: `leads`
- **Columns**: `category` (`VARCHAR(150)`)
- **Index Type**: B-Tree
- **What it does**: Fast indexing on top-level broad categories (*Technology*, *Healthcare*, *Finance*, etc.).
- **Status**: `Implemented`

#### 8. `idx_leads_industry`
- **Table**: `leads`
- **Columns**: `industry` (`VARCHAR(150)`)
- **Index Type**: B-Tree
- **What it does**: Exact sub-industry filtering and `SELECT DISTINCT industry` queries.
- **Status**: `Implemented`

---

### C. Active Primary Key & Keyset Pagination (`leads`)

#### 9. `leads_pkey`
- **Table**: `leads`
- **Columns**: `id` (`BIGINT`)
- **Index Type**: B-Tree Unique (Primary Key)
- **What it does**: Guarantees unique primary key and provides the stable cursor for keyset pagination:
  ```sql
  SELECT * FROM leads WHERE is_active = TRUE AND id > $cursor ORDER BY id ASC LIMIT 50;
  ```
- **Status**: `Implemented`

---

### D. Active Auxiliary Table Indexes

#### 1. User & Authentication Indexes (`users`, `refresh_tokens`)
- `users_pkey` (`users.id`): UUID primary key. (**Implemented**)
- `idx_users_email` (`users.email`): Unique B-Tree for login lookups. (**Implemented**)
- `idx_users_google_id` (`users.google_id`): B-Tree for Google OAuth login. (**Implemented**)
- `idx_users_location` (`users.location`): GiST spatial index on user location. (**Implemented**)
- `idx_users_interests` (`users.interest_category, interest_industry`): Partial index for profile matching. (**Implemented**)
- `idx_refresh_tokens_user_id` (`refresh_tokens.user_id`): B-Tree for bulk session revocation / logout. (**Implemented**)
- `idx_refresh_tokens_token_hash` (`refresh_tokens.token_hash`): B-Tree for validating JWT refresh token hash. (**Implemented**)

#### 2. Geo-Hierarchy Lookup Indexes (`regions`, `cities`)
- `idx_regions_country` (`regions.country_id`): B-Tree for fetching all states of a country. (**Implemented**)
- `idx_cities_region` (`cities.region_id`): B-Tree for fetching all cities within a state. (**Implemented**)

#### 3. Billing & Quota Indexes (`subscriptions`, `payment_transactions`, `usage_logs`, `api_keys`)
- `idx_subscriptions_user` (`subscriptions.user_id`): User subscription status verification. (**Implemented**)
- `idx_subscriptions_status` (`subscriptions.status`): Active subscriber filtering. (**Implemented**)
- `idx_payment_tx_subscription` / `idx_payment_tx_user`: Payment history lookups. (**Implemented**)
- `idx_usage_logs_user_action_date` (`usage_logs.user_id, action, created_at`): Quota enforcement. (**Implemented**)
- `idx_api_keys_hash` (`api_keys.key_hash`): Instant API key validation. (**Implemented**)

---

## 6. Removed Indexes & Future Roadmap

### A. Removed Composite Indexes
The following 5 composite indexes have been **removed from the database** (via Migration `016_drop_composite_indexes.sql`) to maximize bulk import speeds:
- `idx_leads_country_city` on `(country_id, city_id)`
- `idx_leads_active_country` on `(is_active, country_id)`
- `idx_leads_active_region` on `(is_active, region_id)`
- `idx_leads_active_city` on `(is_active, city_id)`
- `idx_leads_category_industry` on `(category, industry)`

*Reason*: Standalone indexes on `country_id`, `region_id`, `city_id`, `category`, and `industry` already provide index scans. Removing these composite pairs eliminates 5M index updates per 1M rows imported.

### B. Removed Low-Cardinality Index (`is_verified`)
- **Removed via**: Migration `014_drop_verified_index.sql`
- **Reason**: Low-cardinality boolean column. In a 5M dataset, PostgreSQL ignores full boolean B-tree indexes.

### C. Removed Ingest Hash Indexes & Ledger (`lead_hashes`)
- **Removed via**: Migration `015_drop_lead_hashes_and_hash_indexes.sql`
- **Reason**: Deduplication now operates on **`(full_name + email)`** in memory. Standalone hash columns on `leads` remain, while the separate `lead_hashes` ledger and 4 hash indexes are dropped to maximize throughput.

---

## 7. Proposed Future Indexes

| Index Name | Columns / Condition | Type | Benefit | Status |
|---|---|---|---|---|
| `idx_leads_created_at_id` | `(created_at DESC NULLS LAST, id DESC) WHERE is_active = TRUE` | B-Tree Partial Composite | Speeds up the default "Recent" directory sort order without in-memory sort | **Not Implemented (Proposed)** |
| `idx_leads_verified_partial` | `(id) WHERE is_verified = TRUE AND is_active = TRUE` | B-Tree Partial | 90% smaller than full boolean index; fast verified lead filtering | **Not Implemented (Proposed)** |
| `idx_leads_company_sort` | `(company_name ASC NULLS LAST, id ASC) WHERE is_active = TRUE` | B-Tree Partial Composite | Speeds up alphabetical company sorting | **Not Implemented (Proposed)** |

---

## 8. Index Maintenance & Bulk Import Guidelines (5M Scale)

### 1. High-Volume Seeding (>2M rows)
1. Drop the heavy full-text and trigram indexes before the bulk import:
   ```sql
   DROP INDEX IF EXISTS idx_leads_search_vector;
   DROP INDEX IF EXISTS idx_leads_company_trgm;
   DROP INDEX IF EXISTS idx_leads_full_name_trgm;
   ```
2. Stream and import the CSV records.
3. Rebuild the search indexes in parallel without locking the table:
   ```sql
   CREATE INDEX CONCURRENTLY idx_leads_search_vector ON leads USING GIN (search_vector);
   CREATE INDEX CONCURRENTLY idx_leads_company_trgm ON leads USING GIN (company_name gin_trgm_ops);
   CREATE INDEX CONCURRENTLY idx_leads_full_name_trgm ON leads USING GIN (full_name gin_trgm_ops);
   ```

### 2. Routine Maintenance
- Run `ANALYZE leads;` after importing large datasets so the query planner has updated column statistics.
- Run `REINDEX TABLE CONCURRENTLY leads;` periodically if heavy updates/deletions cause index bloat.
