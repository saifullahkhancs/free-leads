# Map Scraping — Leads from a Map (Design Notes)

> **Purpose of this doc**: everything needed to build the "scrape leads from a
> map" feature is captured here — the decisions, the free APIs, example
> queries, schema mapping, and where the code plugs into this repo. Read this
> file before implementing the scraper.

---

## 1. Decision record: why NOT Google Maps scraping

❌ **Directly scraping Google Maps is off the table.**

- It **violates Google's Terms of Service** (Section 10.2 / scraping clause) —
  your API keys, and potentially your account/domain, get banned.
- Google's bot detection (reCAPTCHA, fingerprinting, rate shaping) breaks
  scrapers constantly — what works today breaks tomorrow.
- There is **no official "list all businesses in city X" endpoint** on the
  free Google tier; the Places API requires billing and bans bulk harvesting.

✅ **Use free, legal data instead** (both are OpenStreetMap-derived):

| Source | Cost | Key needed | Rate limits | Best for |
|---|---|---|---|---|
| **Overpass API** (OSM) | Free, unlimited-ish | No key | ~1 req / 5–10 s on public instances; 180 s timeout | Bulk city/radius harvests, no signup |
| **Geoapify Places API** | Free tier 3,000 credits/day (1 credit ≈ 1 place returned) | Free key | 5 req/s | Production reliability, cleaner category codes, contact enrichment |

Both return: **business name, category, address, lat/lng, phone, website** —
exactly the "free leads" data we want. Neither returns reviews/ratings
(that's Google's moat) and neither returns emails at scale (see §7).

---

## 2. How it fits the app (user flow)

The map location picker already built on the **Profile page**
(`frontend/src/pages/app/ProfilePage.jsx`, `/app/profile`) is the front door:

1. User picks a city/pin on the free Leaflet map → **reverse geocode**
   auto-fills `city / region / country` (already implemented via
   `GET /api/geo/reverse`, `backend/src/services/geoService.js`).
2. User (or admin) chooses the business **category** (restaurants, shops,
   clinics, hotels…) and a **radius** (e.g. 5 km around the pin).
3. Backend queries **Overpass** (or **Geoapify**) with
   `lat/lng + radius + category`.
4. Each result is normalized → mapped to the existing `leads` table via the
   existing **`GeoMapper`** util (`backend/src/utils/GeoMapper.js`) →
   upserted (dedupe on OSM id).
5. Leads appear in the existing Directory (`/app`) and admin Leads pages
   immediately (search + "Near Me" + PostGIS all already work on them).

```
[Profile map picker] --lat/lng--> [POST /api/scrape/run] --> [Overpass/Geoapify]
                                                                    |
                                              [normalize + GeoMapper + upsert]
                                                                    |
                                             leads table  <-- Directory / Admin UI
```

---

## 3. Option A — Overpass API (recommended, zero setup)

### 3.1 Endpoints

- Main public endpoint: `https://overpass-api.de/api/interpreter`
- Alternatives: `https://overpass.kumi.systems/api/interpreter`,
  `https://overpass.private.coffee/api/interpreter`
- **Send `POST` with body `data=<query>`** (or `GET ?data=<query>`).
  URL-encode the whole Overpass QL query.
- Self-host for scale (Docker): `wiktorn/overpass-api` image + OSM planet
  extract — only needed at very high volume.

### 3.2 Politeness rules (public instances)

- No API key, but be nice: **~1 request per 5–10 seconds**, `[timeout:60]` or
  lower, cap results (`out 500;`), never run parallel queries from one IP.
- Heavy/city-wide harvests: split by category or by grid tiles, or self-host.

### 3.3 Example queries (test them at https://overpass-turbo.eu)

**All restaurants within 5 km of a pin (lat/lng):**

```ql
[out:json][timeout:60];
(
  nwr["amenity"="restaurant"](around:5000,31.5497,74.3436);
);
out center tags;
```

**Multiple business categories in one query (radius):**

```ql
[out:json][timeout:90];
(
  nwr["shop"](around:5000,31.5497,74.3436);
  nwr["office"](around:5000,31.5497,74.3436);
  nwr["craft"](around:5000,31.5497,74.3436);
  nwr["amenity"~"^(restaurant|cafe|bar|fast_food|bank|pharmacy|clinic|dentist|veterinary|car_rental|car_wash|fuel|hotel|gym|cinema|post_office)$"](around:5000,31.5497,74.3436);
  nwr["tourism"~"^(hotel|guest_house|motel|hostel|attraction|museum|gallery)$"](around:5000,31.5497,74.3436);
  nwr["healthcare"](around:5000,31.5497,74.3436);
);
out center tags;
```

**All shops inside a named city (admin boundary):**

