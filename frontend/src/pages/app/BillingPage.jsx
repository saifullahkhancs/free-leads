import { useEffect, useState } from "react";
import { Check, CreditCard, Loader2, Sparkles, X } from "lucide-react";
import * as api from "../../api/client";

const FORMAT_LABELS = {
  csv: "CSV",
  excel: "Excel",
  pdf: "PDF",
  json: "JSON",
};

export default function BillingPage() {
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [plansRes, billingRes] = await Promise.all([api.getPlans(), api.getMyBilling()]);
      setPlans(plansRes?.data || []);
      setBilling(billingRes?.data || null);
    } catch (err) {
      setError(err.message || "Could not load billing info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const currentPlanCode = billing?.subscription?.plan_code || billing?.quota?.plan?.code || "free";

  const handleSubscribe = async (planCode) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.subscribe(planCode);
      if (res?.data?.mock) {
        showToast(`✓ Subscribed to ${res.data.plan} (mock mode)`);
      } else if (res?.data?.approvalUrl) {
        window.location.href = res.data.approvalUrl;
        return;
      }
      await load();
    } catch (err) {
      setError(err.message || "Subscription failed");
    } finally {
      setBusy(false);
    }
  };

  const handleUpgrade = async (planCode) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.upgradeSubscription(planCode);
      showToast(`✓ Upgraded to ${res.data.plan}`);
      await load();
    } catch (err) {
      setError(err.message || "Upgrade failed");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.cancelSubscription();
      showToast("Subscription cancelled");
      await load();
    } catch (err) {
      setError(err.message || "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="billing-page" style={{ padding: 40, textAlign: "center", color: "var(--app-ink-muted)" }}>
        <Loader2 className="spin" size={22} />
        <p>Loading your plan…</p>
      </div>
    );
  }

  const q = billing?.quota || {};
  const activeSub = billing?.subscription;

  return (
    <div className="billing-page">
      <div className="billing-hero">
        <h1>Plans & Usage</h1>
        <p>Pick a plan that fits how many leads you search and download each day.</p>
      </div>

      {error && <div className="billing-error">{error}</div>}
      {toast && <div className="app-toast"><Sparkles size={16} /><span>{toast}</span></div>}

      {/* Current plan / usage */}
      <section className="billing-current">
        <div className="billing-current-card">
          <h2>Your plan</h2>
          <div className="billing-plan-badge">
            <Sparkles size={15} />
            <strong>{q.plan?.name || "Free"}</strong>
          </div>
          {activeSub?.status && (
            <div style={{ fontSize: 12, color: "var(--app-ink-muted)" }}>
              Status: <b>{activeSub.status}</b>
            </div>
          )}
          {activeSub?.paypal_subscription_id && (
            <div style={{ fontSize: 11, color: "var(--app-ink-faint)", wordBreak: "break-all" }}>
              {activeSub.paypal_subscription_id}
            </div>
          )}
        </div>

        <div className="billing-usage">
          <div className="billing-usage-item">
            <span>Searches today</span>
            <div className="billing-bar">
              <div
                className="billing-bar-fill"
                style={{
                  width: `${
                    q.searches?.limit === -1 || !q.searches?.limit
                      ? 8
                      : Math.min(100, (q.searches.used / q.searches.limit) * 100)
                  }%`,
                }}
              />
            </div>
            <small>
              {q.searches?.limit === -1
                ? "Unlimited"
                : `${Math.max(0, q.searches.limit - q.searches.used)} of ${q.searches.limit} left`}
            </small>
          </div>
          <div className="billing-usage-item">
            <span>Exports today</span>
            <div className="billing-bar">
              <div
                className="billing-bar-fill billing-bar-fill-export"
                style={{
                  width: `${
                    q.exports?.limit === -1 || !q.exports?.limit
                      ? 8
                      : Math.min(100, (q.exports.used / q.exports.limit) * 100)
                  }%`,
                }}
              />
            </div>
            <small>
              {q.exports?.limit === -1
                ? "Unlimited"
                : `${Math.max(0, q.exports.limit - q.exports.used)} of ${q.exports.limit} left`}
            </small>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="billing-plans">
        {plans.map((plan) => {
          const isCurrent = plan.code === currentPlanCode;
          const isNext = billing?.quota?.nextPlan?.code === plan.code && !isCurrent;
          return (
            <div key={plan.code} className={`billing-plan-card${isCurrent ? " current" : ""}${isNext ? " next" : ""}`}>
              {isCurrent && <span className="billing-plan-tag">Current</span>}
              {isNext && !isCurrent && <span className="billing-plan-tag">Recommended</span>}
              <h3>{plan.name}</h3>
              <div className="billing-price">
                ${(plan.price_cents / 100).toFixed(0)}
                <span>/mo</span>
              </div>
              <ul className="billing-plan-features">
                <li>
                  <Check size={14} />
                  {plan.daily_search_quota === -1 ? "Unlimited searches/day" : `${plan.daily_search_quota} searches/day`}
                </li>
                <li>
                  <Check size={14} />
                  {plan.daily_export_quota === -1 ? "Unlimited exports/day" : `${plan.daily_export_quota} exports/day`}
                </li>
                <li>
                  <Check size={14} />
                  Max {plan.max_export_per_req} rows/export
                </li>
                <li>
                  <Check size={14} />
                  Formats: {(plan.allowed_formats || []).map((f) => FORMAT_LABELS[f] || f).join(", ")}
                </li>
                <li>
                  {plan.can_view_contact ? (
                    <><Check size={14} /> Full contact info</>
                  ) : (
                    <><X size={14} /> Masked contact info</>
                  )}
                </li>
              </ul>
              {isCurrent ? (
                activeSub?.status === "active" && !plan.is_default ? (
                  <button className="billing-btn billing-btn-ghost" onClick={handleCancel} disabled={busy}>
                    {busy ? <Loader2 className="spin" size={15} /> : "Cancel plan"}
                  </button>
                ) : (
                  <div className="billing-btn disabled">Current plan</div>
                )
              ) : isNext ? (
                <button className="billing-btn billing-btn-primary" onClick={() => handleUpgrade(plan.code)} disabled={busy}>
                  {busy ? <Loader2 className="spin" size={15} /> : `Upgrade to ${plan.name}`}
                </button>
              ) : (
                <button className="billing-btn billing-btn-primary" onClick={() => handleSubscribe(plan.code)} disabled={busy}>
                  {busy ? <Loader2 className="spin" size={15} /> : <><CreditCard size={14} /> Choose {plan.name}</>}
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
