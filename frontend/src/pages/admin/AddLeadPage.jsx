import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, FilePlus2, Loader2, ShieldAlert } from "lucide-react";
import * as api from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const EMPTY_FORM = {
  full_name: "",
  headline: "",
  email: "",
  company_name: "",
  job_title: "",
  num_employees: "",
  industry: "",
  country: "",
  country_code: "",
  region: "",
  city: "",
  about: "",
  linkedin_url: "",
  twitter_url: "",
  facebook_url: "",
  website_url: "",
};

export default function AddLeadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.roles?.some((r) => ["admin", "super_admin", "editor"].includes(r));
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (!form.full_name.trim()) {
      setError("Full name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createLead(form);
      setCreated(res.data);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="dash-page-head">
        <div>
          <h1>Add a lead</h1>
          <p>Enter the details manually — the more complete the record, the easier it is to find later.</p>
        </div>
        <div className="dash-page-actions">
          <Link to="/admin/import" className="dash-btn">
            <FilePlus2 size={15} /> Prefer bulk import?
          </Link>
        </div>
      </div>

      {!canManage && (
        <div className="dash-card">
          <div className="empty-state">
            <div className="empty-state-icon"><ShieldAlert size={24} /></div>
            <h3>Editor access required</h3>
            <p>Only editors, admins and super admins can add leads. Ask an admin to upgrade your role.</p>
            <Link to="/admin/leads" className="dash-btn">Browse leads instead</Link>
          </div>
        </div>
      )}

      {canManage && error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

      {canManage && created && (
        <div className="dash-alert dash-alert-success">
          <CheckCircle2 size={18} />
          <div>
            <strong>Lead created!</strong> <span style={{ fontWeight: 600 }}>{created.full_name}</span> was added to the
            database.{" "}
            <Link to="/admin/leads" style={{ textDecoration: "underline", fontWeight: 700 }}>View all leads →</Link>
          </div>
        </div>
      )}

      {canManage && <div className="dash-card">
        <form className="dash-card-body dash-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Full name <span>*</span></label>
              <input className="dash-input" type="text" placeholder="e.g. Jane Smith" value={form.full_name} onChange={set("full_name")} required />
            </div>
            <div className="form-field">
              <label>Headline</label>
              <input className="dash-input" type="text" placeholder="e.g. Head of Growth at Acme" value={form.headline} onChange={set("headline")} />
            </div>
            <div className="form-field">
              <label>Email</label>
              <input className="dash-input" type="email" placeholder="person@company.com" value={form.email} onChange={set("email")} />
            </div>
            <div className="form-field">
              <label>Company</label>
              <input className="dash-input" type="text" placeholder="Company name" value={form.company_name} onChange={set("company_name")} />
            </div>
            <div className="form-field">
              <label>Job title</label>
              <input className="dash-input" type="text" placeholder="e.g. Marketing Director" value={form.job_title} onChange={set("job_title")} />
            </div>
            <div className="form-field">
              <label>Number of employees</label>
              <input className="dash-input" type="number" min="0" step="1" placeholder="e.g. 250" value={form.num_employees} onChange={set("num_employees")} />
            </div>
            <div className="form-field">
              <label>Industry</label>
              <input className="dash-input" type="text" placeholder="e.g. SaaS, FinTech…" value={form.industry} onChange={set("industry")} />
            </div>
            <div className="form-field">
              <label>Country</label>
              <input className="dash-input" type="text" placeholder="e.g. United States" value={form.country} onChange={set("country")} />
            </div>
            <div className="form-field">
              <label>Country code <span className="form-hint">(ISO alpha-2, optional)</span></label>
              <input className="dash-input" type="text" placeholder="e.g. US" maxLength={2} value={form.country_code} onChange={set("country_code")} />
            </div>
            <div className="form-field">
              <label>Region / State</label>
              <input className="dash-input" type="text" placeholder="e.g. California" value={form.region} onChange={set("region")} />
            </div>
            <div className="form-field">
              <label>City</label>
              <input className="dash-input" type="text" placeholder="e.g. San Francisco" value={form.city} onChange={set("city")} />
            </div>
            <div className="form-field full">
              <label>About</label>
              <textarea className="dash-textarea" placeholder="Short description of the person / company…" value={form.about} onChange={set("about")} />
            </div>
            <div className="form-field">
              <label>LinkedIn URL</label>
              <input className="dash-input" type="url" placeholder="https://linkedin.com/in/…" value={form.linkedin_url} onChange={set("linkedin_url")} />
            </div>
            <div className="form-field">
              <label>Website URL</label>
              <input className="dash-input" type="url" placeholder="https://…" value={form.website_url} onChange={set("website_url")} />
            </div>
            <div className="form-field">
              <label>Twitter / X URL</label>
              <input className="dash-input" type="url" placeholder="https://twitter.com/…" value={form.twitter_url} onChange={set("twitter_url")} />
            </div>
            <div className="form-field">
              <label>Facebook URL</label>
              <input className="dash-input" type="url" placeholder="https://facebook.com/…" value={form.facebook_url} onChange={set("facebook_url")} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 6 }}>
            <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="spin" size={16} /> : <FilePlus2 size={16} />}
              {submitting ? "Saving…" : "Save lead"}
            </button>
            <button type="button" className="dash-btn dash-btn-ghost" onClick={() => navigate("/admin/leads")}>
              Cancel
            </button>
            <span className="form-hint" style={{ marginLeft: "auto" }}>Fields marked <span style={{ color: "var(--dash-danger)" }}>*</span> are required.</span>
          </div>
        </form>
      </div>}
    </>
  );
}