```ql
[out:json][timeout:90];
area["name"="Lahore"]["admin_level"="6"]->.a;
(
  nwr["shop"](area.a);
  nwr["office"](area.a);
);
out center tags 500;
```

Notes:
- `nwr` = node+way+relation in one; `out center tags` gives `center:{lat,lon}`
  for ways/relations (nodes return `lat`/`lon` directly).
- `around:5000,lat,lng` = 5000 m radius around the point (matches the existing
  PostGIS `ST_DWithin` "Near Me" search).
- City boundary lookup (`area[...]`) uses the **same geo-taxonomy** idea as
  the app's `countries / regions / cities` tables.

### 3.4 Response shape

```json
{
  "elements": [
    {
      "type": "node",
      "id": 123456789,
      "lat": 31.5497,
      "lon": 74.3436,
      "tags": {
        "name": "Salt'n Pepper Village",
        "amenity": "restaurant",
        "cuisine": "pakistani",
        "phone": "+92 42 3575 0223",
        "website": "http://saltnpeppergroup.com",
        "addr:street": "M M Alam Road",
        "addr:city": "Lahore",
        "addr:postcode": "54000",
        "opening_hours": "Mo-Su 12:00-24:00"
      }
    }
  ]
}
```

For `way`/`relation` elements use `el.center.lat / el.center.lon`.

### 3.5 Useful tags → leads mapping

| OSM tag(s) | leads column | Notes |
|---|---|---|
| `name` | `full_name` | Business name |
| `name`, `operator` | `company_name` | Prefer `operator` if present |
| `amenity`/`shop`/`office`/`craft`/`tourism`/`healthcare` | `headline` | Humanized category, e.g. `Restaurant`, `Supermarket` |
| same top-level tag | `industry` | Raw tag key is a useful industry bucket |
| `website` or `contact:website` | `website_url` | `http://` prefix if missing |
| `email` or `contact:email` | `email` | **Rare** — most OSM businesses have no email (see §7) |
| `phone` or `contact:phone` | `phone` (NEW column, §6) | Best-effort, unformatted |
| `contact:facebook` / `contact:instagram` | `facebook_url` / `instagram_url` (NEW) | Optional |
| `opening_hours` | `opening_hours` (NEW) | Raw string |
| `addr:street` + `addr:housenumber` | `location_label`-style note | Also reverse-geocode for a label |
| element id + type | `osm_type` / `osm_id` (NEW) | **Dedupe key** — unique index |
| `center`/`lat`/`lon` | `location` | `ST_SetSRID(ST_MakePoint(lon, lat), 4326)` (PostGIS) or `"lon lat"` TEXT fallback |
| city from picker / `addr:city` | `city_id`, `region_id`, `country_id` | Via existing `GeoMapper` |
| — | `source` | `'overpass'` (or `'geoapify'`) |
| — | `is_verified` | `false` — OSM data is crowd-sourced, unverified contacts |

---

## 4. Option B — Geoapify Places API (when you want a key)

- Signup: https://www.geoapify.com (free, 3,000 credits/day, no credit card).
- **1 credit = 1 place returned** → `limit=20` costs 20 credits. A 150-place
  harvest costs 150 credits/day — stay under 3,000.
- Endpoint:

```
GET https://api.geoapify.com/v2/places
    ?categories=amenity.food.restaurant,commercial.supermarket
    &filter=circle:74.3436,31.5497,5000
    &limit=20
    &apiKey=YOUR_KEY
```

- Category codes are hierarchical (`amenity.food.restaurant`,
  `commercial.supermarket`, `healthcare.pharmacy`…). Full list:
  https://apidocs.geoapify.com/docs/places/#categories
- Response: `features[].properties` → `name`, `categories[]`, `address_line2`,
  `city`, `state`, `country`, `lat`, `lon`, `place_id`, and contact fields
  (`phone`, `website`, sometimes `email`). Data is OSM-based, so the same
  mapping table (§3.5) applies; `datasource.raw` contains the OSM id for
  dedupe.
- Bonus: **the same API key already powers the optional geocoding path** in
  `backend/src/services/geoService.js` (`GEOAPIFY_API_KEY` env var) — one
  key, one provider, consistent data.

---

## 5. Where the code plugs into this repo

Reuse — do not reinvent:

