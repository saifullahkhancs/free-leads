# Features — Leads Directory

## 🚀 Key Features

### 1. Smart Search & Filtering
- **Full-Text Search**: Powered by PostgreSQL `tsvector`, allowing fast search across names, headlines, and company names.
- **Industry & Role Filters**: Drill down into specific market segments.
- **Normalized Geo-Filtering**: Filter by Country, Region, or City using standardized ISO data.

### 2. "Near Me" Geospatial Search (New!)
- **Location-Aware Results**: The app uses your current location (or a provided city) to find leads physically closest to you.
- **Radius Search**: Find networking opportunities within a 10km, 50km, or 100km radius.
- **PostGIS Powered**: Uses `GEOGRAPHY(POINT)` and `GIST` indexing for sub-second distance calculations across millions of rows.

### 3. Tiered Access (Freemium & Paid Membership Plans)
- **4 Transparent Tiers**:
  - **Free** ($0/month): 3 searches/day, 500 exports/day, up to 500 records/export, EXCEL format.
  - **Starter** ($29/month): 10 searches/day, 4,500 exports/day, up to 500 records/export, CSV & EXCEL formats.
  - **Growth** ($49/month - Most Popular): 50 searches/day, 10,000 exports/day, up to 1,000 records/export, CSV, EXCEL & PDF formats.
  - **Pro** ($199/month): 100 searches/day, 40,000 exports/day, up to 5,000 records/export, CSV, EXCEL, PDF & JSON formats.
- **Dedicated Plans Page** (`/plans` and `/pricing`): Public pricing table with complete comparison of allowances, file formats, and direct subscription links.
- **In-App Billing View** (`/app/billing`): Logged-in users can view their active plan, daily search/export usage bars, and upgrade/change plans.
- **Admin Plan Management (`/admin/plans`)**:
  - Add, edit, or delete membership plans directly from the admin dashboard.
  - Customize search quotas, export quotas, and max records per export for any plan.
  - Enable or disable supported file formats per plan: **EXCEL**, **CSV**, **PDF**, and **JSON**.
  - Configure granular contact & social field visibility per plan: control whether **Email**, **Phone**, **LinkedIn**, **Twitter**, **Website**, and **About/Notes** are unmasked or hidden for users on each plan.

### 4. Data Integrity
- **Verified Leads**: Badge system for leads with confirmed contact info.
- **Standardized Locations**: Prevents duplicate entries through a strict ISO-based geo-taxonomy.

### 5. Map Location Picker (Free, No API Key)
- **Exact-location selection**: Users pick their spot on a free
  **Leaflet + OpenStreetMap** map — click anywhere, drag the pin, search a
  city/area, or use the browser's current location.
- **Auto-filled area info**: Reverse geocoding (free **Nominatim**, or
  **Geoapify** with a free key for higher limits) fills in **city, province /
  state and country** automatically when a location is selected.
- **User profile management**: `PATCH /api/auth/me` lets an existing user
  update their first/last name and location anytime (`/app/profile`).

### 6. Google Maps lead scraping (planned)
- The app is built around the idea of harvesting leads (businesses) per
  selected city/region. Note: **scraping Google Maps directly violates Google's
  Terms of Service** and breaks often. Recommended free approach instead:
  query businesses from **OpenStreetMap via the Overpass API**
  (`node <osm-script>`, category + bounding-box/radius queries), or use
  Geoapify's Places API free tier (3,000 credits/day) — both are legal, free,
  and return name/address/category/lat-lng that map directly onto the existing
  `leads` + PostGIS schema.
- **Full design notes, example queries, schema mapping and implementation
  plan: see [`MAP_SCRAPING.md`](MAP_SCRAPING.md)** — read it before building
  the scraper.

---

## 🛠 How Geospatial Search Works

1. **Storage**: We store each lead's location as a `GEOGRAPHY(POINT, 4326)` object in PostgreSQL. 4326 is the standard WGS 84 coordinate system used by GPS.
2. **Indexing**: A `GIST` (Generalized Search Tree) index is applied to the location column. Unlike standard indexes that sort numbers or text, GIST indexes 2D shapes and points.
3. **Querying**: When you click "Find Near Me":
   - The frontend gets your Browser Geolocation (Lat/Lon).
   - The backend runs a `ST_DWithin` query:
     ```sql
     SELECT * FROM leads 
     WHERE ST_DWithin(location, ST_MakePoint(user_lon, user_lat)::geography, radius_in_meters)
     ORDER BY location <-> ST_MakePoint(user_lon, user_lat)::geography;
     ```
   - The `<->` operator performs a "nearest neighbor" search, making the sorting extremely efficient.
