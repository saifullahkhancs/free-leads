-- Migration 007 — Update membership plan values, quotas, descriptions, and CTA links

ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS cta_text VARCHAR(100);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS cta_url TEXT;

INSERT INTO plans (
    code, name, price_cents, billing_cycle, daily_search_quota,
    daily_export_quota, max_export_per_req, allowed_formats,
    can_view_contact, is_default, is_popular, description,
    cta_text, cta_url
)
VALUES
(
    'free',
    'Free',
    0,
    'monthly',
    3,
    500,
    500,
    '{excel}',
    FALSE,
    TRUE,
    FALSE,
    'Get started with basic access – perfect for trying out the platform.',
    'Start Free',
    'https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?flapp_plan=free'
),
(
    'starter',
    'Starter',
    2900,
    'monthly',
    10,
    4500,
    500,
    '{csv,excel}',
    TRUE,
    FALSE,
    FALSE,
    'Perfect for solo founders & small agencies getting started.',
    'Select Plan',
    'https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?redirect_to=https://peachpuff-kingfisher-714348.hostingersite.com/membership-levels/'
),
(
    'growth',
    'Growth',
    4900,
    'monthly',
    50,
    10000,
    1000,
    '{csv,excel,pdf}',
    TRUE,
    FALSE,
    TRUE,
    'For growing teams that need volume, speed & flexibility.',
    'Select Plan',
    'https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?redirect_to=https://peachpuff-kingfisher-714348.hostingersite.com/membership-levels/'
),
(
    'pro',
    'Pro',
    19900,
    'monthly',
    100,
    40000,
    5000,
    '{csv,excel,pdf,json}',
    TRUE,
    FALSE,
    FALSE,
    'For power users who want zero limits and full access.',
    'Select Plan',
    'https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?redirect_to=https://peachpuff-kingfisher-714348.hostingersite.com/membership-levels/'
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    price_cents = EXCLUDED.price_cents,
    billing_cycle = EXCLUDED.billing_cycle,
    daily_search_quota = EXCLUDED.daily_search_quota,
    daily_export_quota = EXCLUDED.daily_export_quota,
    max_export_per_req = EXCLUDED.max_export_per_req,
    allowed_formats = EXCLUDED.allowed_formats,
    can_view_contact = EXCLUDED.can_view_contact,
    is_default = EXCLUDED.is_default,
    is_popular = EXCLUDED.is_popular,
    description = EXCLUDED.description,
    cta_text = EXCLUDED.cta_text,
    cta_url = EXCLUDED.cta_url;
