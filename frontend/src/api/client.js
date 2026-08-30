import { getAccessToken, setAccessToken, clearAccessToken } from "./tokenStorage";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Serializes concurrent 401s into a single /refresh call instead of firing
// one refresh request per failed request.
let refreshPromise = null;

async function rawRequest(path, { method = "GET", body, headers = {}, skipAuth = false, signal } = {}) {
  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";

  const token = getAccessToken();
  if (token && !skipAuth) finalHeaders.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    credentials: "include", // sends/receives the httpOnly refresh cookie
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
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

/**
 * Update own profile: first/last name, map-picked location and the
 * category / industry of interest that seed the directory's default filters.
 */
export async function updateProfile(payload) {
  return request("/api/auth/me", { method: "PATCH", body: payload });
}

export async function logout() {
  try {
    await request("/api/auth/logout", { method: "POST", skipAuth: true });
  } finally {
    clearAccessToken();
  }
}

// ---------------------------------------------------------------------------
// Geocoding (free map location picker) — proxied through the backend so the
// browser never calls the geocoding provider directly.
// ---------------------------------------------------------------------------
export async function geoSearch(q) {
  return request(`/api/geo/search?q=${encodeURIComponent(q)}`, { skipAuth: true });
}

export async function geoReverse(lat, lng) {
  return request(`/api/geo/reverse?lat=${lat}&lng=${lng}`, { skipAuth: true });
}

// ---------------------------------------------------------------------------
// Lead endpoints
// ---------------------------------------------------------------------------
export async function getLeads(params = {}, signal) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.append(key, value);
  });
  return request(`/api/leads?${query.toString()}`, { signal });
}

export async function getLeadById(id) {
  return request(`/api/leads/${id}`);
}

/**
 * Filter facets for the search page: categories, industries, countries,
 * states and cities — each with a result count — plus a location suggestion
 * derived from the signed-in user's profile. Pass the currently applied
 * filters so the options cascade (category narrows industries, country
 * narrows states, etc.).
 */
export async function getLeadFacets(params = {}, signal) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== false) {
      query.append(key, value);
    }
  });
  return request(`/api/leads/facets?${query.toString()}`, { signal });
}

/** Public aggregate counts used by the marketing landing page. */
export async function getLandingLeadStats() {
  return request("/api/leads/landing-stats", { method: "GET", skipAuth: true });
}

export async function getLeadStats(signal) {
  return request("/api/leads/stats", { method: "GET", signal });
}

/** Create a single lead manually (requires editor/admin role server-side). */
export async function createLead(payload) {
  return request("/api/leads", {
    method: "POST",
    body: payload,
  });
}

export async function getLeadForEdit(id, signal) {
  return request(`/api/leads/${id}/edit`, { signal });
}

export async function updateLead(id, payload) {
  return request(`/api/leads/${id}`, { method: "PUT", body: payload });
}

export async function getLeadDimensions(signal) {
  return request("/api/admin/lead-dimensions", { signal });
}

export async function renameLeadDimension(type, key, name) {
  return request(`/api/admin/lead-dimensions/${type}/${encodeURIComponent(key)}`, {
    method: "PATCH", body: { name },
  });
}

export async function deleteLeadDimension(type, key) {
  return request(`/api/admin/lead-dimensions/${type}/${encodeURIComponent(key)}`, {
    method: "DELETE", body: { confirmation: "DELETE" },
  });
}

/**
 * Bulk-import leads from raw CSV text (requires editor/admin role server-side).
 *
 * The third argument is either a field-mapping object (legacy positional
 * signature) or an options object `{ limit, offset, fieldMapping }`:
 *   - `limit` caps how many data rows are imported (from the start of the file);
 *   - `offset` skips rows first so you can import a window like rows 100001–200000;
 *   - `fieldMapping` re-maps arbitrary CSV columns to standard lead fields.
 */
export async function importLeadsCsv(csv, source = "csv_upload", thirdArg = {}) {
  let body;
  if (thirdArg && typeof thirdArg === "object" && !Array.isArray(thirdArg)) {
    // A bare field-mapping object is the legacy positional form: every value is
    // a { type: "single" | "combined", ... } config. Anything with option keys
    // (limit / offset / fieldMapping) is the options form.
    const isLegacyMapping =
      Object.keys(thirdArg).length > 0 &&
      Object.values(thirdArg).every(
        (v) => v && typeof v === "object" && (v.type === "single" || v.type === "combined")
      );
    body = isLegacyMapping
      ? { csv, source, fieldMapping: thirdArg }
      : { csv, source, ...thirdArg };
  } else {
    body = { csv, source };
  }
  return request("/api/leads/import", {
    method: "POST",
    body,
  });
}

