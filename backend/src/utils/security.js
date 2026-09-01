const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const env = require("../config/env");

// ---------------------------------------------------------------------------
// Password hashing — argon2id, per the dev doc's "argon2 password hashing"
// requirement (Module 1 + Section 6 mitigation for credential stuffing).
// ---------------------------------------------------------------------------
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, OWASP-recommended baseline
  timeCost: 2,
  parallelism: 1,
};

async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// JWTs — short-lived access token + longer-lived refresh token, signed with
// separate secrets (Section 6: "Short-lived access tokens (~15 min), httpOnly
// + secure refresh cookie, refresh token rotation with reuse detection").
// ---------------------------------------------------------------------------
function createAccessToken(payload) {
  return jwt.sign({ ...payload, token_type: "access" }, env.JWT_ACCESS_SECRET, {
    algorithm: env.JWT_ALGORITHM,
    expiresIn: `${env.ACCESS_TOKEN_EXPIRE_MINUTES}m`,
  });
}

function createRefreshToken(payload, jti) {
  return jwt.sign(
    { ...payload, token_type: "refresh", jti },
    env.JWT_REFRESH_SECRET,
    {
      algorithm: env.JWT_ALGORITHM,
      expiresIn: `${env.REFRESH_TOKEN_EXPIRE_MINUTES}m`,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [env.JWT_ALGORITHM] });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [env.JWT_ALGORITHM] });
}

function createPasswordResetToken(userId, tokenId) {
  return jwt.sign(
    { sub: userId, jti: tokenId, token_type: "password_reset" },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: env.JWT_ALGORITHM,
      expiresIn: `${env.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES}m`,
    }
  );
}

function verifyPasswordResetToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [env.JWT_ALGORITHM] });
}

// ---------------------------------------------------------------------------
// Misc token helpers
// ---------------------------------------------------------------------------
function generateTokenId() {
  // refresh_tokens.id is a UUID column, so token ids (jti) must be UUIDs.
  return uuidv4();
}

function generateVerificationCode(digits = 5) {
  let code = "";
  for (let i = 0; i < digits; i++) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

// Refresh tokens are stored hashed (never raw) in Postgres, mirroring the
// dev doc's refresh_tokens.token_hash column.
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  createPasswordResetToken,
  verifyPasswordResetToken,
  generateTokenId,
  generateVerificationCode,
  hashToken,
};
