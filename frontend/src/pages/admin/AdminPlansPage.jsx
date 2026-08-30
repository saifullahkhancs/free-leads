import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Check,
  Edit,
  Loader2,
  PlusCircle,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import * as api from "../../api/client";
import { mergePlansWithDefaults } from "../../utils/plansData";

const ALL_FORMATS = [
  { id: "excel", label: "Excel (.csv BOM)" },
  { id: "csv", label: "CSV Export" },
  { id: "pdf", label: "PDF Report" },
  { id: "json", label: "JSON Export" },
];

const ALL_SOCIAL_FIELDS = [
  { id: "show_email", label: "Email Address" },
  { id: "show_phone", label: "Phone Number" },
  { id: "show_linkedin", label: "LinkedIn URL" },
  { id: "show_twitter", label: "Twitter / X URL" },
  { id: "show_website", label: "Company Website" },
  { id: "show_about", label: "About / Notes" },
];

export default function AdminPlansPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [plans, setPlans] = useState(() => mergePlansWithDefaults([]));
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const abortControllerRef = useRef(null);

  const loadPlans = async (signal) => {
    setLoading(true);
    try {
      const res = await api.getAdminPlans(signal);
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        setPlans(res.data);
      } else {
        setPlans(mergePlansWithDefaults([]));
      }
    } catch (err) {
      if (err?.name === "AbortError" || signal?.aborted) return;
      setPlans(mergePlansWithDefaults([]));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    loadPlans(controller.signal);
    // Cleanup: abort the request if the component unmounts or effect re-runs
    return () => controller.abort();
  }, []);

  // Show toast passed from edit page via navigation state, then clear it
  useEffect(() => {
    if (location.state?.toast) {
      setToast(location.state.toast);
      const t = setTimeout(() => setToast(""), 3500);
      // clear history state so back button doesn't re-show
      window.history.replaceState({}, document.title);
      return () => clearTimeout(t);
    }
  }, [location.state]);

  const showToastMsg = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const handleDelete = async (plan) => {
    if (plan.is_default) {
      alert("Cannot delete the default Free tier plan.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the plan "${plan.name}"?`)) {
      return;
    }
    try {
      if (plan.id) {
        await api.deleteAdminPlan(plan.id);
      }
      setPlans((prev) => prev.filter((p) => p.code !== plan.code));
      showToastMsg(`✓ Plan "${plan.name}" deleted.`);
    } catch (err) {
      alert(err.message || "Failed to delete plan.");
    }
  };

  const formatNumber = (val) => {
    if (val === -1 || val === "-1") return "Unlimited";
    return Number(val || 0).toLocaleString();
  };

  return (
    <div className="admin-plans-page">
      <div className="admin-plans-header">
        <div>
          <h1>Membership Plans & Quotas</h1>
          <p>
            Configure subscription tiers, daily search/export limits, supported download formats
            (Excel, CSV, PDF, JSON), and social/contact field visibility per plan.
          </p>
        </div>
        <button className="dash-btn dash-btn-primary" onClick={() => navigate("/admin/plans/new")}>
          <PlusCircle size={16} /> Add New Plan
        </button>
      </div>

      {toast && (
        <div className="app-toast" style={{ margin: "16px 0", position: "relative", bottom: "auto", right: "auto" }}>
          <Sparkles size={16} /> <span>{toast}</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--app-ink-muted)" }}>
          <Loader2 className="spin" size={24} />
          <p>Loading plans configuration...</p>
        </div>
      ) : (
        <div className="admin-plans-grid">
          {plans.map((plan) => {
            const allowed = (plan.allowed_formats || []).map((f) => String(f).toLowerCase());
            const isPop = Boolean(plan.is_popular || plan.code === "growth");

            return (
              <div key={plan.code} className={`admin-plan-card${isPop ? " popular" : ""}`}>
                <div className="admin-plan-card-top">
                  <div className="admin-plan-title-row">
                    <h3>{plan.name}</h3>
                    <code>{plan.code}</code>
                  </div>
                  <div className="admin-plan-badges">
                    {plan.is_default && <span className="admin-plan-badge default">Default Free Tier</span>}
                    {isPop && <span className="admin-plan-badge popular">Most Popular</span>}
                  </div>
                  <div className="admin-plan-price">
                    ${(plan.price_cents / 100).toFixed(0)}
                    <span>/mo</span>
                  </div>
                  <p className="admin-plan-desc">{plan.description}</p>
                </div>

                <div className="admin-plan-section">
                  <div className="admin-plan-section-title">DAILY QUOTAS & LIMITS</div>
                  <div className="admin-plan-quota-row">
                    <span>Search Quota:</span>
                    <strong>{formatNumber(plan.daily_search_quota)} / day</strong>
                  </div>
                  <div className="admin-plan-quota-row">
                    <span>Export Quota:</span>
                    <strong>{formatNumber(plan.daily_export_quota)} / day</strong>
                  </div>
                  <div className="admin-plan-quota-row">
                    <span>Records per Export:</span>
                    <strong>{formatNumber(plan.max_export_per_req)} rows max</strong>
                  </div>
                </div>

                <div className="admin-plan-section">
                  <div className="admin-plan-section-title">SUPPORTED EXPORT FORMATS</div>
                  <div className="admin-format-chips">
                    {ALL_FORMATS.map((fmt) => {
                      const enabled = allowed.includes(fmt.id);
                      return (
                        <span key={fmt.id} className={`admin-chip ${enabled ? "enabled" : "disabled"}`}>
                          {enabled ? <Check size={13} /> : <X size={13} />}
                          {fmt.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="admin-plan-section">
                  <div className="admin-plan-section-title">CONTACT & SOCIAL FIELD VISIBILITY</div>
                  <div className="admin-format-chips">
                    {ALL_SOCIAL_FIELDS.map((field) => {
                      const enabled =
                        plan[field.id] !== undefined
                          ? Boolean(plan[field.id])
                          : Boolean(plan.can_view_contact);
                      return (
                        <span key={field.id} className={`admin-chip ${enabled ? "enabled" : "disabled"}`}>
                          {enabled ? <Check size={13} /> : <X size={13} />}
                          {field.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {plan.cta_url && (
                  <div className="admin-plan-section" style={{ fontSize: 11, wordBreak: "break-all" }}>
                    <div className="admin-plan-section-title">CTA TARGET URL</div>
                    <span style={{ color: "#4b5563" }}>{plan.cta_url}</span>
                  </div>
                )}

                <div className="admin-plan-card-footer">
                  <button
                    type="button"
                    className="dash-btn dash-btn-sm"
                    onClick={() => navigate(`/admin/plans/${plan.id ?? plan.code}/edit`)}
                  >
                    <Edit size={14} /> Edit Plan
                  </button>
                  {!plan.is_default && (
                    <button
                      type="button"
                      className="dash-btn dash-btn-sm dash-btn-danger"
                      onClick={() => handleDelete(plan)}
                      title="Delete this plan"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
