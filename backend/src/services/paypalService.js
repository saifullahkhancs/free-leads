const crypto = require("crypto");
const env = require("../config/env");

/**
 * paypalService — translated from the WP plugins' PayPal integration
 * (flapp_get_paypal_subscription_details, flapp_verify_paypal_webhook, cancel).
 *
 * When PAYPAL_CLIENT_ID is blank the service runs in MOCK mode so the whole
 * billing flow can be developed/tested locally without PayPal sandbox creds.
 * In mock mode:
 *   - subscribe() returns a fake paypal_subscription_id
 *   - createSubscription returns an approval URL to a local confirm route
 *   - the webhook handler accepts our own confirm event (see billingController)
 */

function isConfigured() {
  return !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

function apiBase() {
  return env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getOAuthToken() {
  const auth = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed (${res.status})`);
  const data = await res.json();
  return data.access_token;
}

/**
 * Fetch the real plan id tied to a PayPal subscription (server-side), so we
 * can reject a user who claims plan X but actually subscribed to plan Y.
 */
async function getSubscriptionDetails(paypalSubscriptionId) {
  const token = await getOAuthToken();
  const res = await fetch(
    `${apiBase()}/v1/billing/subscriptions/${encodeURIComponent(paypalSubscriptionId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error(`PayPal subscription lookup failed (${res.status})`);
  return res.json();
}

/** Validate a PayPal subscription id format BEFORE any outbound call (SSRF guard). */
function isValidSubscriptionId(id) {
  return typeof id === "string" && /^[A-Z0-9_\-]{10,50}$/.test(id);
}

/** Verify a webhook via PayPal's verify-webhook-signature endpoint. */
async function verifyWebhookSignature(payload, headers) {
  if (!isConfigured() || !env.PAYPAL_WEBHOOK_ID) {
    // Without creds/webhook-id we can't verify — see env.PAYPAL_TEST_WEBHOOK.
    return { verified: false, reason: "paypal_not_configured" };
  }
  const token = await getOAuthToken();
  const body = {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: env.PAYPAL_WEBHOOK_ID,
    webhook_event: payload,
  };
  const res = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PayPal webhook verify failed (${res.status})`);
  const data = await res.json();
  return { verified: data.verification_status === "SUCCESS", data };
}

/** Cancel a PayPal subscription server-side. */
async function cancelSubscription(paypalSubscriptionId) {
  const token = await getOAuthToken();
  const res = await fetch(
    `${apiBase()}/v1/billing/subscriptions/${encodeURIComponent(paypalSubscriptionId)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "Cancelled by customer" }),
    }
  );
  // 204 = cancelled, 422 = already cancelled (treat as success).
  return res.ok || res.status === 422;
}

/** Mock helpers (no PayPal configured) --------------------------------- */

function mockSubscriptionId() {
  return `MOCK-${crypto.randomBytes(10).toString("hex").toUpperCase()}`;
}

module.exports = {
  isConfigured,
  isValidSubscriptionId,
  getOAuthToken,
  getSubscriptionDetails,
  verifyWebhookSignature,
  cancelSubscription,
  mockSubscriptionId,
  apiBase,
};
