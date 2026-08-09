# Security Policy

## 1. Authentication & Authorization
- **JWT Strategy**: Short-lived Access Tokens (15m) + Long-lived Refresh Tokens (7d).
- **Secure Cookies**: Refresh tokens are stored in `httpOnly`, `Secure`, `SameSite=Strict` cookies to prevent XSS and CSRF.
- **RBAC**: Deny-by-default middleware (`requirePermission`).

## 2. Data Protection
- **Password Hashing**: Argon2id (Winner of Password Hashing Competition).
- **PII Masking**: Sensitive lead data is obfuscated at the API level based on the user's subscription status.
- **SQL Injection**: Exclusive use of parameterized queries via `pg` pool.

## 3. Infrastructure & API
- **Rate Limiting**: Redis-backed limits on all auth and search endpoints to prevent scraping and brute-force.
- **CORS**: Strict origin allowlist (no wildcards).
- **Helmet**: Security headers enabled to prevent clickjacking and MIME-sniffing.

## 4. Admin Safety
- Admin routes are protected by specific permissions.
- Audit logs track all sensitive admin actions (lead imports, user role changes).
