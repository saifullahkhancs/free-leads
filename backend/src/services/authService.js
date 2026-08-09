const { query, withTransaction } = require("../config/db");
const redis = require("../config/redis");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const {
  hashPassword,
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  createPasswordResetToken,
  verifyPasswordResetToken,
  generateTokenId,
  generateVerificationCode,
  hashToken,
} = require("../utils/security");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  EmailDeliveryError,
} = require("./emailService");

const VERIFICATION_CODE_TTL_MS = env.VERIFICATION_CODE_TTL_MINUTES * 60 * 1000;
const VERIFICATION_ATTEMPT_WINDOW_MS = env.VERIFICATION_ATTEMPT_WINDOW_MINUTES * 60 * 1000;
const DEFAULT_ROLE = "user";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function findUserByEmail(email) {
  const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] || null;
}

async function getUserRoles(userId) {
  const { rows } = await query(
    `SELECT r.name FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.name);
}

async function getUserPermissions(userId) {
  const { rows } = await query(
    `SELECT DISTINCT p.code FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.code);
}

async function assignDefaultRole(client, userId) {
  const { rows } = await client.query("SELECT id FROM roles WHERE name = $1", [DEFAULT_ROLE]);
  if (!rows[0]) return; // seed not run yet — don't hard-fail registration
  await client.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, rows[0].id]
  );
}

