const crypto = require("crypto");
const redis = require("../config/redis");
const env = require("../config/env");
const { query } = require("../config/db");

/**
 * googleService — "Sign in with Google", translated from the WP plugins'
 * flapp_get_google_auth_url / flapp_handle_google_callback.
 *
 * The OAuth 'state' is a random token stored in Redis and verified on callback
 * (CSRF defense). Token exchange happens server-side; the client secret never
 * touches the browser.
 */

function isConfigured() {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Generate a state nonce and stash it in Redis, return the consent URL. */
async function getAuthUrl() {
  const state = crypto.randomBytes(24).toString("hex");
  await redis.set(`google:state:${state}`, "1", "EX", env.GOOGLE_STATE_TTL_SECONDS);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Verify the state nonce (blocks OAuth CSRF). */
async function verifyState(state) {
  if (!state) return false;
  const ok = await redis.del(`google:state:${state}`);
  return ok === 1;
}

/** Exchange the authorization code for tokens (server-side). */
async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("Google token exchange failed");
  return res.json();
}

/** Fetch the user's profile from Google. */
async function getUserInfo(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Google userinfo failed");
  return res.json();
}

/** Find a user by linked google_id, else by email. */
async function findUserByGoogleId(googleId) {
  const { rows } = await query(
    "SELECT * FROM users WHERE google_id = $1 LIMIT 1",
    [googleId]
  );
  return rows[0] || null;
}

module.exports = {
  isConfigured,
  getAuthUrl,
  verifyState,
  exchangeCode,
  getUserInfo,
  findUserByGoogleId,
};