/**
 * Bulk-import leads from a CSV File (requires editor/admin role server-side).
 * Sent as multipart/form-data so the file streams to the server instead of
 * being read fully into memory (avoids out-of-memory on 1M+ row files).
 * `options`: { source, limit, offset, fieldMapping }.
 */
export async function importLeadsFile(file, { source = "csv_upload", limit, offset, fieldMapping } = {}) {
  const formData = new FormData();
  // Busboy emits multipart parts in order. Send metadata first so the server
  // has the mapping before it starts consuming the streamed file.
  formData.append("source", source);
  if (fieldMapping) formData.append("fieldMapping", JSON.stringify(fieldMapping));
  formData.append("file", file);

  const query = new URLSearchParams();
  if (limit) query.set("limit", String(limit));
  if (offset) query.set("offset", String(offset));

  const token = getAccessToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // Note: no Content-Type header — the browser sets the multipart boundary.

  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE}/api/leads/import${suffix}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });

  return parseBody(response).then((data) => {
    if (!response.ok) {
      throw buildError(data, response);
    }
    return data;
  });
}

/** Parse CSV and return headers and sample data. Supports row range for large files. */
export async function parseCsv(csv, startRow = 0, endRow = null) {
  return request("/api/leads/parse-csv", {
    method: "POST",
    body: { csv, startRow, endRow },
  });
}

/** Delete all leads (requires admin role server-side). */
export async function deleteAllLeads() {
  return request("/api/admin/leads", {
    method: "DELETE",
  });
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

// -----------------------------------------------------------------------
// Admin endpoints (requires admin/super_admin role)
// -----------------------------------------------------------------------
export async function getAllUsers(signal) {
  return request("/api/admin/users", { method: "GET", signal });
}

export async function getUserById(id) {
  return request(`/api/admin/users/${id}`, { method: "GET" });
}

export async function createUser({ email, password, firstName, lastName, role }) {
  return request("/api/admin/users", {
    method: "POST",
    body: { email, password, firstName, lastName, role },
  });
}

export async function updateUserRole(userId, role, action = "assign") {
  return request(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    body: { role, action },
  });
}

export async function toggleUserActive(userId, is_active) {
  return request(`/api/admin/users/${userId}/active`, {
    method: "PATCH",
    body: { is_active },
  });
}

export async function getRoles(signal) {
  return request("/api/admin/roles", { method: "GET", signal });
}

// -----------------------------------------------------------------------
// Plans & billing
// -----------------------------------------------------------------------
export async function getPlans() {
  return request("/api/plans", { method: "GET" });
}

export async function getAdminPlans(signal) {
  return request("/api/admin/plans", { method: "GET", signal });
}

export async function createAdminPlan(planData) {
  return request("/api/admin/plans", {
    method: "POST",
    body: planData,
  });
}

export async function updateAdminPlan(id, planData) {
  return request(`/api/admin/plans/${id}`, {
    method: "PUT",
    body: planData,
  });
}

export async function deleteAdminPlan(id) {
  return request(`/api/admin/plans/${id}`, {
    method: "DELETE",
  });
}

export async function getMyBilling() {
  return request("/api/billing/me", { method: "GET" });
}

export async function subscribe(planCode) {
  return request("/api/billing/subscribe", {
    method: "POST",
    body: { planCode },
  });
}

export async function cancelSubscription() {
  return request("/api/billing/cancel", { method: "POST" });
}

export async function upgradeSubscription(newPlanCode) {
  return request("/api/billing/upgrade", {
    method: "POST",
    body: { newPlanCode },
  });
}

// -----------------------------------------------------------------------
// Server-side export — returns the file content + meta instead of JSON.
// -----------------------------------------------------------------------
export async function exportLeads(params = {}, format = "csv") {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) query.append(k, v);
  });
  query.append("format", format);

  let response = await rawRequest(`/api/leads/export?${query.toString()}`, {
    method: "POST",
  });
  if (response.status === 401 && !response._retried) {
    response._retried = true;
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await rawRequest(`/api/leads/export?${query.toString()}`, {
        method: "POST",
      });
    }
  }

  const contentType = response.headers.get("Content-Type") || "text/csv";
  if (!response.ok) {
    let data = {};
    try {
      data = await response.json();
    } catch {
      /* ignore */
    }
    throw buildError(data, response);
  }
  const content = await response.text();
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  return {
    content,
    contentType,
    filename: filenameMatch ? filenameMatch[1] : `freeleads_export.${format}`,
  };
}

