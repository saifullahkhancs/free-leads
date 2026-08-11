const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");
const { query, withTransaction } = require("../config/db");
const quotaService = require("../services/quotaService");
const paypalService = require("../services/paypalService");
const auditService = require("../services/auditService");

/** GET /api/plans — public list of plans (used by the plan picker UI). */
const getPlans = asyncHandler(async (req, res) => {
  const plans = await quotaService.getPlans();
  res.status(200).json({
    status: "success",
    data: plans.map((p) => ({
      code: p.code,
      name: p.name,
      price_cents: p.price_cents,
      billing_cycle: p.billing_cycle,
      daily_search_quota: p.daily_search_quota,
      daily_export_quota: p.daily_export_quota,
      max_export_per_req: p.max_export_per_req,
      allowed_formats: p.allowed_formats,
      can_view_contact: p.can_view_contact,
      show_email: p.show_email !== undefined ? Boolean(p.show_email) : Boolean(p.can_view_contact),
      show_phone: p.show_phone !== undefined ? Boolean(p.show_phone) : Boolean(p.can_view_contact),
      show_linkedin: p.show_linkedin !== undefined ? Boolean(p.show_linkedin) : Boolean(p.can_view_contact),
      show_twitter: p.show_twitter !== undefined ? Boolean(p.show_twitter) : Boolean(p.can_view_contact),
      show_website: p.show_website !== undefined ? Boolean(p.show_website) : Boolean(p.can_view_contact),
      show_about: p.show_about !== undefined ? Boolean(p.show_about) : Boolean(p.can_view_contact),
      is_default: p.is_default,
      is_popular: Boolean(p.is_popular),
      description: p.description || "",
      cta_text: p.cta_text || "",
      cta_url: p.cta_url || "",
    })),
  });
});

/** GET /api/billing/me — the logged-in user's plan + usage snapshot. */
const getMyBilling = asyncHandler(async (req, res) => {
  const status = await quotaService.getQuotaStatus(req.user.id);
  const { rows } = await query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [req.user.id]
  );
  res.status(200).json({
    status: "success",
    data: { quota: status, subscription: rows[0] || null },
  });
});

/**
 * POST /api/billing/subscribe — body { planCode }.
 * Creates a subscription. In mock mode (no PayPal creds) it activates
 * immediately so the flow is testable; in real mode it creates a PayPal
 * subscription and returns an approval URL (activation waits for the webhook).
 */
const subscribe = asyncHandler(async (req, res) => {
  const { planCode } = req.body || {};
  if (!planCode) throw new ApiError(400, "planCode is required");

  const plan = await getPlanByCode(planCode);
  if (!plan) throw new ApiError(404, "Plan not found");
  if (plan.is_default || !(plan.price_cents > 0)) {
    throw new ApiError(400, "Cannot subscribe to the free plan via billing");
  }

  let status = "pending";
  let paypalSubscriptionId = null;
  let approvalUrl = null;
  let mock = !paypalService.isConfigured();

  if (mock) {
    // Local mock: activate immediately.
    paypalSubscriptionId = paypalService.mockSubscriptionId();
    status = "active";
  } else {
    // Real PayPal: create a subscription referencing the plan's paypal_plan_id.
    if (!plan.paypal_plan_id) {
      throw new ApiError(400, "This plan has no PayPal plan id configured");
    }
    const created = await createPayPalSubscription(plan.paypal_plan_id);
    paypalSubscriptionId = created.id;
    approvalUrl = created.links?.find((l) => l.rel === "approve")?.href || null;
  }

  const { rows } = await query(
    `INSERT INTO subscriptions
       (user_id, plan_id, paypal_subscription_id, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, status`,
    [req.user.id, plan.id, paypalSubscriptionId, status]
  );

  await auditService.log({
    actorId: req.user.id,
    action: "subscribe",
    entityType: "subscription",
    entityId: rows[0].id,
    metadata: { plan: plan.code, mock, status },
    ip: req.ip,
  });

  res.status(201).json({
    status: "success",
    data: {
      subscriptionId: rows[0].id,
      status: rows[0].status,
      plan: plan.code,
      paypalSubscriptionId,
      approvalUrl,
      mock,
    },
  });
});