function sanitizeUser(user, roles = []) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    isActive: user.is_active,
    isEmailVerified: user.is_email_verified,
    roles,
    createdAt: user.created_at,
  };
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------
async function register({ firstName, lastName, email, password }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    // Same behavior as job-easy: don't leak whether the email exists via a
    // distinct error — respond as if a code was (re)sent.
    return { message: "User already exists" };
  }

  const passwordHash = await hashPassword(password);
  const verificationCode = generateVerificationCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_TTL_MS);

  let user;
  try {
    user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users
           (email, password_hash, first_name, last_name, is_email_verified,
            verification_code, verification_code_expires_at,
            verification_attempt_count, verification_attempt_window_start)
         VALUES ($1,$2,$3,$4,false,$5,$6,0,$7)
         RETURNING *`,
        [email, passwordHash, firstName, lastName, verificationCode, expiresAt, now]
      );
      const created = rows[0];
      await assignDefaultRole(client, created.id);
      return created;
    });
  } catch (err) {
    if (err.code === "23505") {
      // unique_violation race
      return { message: "User already exists" };
    }
    throw err;
  }

  try {
    await sendVerificationEmail(user.email, verificationCode);
  } catch (err) {
    if (err instanceof EmailDeliveryError) {
      throw new ApiError(503, "Account created, but verification email could not be sent");
    }
    throw err;
  }

  return { message: "Verification code sent to email" };
}

// ---------------------------------------------------------------------------
// Verify email
// ---------------------------------------------------------------------------
async function verifyEmail({ email, code }) {
  const user = await findUserByEmail(email);
  if (!user) throw new ApiError(400, "Invalid code or email");

  const now = new Date();
  let attemptCount = user.verification_attempt_count || 0;
  let windowStart = user.verification_attempt_window_start
    ? new Date(user.verification_attempt_window_start)
    : null;

  if (!windowStart || windowStart.getTime() + VERIFICATION_ATTEMPT_WINDOW_MS <= now.getTime()) {
    windowStart = now;
    attemptCount = 0;
  }

  if (attemptCount >= env.VERIFICATION_ATTEMPT_LIMIT) {
    await query(
      `UPDATE users SET verification_attempt_count = $1, verification_attempt_window_start = $2 WHERE id = $3`,
      [attemptCount, windowStart, user.id]
    );
    throw new ApiError(429, "Too many verification attempts. Please try again later.");
  }

  attemptCount += 1;

  const codeExpiresAt = user.verification_code_expires_at
    ? new Date(user.verification_code_expires_at)
    : null;

  if (!codeExpiresAt || codeExpiresAt.getTime() <= now.getTime()) {
    await query(
      `UPDATE users SET verification_attempt_count = $1, verification_attempt_window_start = $2 WHERE id = $3`,
      [attemptCount, windowStart, user.id]
    );
    throw new ApiError(400, "Code expired");
  }

  if (user.verification_code !== code) {
    await query(
      `UPDATE users SET verification_attempt_count = $1, verification_attempt_window_start = $2 WHERE id = $3`,
      [attemptCount, windowStart, user.id]
    );
    throw new ApiError(400, "Invalid code or email");
  }

  await query(
    `UPDATE users SET is_email_verified = true, verification_code = NULL,
       verification_code_expires_at = NULL, verification_attempt_count = 0,
       verification_attempt_window_start = NULL
     WHERE id = $1`,
    [user.id]
  );

  return { message: "Account verified successfully" };
}

// ---------------------------------------------------------------------------
// Resend verification
// ---------------------------------------------------------------------------
async function resendVerification({ email }) {
  const user = await findUserByEmail(email);
  if (!user) throw new ApiError(404, "User not found");
  if (user.is_email_verified) return { message: "Account already verified" };

  const verificationCode = generateVerificationCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_TTL_MS);

  await query(
    `UPDATE users SET verification_code = $1, verification_code_expires_at = $2,
       verification_attempt_count = 0, verification_attempt_window_start = $3
     WHERE id = $4`,
    [verificationCode, expiresAt, now, user.id]
  );

  try {
    await sendVerificationEmail(user.email, verificationCode);
  } catch (err) {
    if (err instanceof EmailDeliveryError) {
      throw new ApiError(503, "Verification email could not be sent");
    }
    throw err;
  }

  return { message: "Verification code sent to email" };
}

// ---------------------------------------------------------------------------
// Token issuance (access + refresh, refresh persisted hashed in Postgres)
// ---------------------------------------------------------------------------
async function issueTokens(user, roles, meta = {}) {
  const jti = generateTokenId();
  const accessToken = createAccessToken({ sub: user.id, email: user.email, roles });
  const refreshToken = createRefreshToken({ sub: user.id }, jti);

  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [jti, user.id, hashToken(refreshToken), expiresAt, meta.userAgent || null, meta.ip || null]
  );

  return { accessToken, refreshToken, jti };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
async function login({ email, password }, meta = {}) {
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(user.password_hash, password))) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (!user.is_active) {
    throw new ApiError(403, "This account has been deactivated");
  }

  if (!user.is_email_verified) {
    const verificationCode = generateVerificationCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_TTL_MS);
    await query(
      `UPDATE users SET verification_code = $1, verification_code_expires_at = $2,
         verification_attempt_count = 0, verification_attempt_window_start = $3
       WHERE id = $4`,
      [verificationCode, expiresAt, now, user.id]
    );
    try {
      await sendVerificationEmail(user.email, verificationCode);
    } catch {
      // Don't block the client from learning it needs to verify, even if
      // the resend itself failed — same behavior as job-easy.
    }
    throw new ApiError(403, "User not verified. A new verification code has been sent.");
  }

  const roles = await getUserRoles(user.id);
  const { accessToken, refreshToken } = await issueTokens(user, roles, meta);

  return { user: sanitizeUser(user, roles), accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// Refresh — rotates the refresh token and detects reuse of a revoked token
// (Section 6: "refresh token rotation with reuse detection").
// ---------------------------------------------------------------------------
async function refresh({ refreshToken }, meta = {}) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
    if (payload.token_type !== "refresh") throw new Error("wrong token type");
  } catch {
    throw new ApiError(401, "Invalid refresh token");
  }

  const tokenHash = hashToken(refreshToken);
  const { rows } = await query("SELECT * FROM refresh_tokens WHERE id = $1", [payload.jti]);
  const stored = rows[0];

  if (!stored || stored.token_hash !== tokenHash) {
    throw new ApiError(401, "Invalid refresh token");
  }

  if (stored.revoked) {
    // Reuse of a rotated-out token: treat as a possible theft and revoke the
    // entire chain for this user, forcing re-authentication everywhere.
    await revokeAllForUser(stored.user_id);
    throw new ApiError(401, "Refresh token reuse detected — all sessions revoked");
  }

  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    throw new ApiError(401, "Refresh token expired");
  }

  const user = await findUserById(stored.user_id);
  if (!user || !user.is_active || !user.is_email_verified) {
    throw new ApiError(401, "Invalid refresh token");
  }

  const roles = await getUserRoles(user.id);
  const { accessToken, refreshToken: newRefreshToken, jti } = await issueTokens(user, roles, meta);

  await query("UPDATE refresh_tokens SET revoked = true, replaced_by = $1 WHERE id = $2", [
    jti,
    stored.id,
  ]);

  return { accessToken, refreshToken: newRefreshToken };
}

async function revokeAllForUser(userId) {
  await query("UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false", [
    userId,
  ]);
}

// ---------------------------------------------------------------------------
// Logout — revoke the presented refresh token and blacklist its jti in
// Redis for the remainder of its natural life (defense in depth in case a
// copy of the access token is replayed before it expires).
// ---------------------------------------------------------------------------
async function logout({ refreshToken }) {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    await query("UPDATE refresh_tokens SET revoked = true WHERE id = $1", [payload.jti]);
    const ttlSeconds = Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
    await redis.set(`revoked_refresh:${payload.jti}`, "1", "EX", ttlSeconds);
  } catch {
    // Already invalid/expired — nothing to revoke.
  }
}

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------
const PASSWORD_RESET_MESSAGE =
  "If an account exists for this email, a password reset link has been sent";

async function forgotPassword({ email }) {
  const user = await findUserByEmail(email);
  if (!user) return { message: PASSWORD_RESET_MESSAGE };

  const tokenId = generateTokenId();
  const resetToken = createPasswordResetToken(user.id, tokenId);
  const expiresAt = new Date(
    Date.now() + env.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES * 60 * 1000
  );

  await query(
    `INSERT INTO password_reset_tokens (token_id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [tokenId, user.id, expiresAt]
  );

  const resetLink = `${env.PASSWORD_RESET_URL}?token=${resetToken}`;

  try {
    await sendPasswordResetEmail(user.email, resetLink);
  } catch (err) {
    if (err instanceof EmailDeliveryError) {
      throw new ApiError(503, "Password reset email could not be sent");
    }
    throw err;
  }

  return { message: PASSWORD_RESET_MESSAGE };
}