| Existing piece | Reuse for scraper |
|---|---|
| `backend/src/utils/GeoMapper.js` | Resolve/insert `city_id/region_id/country_id` from names (already used by CSV import + manual lead create) |
| `backend/src/services/leadService.js` (`importLeadsCsv` pattern, UNNEST batching) | Bulk upsert pattern for scraped rows |
| `backend/src/middleware/rateLimiter.js` + `validate.js` + `authenticate` / `requireRole` | Protect `POST /api/scrape/run` (editor/admin/super_admin) |
| `backend/src/services/geoService.js` | Reverse-geocode scraped coords for `location_label` |
| `frontend/src/pages/app/ProfilePage.jsx` map picker | **Extract into a reusable `components/LocationPicker.jsx`** first, then reuse on the scraper page |
| `frontend/src/pages/admin/*` + `DashboardLayout` sidebar | New `ScraperPage` with category + radius controls and a progress/results view |
| Redis (already in stack) | Optional job queue (BullMQ / pg-boss) so big harvests run in background |

### New files (planned)

```
backend/src/db/migrations/004_lead_scrape_fields.sql   -- phone, osm_id, social, opening_hours + unique index
backend/src/services/scrapeService.js                  -- Overpass/Geoapify fetch + normalize + upsert
backend/src/routes/scrapeRoutes.js                     -- POST /api/scrape/run, GET /api/scrape/status
frontend/src/pages/admin/ScraperPage.jsx               -- admin UI (map + category + radius + results)
frontend/src/components/LocationPicker.jsx             -- extracted from ProfilePage
```

### Draft migration (004)

```sql
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS phone            VARCHAR(60),
    ADD COLUMN IF NOT EXISTS osm_type         VARCHAR(10),   -- node | way | relation
    ADD COLUMN IF NOT EXISTS osm_id           BIGINT,
    ADD COLUMN IF NOT EXISTS facebook_url     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS instagram_url    VARCHAR(500),
    ADD COLUMN IF NOT EXISTS opening_hours    VARCHAR(500);

-- Dedupe key: one OSM object = one lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_osm
    ON leads (osm_type, osm_id) WHERE osm_type IS NOT NULL;
```

Upsert strategy:

```sql
INSERT INTO leads (full_name, company_name, headline, industry, website_url,
                   email, phone, osm_type, osm_id, location, city_id,
                   region_id, country_id, source, is_verified, ...)
VALUES (...)
ON CONFLICT (osm_type, osm_id)
DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone,
              website_url = EXCLUDED.website_url, updated_at = now();
```

---

## 6. Known limitations (set expectations)

- **Coverage varies by country**: OSM is dense in Europe/North America and in
  big Pakistani cities (Lahore, Karachi, Islamabad); smaller towns may be
  sparse. Surface this in the UI ("approx. N businesses found").
- **No ratings/reviews** — that data exists only on Google/Facebook.
- **No emails at scale** — `email` will be null for most scraped leads; the
  UI already masks/marks missing emails. Optional enrichment later: parse
  `website_url` pages (respect `robots.txt`) or a paid enrichment API.
- **Phone/website present on most but not all** businesses.
- **Data quality**: OSM is crowd-sourced — names/phones can be stale;
  `is_verified = false` by default. (Existing badge system can later mark
  leads confirmed via email bounce checks or manual review.)

---

## 7. Implementation checklist (when building)

- [ ] Migration `004_lead_scrape_fields.sql` (phone, osm ids, social, opening_hours, unique index)
- [ ] `scrapeService.js`: Overpass query builder (category regex map + radius/city), fetch with
      timeout + retry across the 3 public endpoints, normalize element → lead row, GeoMapper
      resolution, UNNEST-batched upsert, per-row error report (mirror `importLeadsCsv`)
- [ ] `scrapeRoutes.js`: `POST /api/scrape/run` (validate lat/lng/radius/categories; editor+),
      `GET /api/scrape/status`; rate-limited; Redis queue for big jobs (optional v1: run inline)
- [ ] Extract `LocationPicker.jsx` from `ProfilePage.jsx` (keep profile behavior identical)
- [ ] `ScraperPage.jsx` in admin: map pin/city + category multi-select + radius slider →
      preview count → run → results table with "already exists / added" per row
- [ ] Wire route + sidebar link; test end-to-end: pick Lahore → restaurants 5 km → ~hundreds of leads
- [ ] Update `FEATURES.md` (mark feature 6 as implemented) and this doc with real numbers
- [ ] Optional: scheduled re-sync job (weekly) to refresh phones/websites via upsert

---

## 8. Resources

- Overpass main API + docs: https://overpass-api.de / https://wiki.openstreetmap.org/wiki/Overpass_API
- Visual query builder (test queries here first): https://overpass-turbo.eu
- Tag browser (find correct tags/values): https://taginfo.openstreetmap.org
- Geoapify Places docs + category list: https://apidocs.geoapify.com/docs/places
- Geoapify free tier details: https://www.geoapify.com/pricing
- Existing in-repo reference: `backend/src/db/importLeads.js` (CSV bulk import with GeoMapper),
  `backend/src/services/geoService.js` (geocoding), `backend/src/db/migrations/002_leads_data_layer.sql` (leads/PostGIS schema)
