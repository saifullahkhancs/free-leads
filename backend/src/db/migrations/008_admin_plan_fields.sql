-- Migration 008 — Granular social & contact field visibility per plan

ALTER TABLE plans ADD COLUMN IF NOT EXISTS show_email BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS show_phone BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS show_linkedin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS show_twitter BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS show_website BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS show_about BOOLEAN NOT NULL DEFAULT FALSE;

-- Initialize values for existing default plans
UPDATE plans
SET
  show_email = FALSE,
  show_phone = FALSE,
  show_linkedin = FALSE,
  show_twitter = FALSE,
  show_website = FALSE,
  show_about = FALSE
WHERE code = 'free';

UPDATE plans
SET
  show_email = TRUE,
  show_phone = TRUE,
  show_linkedin = TRUE,
  show_twitter = TRUE,
  show_website = TRUE,
  show_about = TRUE
WHERE code IN ('starter', 'growth', 'pro') OR can_view_contact = TRUE;
