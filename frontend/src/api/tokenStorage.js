// Only the short-lived ACCESS token ever touches the browser's JS-accessible
// storage. The refresh token is issued as an httpOnly, Secure, SameSite=strict
// cookie by the backend (see backend/src/controllers/authController.js) and is
// never readable from here — this is the httpOnly-cookie recommendation from
// the dev doc's Section 6 security checklist (JWT theft / replay mitigation).
//
// We keep the access token in memory (module-level var) for the current tab,
// with sessionStorage as a fallback so a hard page refresh doesn't force an
// extra network round trip before AuthProvider's silent refresh finishes.
// sessionStorage (not localStorage) preserves the original app's per-tab
// isolation: logging in as a different user in another tab won't clobber
// this tab's session.

const ACCESS_KEY = "access_token";

let inMemoryAccessToken = null;

function safeGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // storage disabled/full - in-memory copy still works for this page life
  }
}

function safeRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getAccessToken() {
  if (inMemoryAccessToken) return inMemoryAccessToken;
  const stored = safeGet(ACCESS_KEY);
  if (stored) inMemoryAccessToken = stored;
  return stored;
}

export function setAccessToken(token) {
  inMemoryAccessToken = token || null;
  if (token) {
    safeSet(ACCESS_KEY, token);
  } else {
    safeRemove(ACCESS_KEY);
  }
}

export function clearAccessToken() {
  inMemoryAccessToken = null;
  safeRemove(ACCESS_KEY);
}

export function hasAccessToken() {
  return Boolean(getAccessToken());
}
