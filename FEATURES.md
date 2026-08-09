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

### 3. Tiered Access (Freemium)
- **Free Tier**: Browse leads, see headlines, and view masked emails (e.g., `s****@example.com`).
- **Pro Tier**: Unlock full PII (emails, social links), direct website access, and unlimited geospatial queries.

### 4. Data Integrity
- **Verified Leads**: Badge system for leads with confirmed contact info.
- **Standardized Locations**: Prevents duplicate entries through a strict ISO-based geo-taxonomy.

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
