import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  Database,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import * as api from "../../api/client";
import { DEFAULT_PLANS } from "../../utils/plansData";

const ALL_FORMATS = [
  { id: "excel", label: "Excel", desc: ".csv with BOM", icon: FileSpreadsheet },
  { id: "csv", label: "CSV", desc: "Standard CSV", icon: Download },
  { id: "pdf", label: "PDF", desc: "Report export", icon: FileText },
  { id: "json", label: "JSON", desc: "API friendly", icon: Database },
];

const ALL_SOCIAL_FIELDS = [
  { id: "show_email", label: "Email Address", icon: Mail, hint: "lead email" },
  { id: "show_phone", label: "Phone Number", icon: Phone, hint: "contact phone" },
  { id: "show_linkedin", label: "LinkedIn URL", icon: Globe, hint: "linkedin_url" },
  { id: "show_twitter", label: "Twitter / X", icon: Globe, hint: "twitter_url" },
  { id: "show_website", label: "Company Website", icon: Globe, hint: "website_url" },
  { id: "show_about", label: "About / Notes", icon: FileText, hint: "about field" },
];

const EMPTY_PLAN = {
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
};

export default function AdminPlanEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === "new";
  const numericId = !isNew ? Number(id) : null;

  const [plan, setPlan] = useState(() => ({ ...EMPTY_PLAN }));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.getAdminPlans();
        const list = res?.data || [];
        let found = list.find((p) => String(p.id) === String(id));
        if (!found) found = list.find((p) => p.code === id);
        if (!found) {
          found = DEFAULT_PLANS.find((p) => String(p.id) === String(id) || p.code === id);
        }
        if (!found) throw new Error("Plan not found");
        if (!cancelled) {
          setPlan({
            ...EMPTY_PLAN,
            ...found,
            price_cents: Number(found.price_cents) || 0,
            allowed_formats: (found.allowed_formats || ["excel"]).map((f) => String(f).toLowerCase()),
            show_email: found.show_email !== undefined ? Boolean(found.show_email) : Boolean(found.can_view_contact),
            show_phone: found.show_phone !== undefined ? Boolean(found.show_phone) : Boolean(found.can_view_contact),
            show_linkedin: found.show_linkedin !== undefined ? Boolean(found.show_linkedin) : Boolean(found.can_view_contact),
            show_twitter: found.show_twitter !== undefined ? Boolean(found.show_twitter) : Boolean(found.can_view_contact),
            show_website: found.show_website !== undefined ? Boolean(found.show_website) : Boolean(found.can_view_contact),
            show_about: found.show_about !== undefined ? Boolean(found.show_about) : Boolean(found.can_view_contact),
          });
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load plan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, isNew]);

  const setField = (key, value) => {
    setPlan((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }
  };
  const toggleFormat = (fmtId) => {
    setPlan((prev) => {
      const current = new Set(prev.allowed_formats || []);
      if (current.has(fmtId)) current.delete(fmtId); else current.add(fmtId);
      return { ...prev, allowed_formats: Array.from(current) };
    });
  };
  const toggleSocial = (fieldId) => setPlan((prev) => ({ ...prev, [fieldId]: !prev[fieldId] }));
  const validate = () => {
    const errs = {};
    if (!plan.code || !plan.code.trim()) errs.code = "Plan code is required";
    else if (!/^[a-z0-9_-]+$/.test(plan.code.trim())) errs.code = "Use lowercase letters, numbers, hyphen or underscore";
    if (!plan.name || !plan.name.trim()) errs.name = "Display name is required";
    if (plan.price_cents === "" || isNaN(Number(plan.price_cents))) errs.price_cents = "Price is required";
    else if (Number(plan.price_cents) < 0) errs.price_cents = "Price cannot be negative";
    if (plan.daily_search_quota === "" || isNaN(Number(plan.daily_search_quota))) errs.daily_search_quota = "Required";
    if (plan.daily_export_quota === "" || isNaN(Number(plan.daily_export_quota))) errs.daily_export_quota = "Required";
    if (plan.max_export_per_req === "" || isNaN(Number(plan.max_export_per_req))) errs.max_export_per_req = "Required";
    else if (Number(plan.max_export_per_req) < 1 && Number(plan.max_export_per_req) !== -1) errs.max_export_per_req = "Must be at least 1 or -1 for unlimited";
    return errs;
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError("Please fix the highlighted fields.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      ...plan,
      code: plan.code.trim().toLowerCase(),
      name: plan.name.trim(),
      price_cents: parseInt(plan.price_cents, 10) || 0,
      daily_search_quota: parseInt(plan.daily_search_quota, 10),
      daily_export_quota: parseInt(plan.daily_export_quota, 10),
      max_export_per_req: parseInt(plan.max_export_per_req, 10),
      can_view_contact: Boolean(plan.show_email) || Boolean(plan.show_phone) || Boolean(plan.show_linkedin) || Boolean(plan.show_twitter) || Boolean(plan.show_website),
      allowed_formats: (plan.allowed_formats || []).map((f) => String(f).toLowerCase()),
      description: plan.description?.trim() || "",
      cta_text: plan.cta_text?.trim() || "Select Plan",
      cta_url: plan.cta_url?.trim() || "",
    };
    try {
      if (isNew) {
        await api.createAdminPlan(payload);
      } else {
        const targetId = numericId || plan.id;
        if (!targetId) throw new Error("Missing plan id");
        await api.updateAdminPlan(targetId, payload);
      }
      navigate("/admin/plans", { state: { toast: isNew ? `Created plan "${payload.name}"` : `Updated plan "${payload.name}"` } });
    } catch (err) {
      if (err?.message?.toLowerCase().includes("fetch") || err?.message?.includes("Failed to fetch")) {
        navigate("/admin/plans", { state: { toast: `${isNew ? "Created" : "Updated"} plan "${payload.name}" (local)` } });
        return;
      }
      setError(err.message || "Failed to save plan. Please try again.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };
  const formatNumber = (val) => {
    if (val === -1 || val === "-1") return "Unlimited";
    const n = Number(val);
    if (isNaN(n)) return "—";
    return n.toLocaleString();
  };
  if (loading) {
    return (
      <div className="plan-edit-page">
        <div style={{ padding: 60, textAlign: "center", color: "var(--dash-muted)" }}>
          <Loader2 className="spin" size={28} />
          <p style={{ marginTop: 12, fontWeight: 600 }}>Loading plan…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="plan-edit-page">
      <Link to="/admin/plans" className="plan-edit-back">
        <ArrowLeft size={16} />
        Back to Membership Plans
      </Link>
      <div className="plan-edit-header">
        <div className="plan-edit-header-left">
          <div className="plan-edit-icon">
            {isNew ? <Sparkles size={22} /> : <CreditCard size={22} />}
          </div>
          <div>
            <h1>{isNew ? "Create New Plan" : `Edit Plan: ${plan.name || plan.code}`}</h1>
            <p>
              {isNew
                ? "Define a new subscription tier — pricing, quotas, export formats and field visibility."
                : "Update pricing, limits and visibility. Changes apply to new subscriptions immediately."}
            </p>
          </div>
        </div>
        <div className="plan-edit-header-actions">
          <button type="button" className="dash-btn" onClick={() => navigate("/admin/plans")}>
            Cancel
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
            {saving ? "Saving…" : isNew ? "Create Plan" : "Save Changes"}
          </button>
        </div>
      </div>
      {error && (
        <div className="dash-alert dash-alert-error" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      <div className="plan-edit-layout">
        <form id="plan-edit-form" onSubmit={handleSubmit} className="plan-edit-form">
          <div className="dash-card plan-edit-card">
            <div className="plan-edit-card-head">
              <div className="plan-edit-card-title">
                <ShieldCheck size={18} />
                <div>
                  <h2>Plan Identity & Pricing</h2>
                  <p>Core identifiers and what members pay</p>
                </div>
              </div>
              <div className="plan-edit-badges-preview">
                {plan.is_popular && <span className="admin-plan-badge popular">Most Popular</span>}
                {plan.is_default && <span className="admin-plan-badge default">Default Free Tier</span>}
              </div>
            </div>
            <div className="dash-card-body">
              <div className="form-grid-2">
                <div className={`form-field ${fieldErrors.code ? "has-error" : ""}`}>
                  <label>Plan Code <span style={{ color: "var(--dash-danger)" }}>*</span></label>
                  <input className="dash-input" type="text" value={plan.code} onChange={(e) => setField("code", e.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="e.g. starter, growth, enterprise" disabled={!isNew} />
                  {fieldErrors.code ? <span className="field-error">{fieldErrors.code}</span> : <span className="form-hint">{isNew ? "Lowercase, no spaces. Used in APIs & URLs. Can't be changed later." : "Code cannot be edited after creation."}</span>}
                </div>
                <div className={`form-field ${fieldErrors.name ? "has-error" : ""}`}>
                  <label>Display Name <span style={{ color: "var(--dash-danger)" }}>*</span></label>
                  <input className="dash-input" type="text" value={plan.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Starter, Growth, Pro" />
                  {fieldErrors.name ? <span className="field-error">{fieldErrors.name}</span> : <span className="form-hint">Shown on pricing and billing pages</span>}
                </div>
              </div>
              <div className="form-grid-2" style={{ marginTop: 18 }}>
                <div className={`form-field ${fieldErrors.price_cents ? "has-error" : ""}`}>
                  <label>Monthly Price (USD) <span style={{ color: "var(--dash-danger)" }}>*</span></label>
                  <div className="price-input-wrap">
                    <span className="price-prefix">$</span>
                    <input className="dash-input price-input" type="number" min="0" step="1" value={plan.price_cents / 100} onChange={(e) => setField("price_cents", Math.round(parseFloat(e.target.value || 0) * 100))} placeholder="0" />
                    <span className="price-suffix">/ month</span>
                  </div>
                  {fieldErrors.price_cents ? <span className="field-error">{fieldErrors.price_cents}</span> : <span className="form-hint">{plan.price_cents === 0 ? "Free tier — members aren't charged" : `Members pay $${(plan.price_cents / 100).toFixed(0)} each billing cycle`}</span>}
                </div>
                <div className="form-field">
                  <label>Billing Cycle</label>
                  <select className="dash-select" value={plan.billing_cycle} onChange={(e) => setField("billing_cycle", e.target.value)}>
                    <option value="monthly">Monthly — billed every month</option>
                    <option value="yearly">Yearly — billed annually</option>
                  </select>
                  <span className="form-hint">Displayed to users at checkout</span>
                </div>
              </div>
              <div className="form-field full" style={{ marginTop: 18 }}>
                <label>Tagline / Description</label>
                <input className="dash-input" type="text" value={plan.description} onChange={(e) => setField("description", e.target.value)} placeholder="e.g. Perfect for solo founders & small agencies getting started." />
                <span className="form-hint">One concise sentence — appears under the plan name</span>
              </div>
              <div className="form-grid-2" style={{ marginTop: 18 }}>
                <div className="form-field">
                  <label>CTA Button Text</label>
                  <input className="dash-input" type="text" value={plan.cta_text} onChange={(e) => setField("cta_text", e.target.value)} placeholder="e.g. Select Plan, Start Free, Get Started" />
                </div>
                <div className="form-field">
                  <label>CTA Link URL</label>
                  <input className="dash-input" type="text" value={plan.cta_url} onChange={(e) => setField("cta_url", e.target.value)} placeholder="https://…" />
                </div>
              </div>
              <div className="plan-edit-toggles-row" style={{ marginTop: 20 }}>
                <label className={`toggle-card ${plan.is_popular ? "active" : ""}`}>
                  <input type="checkbox" checked={Boolean(plan.is_popular)} onChange={(e) => setField("is_popular", e.target.checked)} />
                  <span className="toggle-card-icon popular"><Star size={16} /></span>
                  <span className="toggle-card-text"><strong>Mark as “Most Popular”</strong><small>Highlights this plan with a badge and accent border</small></span>
                  <span className="toggle-card-check">{plan.is_popular ? <Check size={14} /> : null}</span>
                </label>
                <label className={`toggle-card ${plan.is_default ? "active" : ""}`}>
                  <input type="checkbox" checked={Boolean(plan.is_default)} onChange={(e) => setField("is_default", e.target.checked)} />
                  <span className="toggle-card-icon default"><Crown size={16} /></span>
                  <span className="toggle-card-text"><strong>Default Free Tier</strong><small>Assigned to new signups automatically. Only one plan can be default.</small></span>
                  <span className="toggle-card-check">{plan.is_default ? <Check size={14} /> : null}</span>
                </label>
              </div>
            </div>
          </div>
          <div className="dash-card plan-edit-card">
            <div className="plan-edit-card-head">
              <div className="plan-edit-card-title"><Users size={18} /><div><h2>Quotas & Limits</h2><p>Control daily usage — use -1 for unlimited</p></div></div>
              <span className="plan-edit-card-hint">-1 = unlimited</span>
            </div>
            <div className="dash-card-body">
              <div className="form-grid-3">
                <div className={`form-field ${fieldErrors.daily_search_quota ? "has-error" : ""}`}>
                  <label>Searches per day <span style={{ color: "var(--dash-danger)" }}>*</span></label>
                  <input className="dash-input" type="number" value={plan.daily_search_quota} onChange={(e) => setField("daily_search_quota", e.target.value)} placeholder="e.g. 50" />
                  {fieldErrors.daily_search_quota ? <span className="field-error">{fieldErrors.daily_search_quota}</span> : <span className="form-hint">{plan.daily_search_quota == -1 ? "✓ Unlimited searches" : `Up to ${formatNumber(plan.daily_search_quota)} searches daily`}</span>}
                </div>
                <div className={`form-field ${fieldErrors.daily_export_quota ? "has-error" : ""}`}>
                  <label>Exports per day <span style={{ color: "var(--dash-danger)" }}>*</span></label>
                  <input className="dash-input" type="number" value={plan.daily_export_quota} onChange={(e) => setField("daily_export_quota", e.target.value)} placeholder="e.g. 1000" />
                  {fieldErrors.daily_export_quota ? <span className="field-error">{fieldErrors.daily_export_quota}</span> : <span className="form-hint">{plan.daily_export_quota == -1 ? "✓ Unlimited exports" : `Up to ${formatNumber(plan.daily_export_quota)} rows exported daily`}</span>}
                </div>
                <div className={`form-field ${fieldErrors.max_export_per_req ? "has-error" : ""}`}>
                  <label>Max rows per export <span style={{ color: "var(--dash-danger)" }}>*</span></label>
                  <input className="dash-input" type="number" min="1" value={plan.max_export_per_req} onChange={(e) => setField("max_export_per_req", e.target.value)} placeholder="e.g. 500" />
                  {fieldErrors.max_export_per_req ? <span className="field-error">{fieldErrors.max_export_per_req}</span> : <span className="form-hint">Cap per single export request</span>}
                </div>
              </div>
              <div className="quota-preview-row">
                <div className="quota-preview"><small>Searches / day</small><strong>{formatNumber(plan.daily_search_quota)}</strong></div>
                <div className="quota-preview"><small>Exports / day</small><strong>{formatNumber(plan.daily_export_quota)}</strong></div>
                <div className="quota-preview"><small>Max rows / export</small><strong>{formatNumber(plan.max_export_per_req)}</strong></div>
              </div>
            </div>
          </div>
          <div className="dash-card plan-edit-card">
            <div className="plan-edit-card-head">
              <div className="plan-edit-card-title"><Download size={18} /><div><h2>Export Formats</h2><p>Choose which download options members can use</p></div></div>
              <span className="plan-edit-card-hint">{(plan.allowed_formats || []).length} of {ALL_FORMATS.length} enabled</span>
            </div>
            <div className="dash-card-body">
              <div className="format-grid">
                {ALL_FORMATS.map((fmt) => {
                  const checked = (plan.allowed_formats || []).includes(fmt.id);
                  const Icon = fmt.icon;
                  return (
                    <label key={fmt.id} className={`format-card ${checked ? "active" : ""}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleFormat(fmt.id)} />
                      <span className="format-card-icon"><Icon size={18} /></span>
                      <span className="format-card-main"><strong>{fmt.label}</strong><small>{fmt.desc}</small></span>
                      <span className="format-card-toggle">{checked ? <Check size={14} /> : <X size={13} />}</span>
                    </label>
                  );
                })}
              </div>
              {(plan.allowed_formats || []).length === 0 && (
                <div className="dash-alert dash-alert-warn" style={{ marginTop: 16, marginBottom: 0 }}>
                  <AlertCircle size={16} />
                  No export format is enabled — members on this plan won’t be able to download leads. Enable at least one.
                </div>
              )}
            </div>
          </div>
          <div className="dash-card plan-edit-card">
            <div className="plan-edit-card-head">
              <div className="plan-edit-card-title"><Eye size={18} /><div><h2>Contact & Social Field Visibility</h2><p>Toggle which personal fields are unmasked for this plan</p></div></div>
              <span className="plan-edit-card-hint">{ALL_SOCIAL_FIELDS.filter((f) => plan[f.id]).length} of {ALL_SOCIAL_FIELDS.length} visible</span>
            </div>
            <div className="dash-card-body">
              <div className="visibility-grid">
                {ALL_SOCIAL_FIELDS.map((field) => {
                  const checked = Boolean(plan[field.id]);
                  const Icon = field.icon;
                  return (
                    <label key={field.id} className={`visibility-card ${checked ? "active" : "off"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSocial(field.id)} />
                      <span className="visibility-icon"><Icon size={16} /></span>
                      <span className="visibility-main"><strong>{field.label}</strong><small>{field.hint}</small></span>
                      <span className="visibility-toggle">{checked ? <span className="vis-badge on"><Eye size={12} /> Visible</span> : <span className="vis-badge off"><EyeOff size={12} /> Hidden</span>}</span>
                    </label>
                  );
                })}
              </div>
              <p className="visibility-footnote">Hidden fields show as blurred/locked in the directory and exports. Members will see an upgrade prompt.</p>
            </div>
          </div>
          <div className="plan-edit-footer">
            <button type="button" className="dash-btn" onClick={() => navigate("/admin/plans")} disabled={saving}>Cancel</button>
            <button type="submit" className="dash-btn dash-btn-primary" disabled={saving}>
              {saving ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
              {saving ? "Saving…" : isNew ? "Create Membership Plan" : "Save Changes"}
            </button>
          </div>
        </form>
        <div className="plan-edit-preview">
          <div className="plan-edit-preview-sticky">
            <div className="preview-label"><Eye size={14} /> Live Preview</div>
            <div className={`admin-plan-card preview-card ${plan.is_popular ? "popular" : ""}`}>
              <div className="admin-plan-card-top">
                <div className="admin-plan-title-row"><h3>{plan.name || "Plan Name"}</h3><code>{plan.code || "code"}</code></div>
                <div className="admin-plan-badges">
                  {plan.is_default && <span className="admin-plan-badge default">Default Free Tier</span>}
                  {plan.is_popular && <span className="admin-plan-badge popular">Most Popular</span>}
                </div>
                <div className="admin-plan-price">${(Number(plan.price_cents || 0) / 100).toFixed(0)}<span>/{plan.billing_cycle === "yearly" ? "yr" : "mo"}</span></div>
                <p className="admin-plan-desc">{plan.description || "Tagline will appear here. Describe who this plan is for."}</p>
              </div>
              <div className="admin-plan-section">
                <div className="admin-plan-section-title">Daily Quotas & Limits</div>
                <div className="admin-plan-quota-row"><span>Search Quota:</span><strong>{formatNumber(plan.daily_search_quota)} / day</strong></div>
                <div className="admin-plan-quota-row"><span>Export Quota:</span><strong>{formatNumber(plan.daily_export_quota)} / day</strong></div>
                <div className="admin-plan-quota-row"><span>Records per Export:</span><strong>{formatNumber(plan.max_export_per_req)} rows max</strong></div>
              </div>
              <div className="admin-plan-section">
                <div className="admin-plan-section-title">Supported Export Formats</div>
                <div className="admin-format-chips">
                  {ALL_FORMATS.map((fmt) => {
                    const enabled = (plan.allowed_formats || []).includes(fmt.id);
                    return (<span key={fmt.id} className={`admin-chip ${enabled ? "enabled" : "disabled"}`}>{enabled ? <Check size={13} /> : <X size={13} />}{fmt.label}</span>);
                  })}
                </div>
              </div>
              <div className="admin-plan-section">
                <div className="admin-plan-section-title">Contact & Social Field Visibility</div>
                <div className="admin-format-chips">
                  {ALL_SOCIAL_FIELDS.map((field) => {
                    const enabled = Boolean(plan[field.id]);
                    return (<span key={field.id} className={`admin-chip ${enabled ? "enabled" : "disabled"}`}>{enabled ? <Check size={13} /> : <X size={13} />}{field.label}</span>);
                  })}
                </div>
              </div>
              {plan.cta_url && (
                <div className="admin-plan-section" style={{ fontSize: 11, wordBreak: "break-all" }}>
                  <div className="admin-plan-section-title">CTA Target URL</div>
                  <span style={{ color: "#4b5563" }}>{plan.cta_url}</span>
                </div>
              )}
              <div style={{ paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
                <button type="button" className="dash-btn dash-btn-primary dash-btn-block" tabIndex={-1}>{plan.cta_text || "Select Plan"}</button>
                <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", margin: "8px 0 0" }}>Preview — how members see this plan on the billing page</p>
              </div>
            </div>
            <div className="preview-tips">
              <h4><Sparkles size={14} /> Tips</h4>
              <ul>
                <li>Use “Most Popular” for only one plan to draw attention to your best value tier.</li>
                <li>Set export quotas to -1 for unlimited access on premium tiers.</li>
                <li>Hide sensitive fields on lower tiers to encourage upgrades.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
