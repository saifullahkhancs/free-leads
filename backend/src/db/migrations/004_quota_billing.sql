-- Module 3 — Quota & Billing (plans, subscriptions, payments, usage tracking, API keys)
-- Translated from the WordPress FreeLeads Pro quota/billing subsystem into Postgres.
-- Tables created here back the quotaService + paypalService + billing routes.

-- ---------------------------------------------------------------------------
-- Plans (the membership tiers). -1 means unlimited.
--   free    — small daily allowance, no paid upgrade required
--   starter / growth / pro — paid tiers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
    id                  SERIAL PRIMARY KEY,
    code                VARCHAR(30) UNIQUE NOT NULL,     -- 'free'|'starter'|'growth'|'pro'
    name                VARCHAR(100) NOT NULL,
    price_cents         INT NOT NULL DEFAULT 0,
    billing_cycle       VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'monthly'|'yearly'
    daily_search_quota  INT NOT NULL DEFAULT 3,          -- -1 = unlimited
    daily_export_quota  INT NOT NULL DEFAULT 0,          -- -1 = unlimited
    max_export_per_req  INT NOT NULL DEFAULT 100,        -- rows per export request
    allowed_formats     TEXT[] NOT NULL DEFAULT '{excel}', -- csv|excel|pdf|json
    can_view_contact    BOOLEAN NOT NULL DEFAULT FALSE,  -- full email/socials visible
    show_email          BOOLEAN NOT NULL DEFAULT FALSE,
    show_phone          BOOLEAN NOT NULL DEFAULT FALSE,
    show_linkedin       BOOLEAN NOT NULL DEFAULT FALSE,
    show_twitter        BOOLEAN NOT NULL DEFAULT FALSE,
    show_website        BOOLEAN NOT NULL DEFAULT FALSE,
    show_about          BOOLEAN NOT NULL DEFAULT FALSE,
    paypal_plan_id      VARCHAR(100),
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,  -- the free tier everyone starts on
    is_popular          BOOLEAN NOT NULL DEFAULT FALSE,
    description         TEXT,
    cta_text            VARCHAR(100),
    cta_url             TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Subscriptions (a user's plan membership). Inserted as 'pending' by the
-- billing handlers; only the PayPal webhook flips it to 'active'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_id                 INT REFERENCES plans(id) ON DELETE CASCADE,
    paypal_subscription_id  VARCHAR(150) UNIQUE,
    status                  VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending|active|cancelled|past_due|expired|upgraded
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    next_billing_date       TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);

-- ---------------------------------------------------------------------------
-- Payment transactions (PayPal order/webhook records, raw payload kept for audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    subscription_id     UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    paypal_order_id     VARCHAR(150),
    paypal_transaction_id VARCHAR(150),
    amount_cents        INT NOT NULL,
    currency            VARCHAR(10) DEFAULT 'USD',
    status              VARCHAR(30),                       -- completed|failed|refunded
    raw_payload         JSONB,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_subscription ON payment_transactions (subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_user ON payment_transactions (user_id);

-- ---------------------------------------------------------------------------
-- Usage logs — append-only record of every search / view / export, used both to
-- enforce quotas and to audit activity (analogous to WP flapp_usage_logs).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    action      VARCHAR(50) NOT NULL,     -- 'search'|'view_lead'|'export'
    lead_id     BIGINT REFERENCES leads(id) ON DELETE SET NULL,
    amount      INT NOT NULL DEFAULT 1,
    ip_address  INET,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_action_date
    ON usage_logs (user_id, action, created_at);

-- ---------------------------------------------------------------------------
-- API keys — for machine-to-machine ingest (external pipelines / scrapers).
-- Only the key_hash is stored; the raw key is shown once at creation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(120),
    key_hash      VARCHAR(255) NOT NULL,
    key_prefix    VARCHAR(12) NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    last_used_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
