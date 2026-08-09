# Vibe Coding Rules — Free Leads Project

## 1. Speed over Perfection
- Move fast. If a library exists (like `country-state-city`), use it. Don't reinvent the wheel.
- Use `async/await` and standardized error handlers (`ApiError`) for everything.

## 2. Security by Default
- **Never** trust the client for roles. Always verify JWT and check permissions server-side.
- **Masking**: PII (Emails/Social) must be masked at the **Service Layer**, not the Frontend.

## 3. Data Integrity
- No free-text locations in the `leads` table. Every lead must resolve to a `city_id` from our standardized geo-tables.
- Use `UNNEST` or `COPY` for batch imports. Single `INSERT` loops are forbidden for the 5M scale target.

## 4. Performance
- Every search query must be backed by an index (`GIN` for text, `GIST` for geo).
- Use keyset pagination (`cursor`) for all lead listing endpoints. `OFFSET` is banned.
