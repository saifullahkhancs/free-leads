import { getAccessToken, setAccessToken, clearAccessToken } from "./tokenStorage";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Serializes concurrent 401s into a single /refresh call instead of firing
// one refresh request per failed request.
let refreshPromise = null;

async function rawRequest(path, { method = "GET", body, headers = {}, skipAuth = false } = {}) {
  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";

  const token = getAccessToken();
  if (token && !skipAuth) finalHeaders.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    credentials: "include", // sends/receives the httpOnly refresh cookie
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return response;
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = rawRequest("/api/auth/refresh", { method: "POST", skipAuth: true })
      .then(async (response) => {
        if (!response.ok) {
          clearAccessToken();
          return null;
        }
        const data = await response.json();
        setAccessToken(data.access_token);
        return data.access_token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function parseBody(response) {
  return response.json().catch(() => ({}));
}

function buildError(data, response) {
  let message = "Request failed";
  const { detail } = data;
  if (typeof detail === "string") {
    message = detail;
  } else if (Array.isArray(detail)) {
    message = detail.map((item) => item.msg || item.message).join(", ");
  } else if (data.message) {
    message = data.message;
  }
  const error = new Error(message);
  error.status = response.status;
  error.data = data;
  return error;
}

/**
 * Authenticated request helper. On a 401 (expired access token) it attempts
 * exactly one silent refresh via the httpOnly refresh cookie, then retries
 * the original request once.
 */
async function request(path, options = {}) {
  let response = await rawRequest(path, options);

  if (response.status === 401 && !options.skipAuth && !options._retried) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await rawRequest(path, options);
    }
  }

  const data = await parseBody(response);
  if (!response.ok) throw buildError(data, response);
  return data;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------
export async function register(firstName, lastName, email, password) {
  return request("/api/auth/register", {
    method: "POST",
    skipAuth: true,
    body: { firstName, lastName, email, password },
  });
}

export async function login(email, password) {
  const data = await request("/api/auth/login", {
    method: "POST",
    skipAuth: true,
    body: { email, password },
  });
  setAccessToken(data.access_token);
  return data;
}

export async function verifyEmail(email, code) {
  return request("/api/auth/verify-email", {
    method: "POST",
    skipAuth: true,
    body: { email, code },
  });
}

export async function resendVerification(email) {
  return request("/api/auth/resend-verification", {
    method: "POST",
    skipAuth: true,
    body: { email },
  });
}

export async function forgotPassword(email) {
  return request("/api/auth/forgot-password", {
    method: "POST",
    skipAuth: true,
    body: { email },
  });
}

export async function resetPassword(token, password) {
  return request("/api/auth/reset-password", {
    method: "POST",
    skipAuth: true,
    body: { token, password },
  });
}

export async function getCurrentUser() {
  return request("/api/auth/me", { method: "GET" });
}

export async function logout() {
  try {
    await request("/api/auth/logout", { method: "POST", skipAuth: true });
  } finally {
    clearAccessToken();
  }
}

// ---------------------------------------------------------------------------
// Lead endpoints
// ---------------------------------------------------------------------------
export async function getLeads(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.append(key, value);
  });
  return request(`/api/leads?${query.toString()}`);
}

export async function getLeadById(id) {
  return request(`/api/leads/${id}`);
}

/** Called once on app load to silently restore a session from the refresh cookie. */
export async function trySilentLogin() {
  const token = await refreshAccessToken();
  if (!token) return null;
  try {
    return await getCurrentUser();
  } catch {
    clearAccessToken();
    return null;
  }
}
