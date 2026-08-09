-- Module 1 — Foundation + Auth
-- Mirrors Section 3 of the dev doc (users, roles, permissions, role_permissions,
-- user_roles, refresh_tokens) plus the email-verification / password-reset
-- fields needed to reproduce the job-easy register -> verify -> login flow.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                           VARCHAR(255) UNIQUE NOT NULL,
    password_hash                   VARCHAR(255) NOT NULL,
    first_name                      VARCHAR(150) NOT NULL,
    last_name                       VARCHAR(150) NOT NULL,
    is_active                       BOOLEAN DEFAULT TRUE,
    is_email_verified               BOOLEAN DEFAULT FALSE,
    verification_code               VARCHAR(10),
    verification_code_expires_at    TIMESTAMPTZ,
    verification_attempt_count      INT DEFAULT 0,
    verification_attempt_window_start TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ DEFAULT now(),
    updated_at                      TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(50) UNIQUE NOT NULL      -- 'super_admin','admin','editor','user'
);

CREATE TABLE IF NOT EXISTS permissions (
    id      SERIAL PRIMARY KEY,
    code    VARCHAR(100) UNIQUE NOT NULL     -- 'leads.read','leads.export','users.manage', ...
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- ---------------------------------------------------------------------------
-- Refresh tokens (JWT rotation / revocation) — Section 3.1 + Section 6
-- (short-lived access token, httpOnly refresh cookie, rotation w/ reuse
-- detection, revoke-on-logout).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    replaced_by UUID REFERENCES refresh_tokens(id),
    user_agent  VARCHAR(255),
    ip_address  INET,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);

-- ---------------------------------------------------------------------------
-- Password reset tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_id    VARCHAR(255) PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Audit log for admin/auth actions (Section 3.1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    actor_id    UUID REFERENCES users(id),
    action      VARCHAR(100),
    entity_type VARCHAR(50),
    entity_id   VARCHAR(100),
    metadata    JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