async function resetPassword({ token, password }) {
  let payload;
  try {
    payload = verifyPasswordResetToken(token);
    if (payload.token_type !== "password_reset") throw new Error("wrong token type");
  } catch {
    throw new ApiError(401, "Invalid or expired reset token");
  }

  const { rows } = await query(
    "SELECT * FROM password_reset_tokens WHERE token_id = $1",
    [payload.jti]
  );
  const resetToken = rows[0];

  if (
    !resetToken ||
    resetToken.used ||
    resetToken.user_id !== payload.sub ||
    new Date(resetToken.expires_at).getTime() <= Date.now()
  ) {
    throw new ApiError(401, "Invalid or expired reset token");
  }

  const user = await findUserById(payload.sub);
  if (!user) throw new ApiError(401, "Invalid or expired reset token");

  const passwordHash = await hashPassword(password);
  await withTransaction(async (client) => {
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      user.id,
    ]);
    await client.query("UPDATE password_reset_tokens SET used = true WHERE token_id = $1", [
      payload.jti,
    ]);
    // Reset a compromised/forgotten password -> kill all existing sessions.
    await client.query(
      "UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false",
      [user.id]
    );
  });

  return { message: "Password reset successfully" };
}

// ---------------------------------------------------------------------------
// Current user / profile
// ---------------------------------------------------------------------------
async function getCurrentUser(userId) {
  const user = await findUserById(userId);
  if (!user) throw new ApiError(404, "User not found");
  const roles = await getUserRoles(user.id);
  const permissions = await getUserPermissions(user.id);
  return { ...sanitizeUser(user, roles), permissions };
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  getUserRoles,
  getUserPermissions,
  findUserByEmail,
  findUserById,
  sanitizeUser,
};
