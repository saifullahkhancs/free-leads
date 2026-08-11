-- Migration 009 — Contact Us messages (public form submissions)
-- Stores messages from the "Contact Us" form on the landing page so the
-- admin team can review, mark and reply to them from the dashboard.

CREATE TABLE IF NOT EXISTS contact_messages (
  id              BIGSERIAL PRIMARY KEY,
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  subject         VARCHAR(200) NOT NULL,
  message         TEXT         NOT NULL,
  -- user agent / IP captured for spam review
  ip_address      VARCHAR(64),
  user_agent      TEXT,
  -- 'new' | 'read' | 'replied' | 'closed'
  status          VARCHAR(20)  NOT NULL DEFAULT 'new',
  -- optional admin reply that was emailed to the submitter
  admin_reply     TEXT,
  replied_at      TIMESTAMPTZ,
  replied_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status
  ON contact_messages (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_messages_email
  ON contact_messages (lower(email));
