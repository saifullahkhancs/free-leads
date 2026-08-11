-- Migration 010 — Blog posts (simple CMS for admins to publish articles
-- that are listed on the public /blog page).

CREATE TABLE IF NOT EXISTS blog_posts (
  id              BIGSERIAL PRIMARY KEY,
  slug            VARCHAR(220) NOT NULL UNIQUE,
  title           VARCHAR(255) NOT NULL,
  excerpt         TEXT,
  body            TEXT         NOT NULL,
  cover_image_url TEXT,
  -- 'draft' | 'published'
  status          VARCHAR(20)  NOT NULL DEFAULT 'draft',
  author_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published
  ON blog_posts (status, published_at DESC);

-- Simple counter for a read-time heuristic — kept as nullable so old rows
-- don't need a backfill.
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS reading_time_minutes INTEGER;