// -----------------------------------------------------------------------
// Google OAuth
// -----------------------------------------------------------------------
export async function getGoogleAuthUrl() {
  return request("/api/auth/google/url", { method: "GET", skipAuth: true });
}

export async function loginWithGoogle(code, state) {
  return request(`/api/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {
    method: "GET",
    skipAuth: true,
  });
}

// -----------------------------------------------------------------------
// Admin: audit log + dedup
// -----------------------------------------------------------------------
export async function getAuditLogs(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) query.append(k, v);
  });
  return request(`/api/admin/audit-logs?${query.toString()}`, { method: "GET" });
}

export async function runDedup({ fields = ["email"], mode = "preview" }) {
  return request("/api/admin/leads/dedup", {
    method: "POST",
    body: { fields, mode },
  });
}

// -----------------------------------------------------------------------
// External ingest (machine-to-machine). Requires a signed request.
// -----------------------------------------------------------------------
export async function ingestLeads({ token, timestamp, nonce, signature, data }) {
  const payload = { data };
  return request("/api/leads/ingest", {
    method: "POST",
    skipAuth: true,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-request-timestamp": String(timestamp),
      "x-request-nonce": nonce,
      "x-signature": signature,
    },
    body: payload,
  });
}

export function buildIngestSignature({ token, hmacSecret, data }) {
  // Client-side helper for building the HMAC signature (used by admin tooling).
  const timestamp = Date.now();
  const nonce = `${timestamp}-${Math.random().toString(36).slice(2)}`;
  const bodyRaw = JSON.stringify({ data });
  // Note: in production compute this server-side with the same secret.
  return { timestamp, nonce };
}

// -----------------------------------------------------------------------
// Contact Us (public form + admin management)
// -----------------------------------------------------------------------

/** Submit a new contact form message. No authentication required. */
export async function submitContactForm(payload) {
  return request("/api/contact", {
    method: "POST",
    skipAuth: true,
    body: payload,
  });
}

/** Admin: list contact messages with optional status filter. */
export async function getContactMessages(params = {}, signal) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.append(k, v);
  });
  return request(`/api/contact?${query.toString()}`, { method: "GET", signal });
}

/** Admin: get a single contact message (and auto-mark as read). */
export async function getContactMessage(id, signal) {
  return request(`/api/contact/${id}`, { method: "GET", signal });
}

/** Admin: patch a contact message (status and/or reply). */
export async function updateContactMessage(id, payload) {
  return request(`/api/contact/${id}`, { method: "PATCH", body: payload });
}

/** Admin: dashboard tile stats for contact messages. */
export async function getContactStats(signal) {
  return request("/api/contact/stats", { method: "GET", signal });
}

// -----------------------------------------------------------------------
// Blog (public listing + admin CRUD)
// -----------------------------------------------------------------------

/** Public: list published blog posts. */
export async function getPublishedPosts(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.append(k, v);
  });
  return request(`/api/blog?${query.toString()}`, { method: "GET", skipAuth: true });
}

/** Public: get a single published post by slug. */
export async function getPublishedPostBySlug(slug) {
  return request(`/api/blog/${encodeURIComponent(slug)}`, {
    method: "GET",
    skipAuth: true,
  });
}

/** Admin: list all blog posts (any status). */
export async function adminListPosts(params = {}, signal) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.append(k, v);
  });
  return request(`/api/blog/admin/all?${query.toString()}`, { method: "GET", signal });
}

/** Admin: get a single post (any status) by id. */
export async function adminGetPost(id, signal) {
  return request(`/api/blog/admin/${id}`, { method: "GET", signal });
}

/** Admin: create a new blog post. */
export async function adminCreatePost(payload) {
  return request("/api/blog", { method: "POST", body: payload });
}

/** Admin: update a blog post. */
export async function adminUpdatePost(id, payload) {
  return request(`/api/blog/${id}`, { method: "PUT", body: payload });
}

/** Admin: delete a blog post. */
export async function adminDeletePost(id) {
  return request(`/api/blog/${id}`, { method: "DELETE" });
}

/** Geocode a single lead by ID (admin only). */
export async function geocodeLead(id) {
  return request(`/api/leads/geocode/${id}`, {
    method: "POST",
  });
}

/** Run batch geocoding for leads without coordinates (admin only). */
export async function runGeocodingBatch() {
  return request("/api/leads/geocode/batch", {
    method: "POST",
  });
}

// Re-export token helpers so pages (e.g. the Google callback) can set the
// in-memory access token after an OAuth login.
export { setAccessToken, getAccessToken, clearAccessToken } from "./tokenStorage";
