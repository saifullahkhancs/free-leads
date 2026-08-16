import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Save } from "lucide-react";
import * as api from "../../api/client";

const TEXT_FIELDS = [
  ["full_name", "Full name", "Jane Smith", true],
  ["headline", "Headline", "Head of Growth at Acme"],
  ["email", "Email", "person@company.com", false, "email"],
  ["phone", "Phone", "+1 555 0123"],
  ["company_name", "Company", "Acme Inc."],
  ["job_title", "Job title", "Marketing Director"],
  ["industry", "Industry", "Software"],
  ["category", "Category", "Technology"],
  ["country", "Country", "United States"],
  ["country_code", "Country code", "US"],
  ["region", "State / region", "California"],
  ["city", "City", "San Francisco"],
  ["lat", "Latitude", "37.7749", false, "number"],
  ["lon", "Longitude", "-122.4194", false, "number"],
  ["linkedin_url", "LinkedIn URL", "https://linkedin.com/in/...", false, "url"],
  ["website_url", "Website URL", "https://...", false, "url"],
  ["twitter_url", "Twitter / X URL", "https://x.com/...", false, "url"],
  ["facebook_url", "Facebook URL", "https://facebook.com/...", false, "url"],
];

export default function EditLeadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getLeadForEdit(id)
      .then((res) => setForm(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.full_name?.trim()) return setError("Full name is required.");
    setSaving(true); setError("");
    try {
      const result = await api.updateLead(id, form);
      setForm(result.data);
      setSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="dash-loader"><Loader2 className="spin" /> Loading lead…</div>;
  if (!form) return <div className="dash-alert dash-alert-error">⚠ {error || "Lead not found"}</div>;

  return <>
    <div className="dash-page-head">
      <div><h1>Edit lead</h1><p>Update contact, classification and precise location information.</p></div>
      <Link to="/admin/leads" className="dash-btn"><ArrowLeft size={15} /> Back to leads</Link>
    </div>
    {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}
    {saved && <div className="dash-alert dash-alert-success"><CheckCircle2 size={18} /> Changes saved across the lead directory.</div>}
    <form className="dash-card dash-card-body dash-form" onSubmit={submit}>
      <div className="lead-form-section">
        <h3>Lead information</h3><p>Core identity and business classification.</p>
        <div className="form-grid">
          {TEXT_FIELDS.slice(0, 8).map(([key, label, placeholder, required, type]) => <div className="form-field" key={key}>
            <label>{label} {required && <span>*</span>}</label>
            <input className="dash-input" type={type || "text"} value={form[key] ?? ""} placeholder={placeholder} required={required} onChange={set(key)} />
          </div>)}
          <div className="form-field full"><label>About</label><textarea className="dash-textarea" rows="5" value={form.about ?? ""} onChange={set("about")} /></div>
        </div>
      </div>
      <div className="lead-form-section">
        <h3>Location & coordinates</h3><p>Changing location remaps this lead to the correct country and state. Coordinates power nearby search.</p>
        <div className="form-grid">
          {TEXT_FIELDS.slice(8, 14).map(([key, label, placeholder, required, type]) => <div className="form-field" key={key}>
            <label>{label}</label><input className="dash-input" type={type || "text"} step={type === "number" ? "any" : undefined} value={form[key] ?? ""} placeholder={placeholder} onChange={set(key)} />
          </div>)}
        </div>
      </div>
      <div className="lead-form-section">
        <h3>Online profiles</h3>
        <div className="form-grid">
          {TEXT_FIELDS.slice(14).map(([key, label, placeholder, required, type]) => <div className="form-field" key={key}>
            <label>{label}</label><input className="dash-input" type={type || "text"} value={form[key] ?? ""} placeholder={placeholder} onChange={set(key)} />
          </div>)}
        </div>
      </div>
      <label className="lead-check"><input type="checkbox" checked={Boolean(form.is_verified)} onChange={set("is_verified")} /> <span><b>Verified lead</b><small>Mark this only after checking the lead’s information.</small></span></label>
      <div className="lead-form-actions">
        <button className="dash-btn dash-btn-primary" disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}{saving ? "Saving…" : "Save changes"}</button>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={() => navigate("/admin/leads")}>Cancel</button>
      </div>
    </form>
  </>;
}
