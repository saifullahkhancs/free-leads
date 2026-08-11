import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CreditCard,
  Edit,
  Loader2,
  PlusCircle,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import * as api from "../../api/client";
import { DEFAULT_PLANS, mergePlansWithDefaults } from "../../utils/plansData";

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
  const [plans, setPlans] = useState(() => mergePlansWithDefaults([]));
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const loadPlans = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getAdminPlans();
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        setPlans(res.data);
      } else {
        setPlans(mergePlansWithDefaults([]));
      }
    } catch {
      // Fallback to offline defaults if server is unavailable
      setPlans(mergePlansWithDefaults([]));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const showToastMsg = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const handleOpenAdd = () => {
    setEditingPlan({
      code: "",
      name: "",
      price_cents: 0,
      billing_cycle: "monthly",
      daily_search_quota: 50,
      daily_export_quota: 1000,
      max_export_per_req: 500,
      allowed_formats: ["excel", "csv"],
      can_view_contact: true,
      show_email: true,
      show_phone: true,
      show_linkedin: true,
      show_twitter: true,
      show_website: true,
      show_about: true,
      is_default: false,
      is_popular: false,
      description: "",
      cta_text: "Select Plan",
      cta_url: "",
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (plan) => {
    setEditingPlan({
      ...plan,
      allowed_formats: (plan.allowed_formats || ["excel"]).map((f) => String(f).toLowerCase()),
      show_email: plan.show_email !== undefined ? Boolean(plan.show_email) : Boolean(plan.can_view_contact),
      show_phone: plan.show_phone !== undefined ? Boolean(plan.show_phone) : Boolean(plan.can_view_contact),
      show_linkedin: plan.show_linkedin !== undefined ? Boolean(plan.show_linkedin) : Boolean(plan.can_view_contact),
      show_twitter: plan.show_twitter !== undefined ? Boolean(plan.show_twitter) : Boolean(plan.can_view_contact),
      show_website: plan.show_website !== undefined ? Boolean(plan.show_website) : Boolean(plan.can_view_contact),
      show_about: plan.show_about !== undefined ? Boolean(plan.show_about) : Boolean(plan.can_view_contact),
    });
    setModalOpen(true);
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

  const handleSavePlan = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!editingPlan.code || !editingPlan.name) {
      alert("Plan code and display name are required.");
      return;
    }

    setSaving(true);
    setError("");

    const planPayload = {
      ...editingPlan,
      price_cents: parseInt(editingPlan.price_cents, 10) || 0,
      daily_search_quota: parseInt(editingPlan.daily_search_quota, 10),
      daily_export_quota: parseInt(editingPlan.daily_export_quota, 10),
      max_export_per_req: parseInt(editingPlan.max_export_per_req, 10),
      can_view_contact:
        Boolean(editingPlan.show_email) ||
        Boolean(editingPlan.show_phone) ||
        Boolean(editingPlan.show_linkedin) ||
        Boolean(editingPlan.show_twitter) ||
        Boolean(editingPlan.show_website),
    };

    try {
      if (editingPlan.id) {
        const res = await api.updateAdminPlan(editingPlan.id, planPayload);
        const updated = res?.data || planPayload;
        setPlans((prev) => prev.map((p) => (p.id === editingPlan.id ? { ...p, ...updated } : p)));
        showToastMsg(`✓ Updated plan "${editingPlan.name}"`);
      } else {
        const res = await api.createAdminPlan(planPayload);
        const created = res?.data || { ...planPayload, id: Date.now() };
        setPlans((prev) => [...prev, created]);
        showToastMsg(`✓ Created plan "${editingPlan.name}"`);
      }
      setModalOpen(false);
    } catch (err) {
      // In offline dev mode without backend, update state directly
      if (editingPlan.id) {
        setPlans((prev) => prev.map((p) => (p.code === editingPlan.code ? { ...p, ...planPayload } : p)));
        showToastMsg(`✓ Updated plan "${editingPlan.name}" (local state)`);
      } else {
        setPlans((prev) => [...prev, { ...planPayload, id: Date.now() }]);
        showToastMsg(`✓ Created plan "${editingPlan.name}" (local state)`);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
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
        <button className="dash-btn dash-btn-primary" onClick={handleOpenAdd}>
          <PlusCircle size={16} /> Add New Plan
        </button>
      </div>

      {toast && (
        <div className="app-toast" style={{ margin: "16px 0" }}>
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

                {/* Quotas */}
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

                {/* File Formats */}
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

                {/* Social & Contact Values */}
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

                {/* CTA URL */}
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
                    onClick={() => handleOpenEdit(plan)}
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

      {/* Edit / Add Modal */}
      {modalOpen && editingPlan && (
        <div className="dash-modal-overlay" onClick={() => setModalOpen(false)}>
          <div
            className="dash-modal-card admin-plan-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dash-modal-header">
              <h2>{editingPlan.id || editingPlan.code ? `Edit Plan: ${editingPlan.name}` : "Add Membership Plan"}</h2>
              <button
                type="button"
                className="dash-modal-close"
                onClick={() => setModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="admin-plan-form">
              {error && (
                <div className="admin-error">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              {/* Basic Details */}
              <div className="form-section-head">Basic Identity & Pricing</div>
              <div className="form-grid-2">
                <div>
                  <label>Plan Code (Unique ID)</label>
                  <input
                    type="text"
                    value={editingPlan.code}
                    onChange={(e) => setEditingPlan({ ...editingPlan, code: e.target.value.toLowerCase() })}
                    placeholder="e.g. starter"
                    disabled={Boolean(editingPlan.id)}
                    required
                  />
                  <small>Lowercase alphanumeric code used in APIs and URLs</small>
                </div>
                <div>
                  <label>Display Name</label>
                  <input
                    type="text"
                    value={editingPlan.name}
                    onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    placeholder="e.g. Starter"
                    required
                  />
                </div>
                <div>
                  <label>Monthly Price ($ USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editingPlan.price_cents / 100}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        price_cents: Math.round(parseFloat(e.target.value || 0) * 100),
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <label>Billing Cycle</label>
                  <select
                    value={editingPlan.billing_cycle}
                    onChange={(e) => setEditingPlan({ ...editingPlan, billing_cycle: e.target.value })}
                  >
                    <option value="monthly">Monthly (/month)</option>
                    <option value="yearly">Yearly (/year)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label>Tagline / Description</label>
                <input
                  type="text"
                  value={editingPlan.description}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  placeholder="e.g. Perfect for solo founders & small agencies getting started."
                />
              </div>

              <div className="form-grid-2" style={{ marginTop: 12 }}>
                <div>
                  <label>CTA Button Text</label>
                  <input
                    type="text"
                    value={editingPlan.cta_text}
                    onChange={(e) => setEditingPlan({ ...editingPlan, cta_text: e.target.value })}
                    placeholder="e.g. Select Plan"
                  />
                </div>
                <div>
                  <label>CTA Link URL</label>
                  <input
                    type="text"
                    value={editingPlan.cta_url}
                    onChange={(e) => setEditingPlan({ ...editingPlan, cta_url: e.target.value })}
                    placeholder="e.g. https://peachpuff-kingfisher-714348.hostingersite.com/..."
                  />
                </div>
              </div>

              <div className="admin-plan-checkbox-row" style={{ marginTop: 14 }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(editingPlan.is_popular)}
                    onChange={(e) => setEditingPlan({ ...editingPlan, is_popular: e.target.checked })}
                  />
                  <span>Mark as "Most Popular" badge</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(editingPlan.is_default)}
                    onChange={(e) => setEditingPlan({ ...editingPlan, is_default: e.target.checked })}
                  />
                  <span>Default Free Tier for new signups</span>
                </label>
              </div>

              {/* Quotas */}
              <div className="form-section-head" style={{ marginTop: 22 }}>
                Daily Quotas & Limits (-1 = Unlimited)
              </div>
              <div className="form-grid-3">
                <div>
                  <label>Searches / Day</label>
                  <input
                    type="number"
                    value={editingPlan.daily_search_quota}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, daily_search_quota: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label>Exports / Day</label>
                  <input
                    type="number"
                    value={editingPlan.daily_export_quota}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, daily_export_quota: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label>Max Records / Export</label>
                  <input
                    type="number"
                    min="1"
                    value={editingPlan.max_export_per_req}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, max_export_per_req: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              {/* Formats */}
              <div className="form-section-head" style={{ marginTop: 22 }}>
                Supported Export Formats (Enable / Disable)
              </div>
              <div className="admin-checkbox-grid">
                {ALL_FORMATS.map((fmt) => {
                  const checked = (editingPlan.allowed_formats || []).includes(fmt.id);
                  return (
                    <label key={fmt.id} className="checkbox-card-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const current = new Set(editingPlan.allowed_formats || []);
                          if (e.target.checked) {
                            current.add(fmt.id);
                          } else {
                            current.delete(fmt.id);
                          }
                          setEditingPlan({
                            ...editingPlan,
                            allowed_formats: Array.from(current),
                          });
                        }}
                      />
                      <span>{fmt.label}</span>
                    </label>
                  );
                })}
              </div>

              {/* Social / Contact Values */}
              <div className="form-section-head" style={{ marginTop: 22 }}>
                Social & Contact Field Visibility (Enable / Disable)
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 10px" }}>
                Select which personal contact numbers and social profile URLs are unmasked for members on this plan.
              </p>
              <div className="admin-checkbox-grid">
                {ALL_SOCIAL_FIELDS.map((field) => {
                  const checked = Boolean(editingPlan[field.id]);
                  return (
                    <label key={field.id} className="checkbox-card-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setEditingPlan({
                            ...editingPlan,
                            [field.id]: e.target.checked,
                          });
                        }}
                      />
                      <span>{field.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="dash-modal-footer" style={{ marginTop: 28 }}>
                <button
                  type="button"
                  className="dash-btn"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dash-btn dash-btn-primary"
                  disabled={saving}
                >
                  {saving ? <Loader2 className="spin" size={15} /> : "Save Membership Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