/** POST /api/billing/cancel — cancels the user's active subscription. */
const cancel = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = $1 AND s.status = 'active'
     ORDER BY s.created_at DESC LIMIT 1`,
    [req.user.id]
  );
  const sub = rows[0];
  if (!sub) throw new ApiError(404, "No active subscription to cancel");

  // Ownership check happens implicitly (we scoped by user_id above).
  let cancelledOnPayPal = true;
  if (sub.paypal_subscription_id && paypalService.isConfigured()) {
    cancelledOnPayPal = await paypalService.cancelSubscription(sub.paypal_subscription_id);
  }

  await query(
    "UPDATE subscriptions SET status = 'cancelled', updated_at = now() WHERE id = $1",
    [sub.id]
  );

  await auditService.log({
    actorId: req.user.id,
    action: "cancel_subscription",
    entityType: "subscription",
    entityId: sub.id,
    metadata: { plan: sub.plan_code, cancelledOnPayPal },
    ip: req.ip,
  });

  res.status(200).json({ status: "success", data: { cancelled: true, plan: sub.plan_code } });
});

/**
 * POST /api/billing/upgrade — body { newPlanCode }.
 * The server computes the ONLY valid next plan and rejects anything else,
 * so a user can't jump sideways/down via a tampered request.
 */
const upgrade = asyncHandler(async (req, res) => {
  const { newPlanCode } = req.body || {};
  const current = await quotaService.getActivePlan(req.user.id);
  const nextPlan = await quotaService.getNextPlan(current);

  if (!nextPlan) throw new ApiError(400, "You are already on the highest plan");
  if (newPlanCode !== nextPlan.code) {
    throw new ApiError(
      400,
      `The only valid upgrade from "${current.code}" is "${nextPlan.code}"`
    );
  }

  // Cancel the old one (best-effort) and mark it upgraded.
  await query(
    `UPDATE subscriptions SET status = 'upgraded', updated_at = now()
     WHERE user_id = $1 AND status = 'active'`,
    [req.user.id]
  );

  let paypalSubscriptionId = null;
  let mock = !paypalService.isConfigured();
  let status = "active";
  if (mock) {
    paypalSubscriptionId = paypalService.mockSubscriptionId();
  } else {
    status = "pending";
    if (!nextPlan.paypal_plan_id) throw new ApiError(400, "Plan has no PayPal id");
    const created = await createPayPalSubscription(nextPlan.paypal_plan_id);
    paypalSubscriptionId = created.id;
  }

  const { rows } = await query(
    `INSERT INTO subscriptions (user_id, plan_id, paypal_subscription_id, status)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [req.user.id, nextPlan.id, paypalSubscriptionId, status]
  );

  await auditService.log({
    actorId: req.user.id,
    action: "upgrade_subscription",
    entityType: "subscription",
    entityId: rows[0].id,
    metadata: { from: current.code, to: nextPlan.code, mock },
    ip: req.ip,
  });

  res.status(200).json({
    status: "success",
    data: { subscriptionId: rows[0].id, plan: nextPlan.code, status, mock },
  });
});

/**
 * POST /api/billing/webhook — PayPal webhook receiver.
 * This is the ONLY place a subscription becomes 'active' in real mode.
 * Body size is capped (PayPal payloads are small) and the signature is
 * verified unless PAYPAL_TEST_WEBHOOK=true (local testing).
 */
const webhook = asyncHandler(async (req, res) => {
  const payload = req.body || {};

  const testMode = env.PAYPAL_TEST_WEBHOOK === true;
  if (!testMode && paypalService.isConfigured()) {
    const { verified } = await paypalService.verifyWebhookSignature(payload, req.headers);
    if (!verified) {
      throw new ApiError(400, "Webhook signature verification failed");
    }
  } else if (!testMode) {
    // Neither test mode nor configured — refuse to process untrusted events.
    throw new ApiError(400, "Webhook not configured (set PAYPAL_TEST_WEBHOOK=true to test)");
  }

  const eventType = payload.event_type;
  const resource = payload.resource || {};
  const paypalSubscriptionId = resource.id;

  // Find the matching subscription (by PayPal id or, in mock/test, latest pending).
  let sub = null;
  if (paypalSubscriptionId) {
    const { rows } = await query(
      `SELECT s.*, p.code AS plan_code FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.paypal_subscription_id = $1 LIMIT 1`,
      [paypalSubscriptionId]
    );
    sub = rows[0] || null;
  }
  if (!sub) {
    const { rows } = await query(
      `SELECT s.*, p.code AS plan_code FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.status = 'pending' ORDER BY s.created_at DESC LIMIT 1`
    );
    sub = rows[0] || null;
  }

  if (!sub) {
    // No matching subscription — still ack to avoid PayPal retry storms.
    return res.status(200).json({ received: true });
  }

  await withTransaction(async (client) => {
    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
      await client.query(
        `UPDATE subscriptions SET status = 'active', updated_at = now() WHERE id = $1`,
        [sub.id]
      );
    } else if (eventType === "BILLING.SUBSCRIPTION.PAYMENT.COMPLETED") {
      await client.query(
        `UPDATE subscriptions SET status = 'active', updated_at = now() WHERE id = $1`,
        [sub.id]
      );
      await client.query(
        `INSERT INTO payment_transactions
           (user_id, subscription_id, paypal_order_id, paypal_transaction_id,
            amount_cents, currency, status, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7)`,
        [
          sub.user_id,
          sub.id,
          resource.billing_agreement_id || null,
          resource.id || null,
          Math.round((resource.amount?.total || 0) * 100),
          resource.amount?.currency || "USD",
          JSON.stringify(payload),
        ]
      );
    } else if (
      eventType === "BILLING.SUBSCRIPTION.CANCELLED" ||
      eventType === "BILLING.SUBSCRIPTION.EXPIRED"
    ) {
      await client.query(
        `UPDATE subscriptions SET status = 'cancelled', updated_at = now() WHERE id = $1`,
        [sub.id]
      );
    }
  });

  await auditService.log({
    actorId: sub.user_id,
    action: "paypal_webhook",
    entityType: "subscription",
    entityId: sub.id,
    metadata: { eventType, plan: sub.plan_code },
  });

  res.status(200).json({ received: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getPlanByCode(code) {
  const { rows } = await query("SELECT * FROM plans WHERE code = $1 LIMIT 1", [code]);
  return rows[0] || null;
}

/** Create a PayPal subscription (real mode) and return the created resource. */
async function createPayPalSubscription(paypalPlanId) {
  const token = await paypalService.getOAuthToken();
  const res = await fetch(`${paypalService.apiBase()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: paypalPlanId,
      application_context: {
        return_url: `${env.FRONTEND_BASE_URL}/billing?status=success`,
        cancel_url: `${env.FRONTEND_BASE_URL}/billing?status=cancelled`,
      },
    }),
  });
  if (!res.ok) throw new Error(`PayPal create subscription failed (${res.status})`);
  return res.json();
}

module.exports = {
  getPlans,
  getMyBilling,
  subscribe,
  cancel,
  upgrade,
  webhook,
};
