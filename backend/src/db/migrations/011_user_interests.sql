-- Module 11 — User interests (default directory filters)
-- Lets a user pick, on their profile, the lead *category* they're interested in
-- and the *industry* they work in / sell into. The directory reads these back to
-- pre-seed the default Category and Industry filter chips, so a signed-in user
-- lands on results that are already relevant to them.
--
-- Values intentionally mirror `leads.category` / `leads.industry` (same VARCHAR(150)
-- width) because the profile picker is populated from the very same facet lists
-- the Category / Industry filter dropdowns use.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS interest_category VARCHAR(150),
    ADD COLUMN IF NOT EXISTS interest_industry VARCHAR(150);

-- The directory looks users up by their interests only via the already-indexed
-- primary key, but this partial index keeps future "who is interested in X"
-- admin reporting cheap.
CREATE INDEX IF NOT EXISTS idx_users_interests
    ON users (interest_category, interest_industry)
    WHERE interest_category IS NOT NULL OR interest_industry IS NOT NULL;
