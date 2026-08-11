import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  Globe,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import * as api from "../../api/client";

const EMPTY_POST = {
  title: "",
  excerpt: "",
  body: "",
  coverImageUrl: "",
  status: "draft",
};

/**
 * Admin create / edit form for a single blog post. Both /admin/blog/new
 * and /admin/blog/:id/edit use this same page; presence of :id toggles
 * between create and update.
 */
export default function BlogPostEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id;

  const [form, setForm] = useState(EMPTY_POST);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setLoading(true);
    api
      .adminGetPost(id)
      .then((res) => {
        if (cancelled) return;
        const p = res?.data;
        if (!p) {
          setError("Post not found.");
          return;
        }
        setForm({
          title: p.title || "",
          excerpt: p.excerpt || "",
          body: p.body || "",
          coverImageUrl: p.cover_image_url || "",
          status: p.status || "draft",
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Couldn't load this post.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const handleChange = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.title || form.title.trim().length < 2) errs.title = "Title is required (min 2 chars).";
    if (!form.body || form.body.trim().length < 10) errs.body = "Body is required (min 10 chars).";
    if (form.coverImageUrl && !/^https?:\/\//.test(form.coverImageUrl)) {
      errs.coverImageUrl = "Cover image must be a full URL (https://…).";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!validate() || saving) return;
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      excerpt: form.excerpt.trim() || null,
      body: form.body,
      coverImageUrl: form.coverImageUrl.trim() || null,
      status: form.status,
    };
    try {
      let saved;
      if (isNew) {
        saved = await api.adminCreatePost(payload);
      } else {
        saved = await api.adminUpdatePost(id, payload);
      }
      navigate("/admin/blog", {
        state: { toast: `✓ ${isNew ? "Created" : "Saved"} "${saved?.data?.title || form.title}"` },
      });
    } catch (err) {
      // The API returns 422 with details for validation errors
      if (err?.data?.errors && Array.isArray(err.data.errors)) {
        const fe = {};
        err.data.errors.forEach((e) => {
          const key = (e.path || "").split(".").pop();
          if (key) fe[key] = e.message;
        });
        setFieldErrors(fe);
      }
      setError(err?.message || "Couldn't save the post.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="dash-loader">
        <Loader2 className="spin" size={24} /> Loading post…
      </div>
    );
  }

  return (
    <div className="plan-edit-page">
      <Link to="/admin/blog" className="plan-edit-back">
        <ArrowLeft size={14} /> Back to blog
      </Link>

      <div className="plan-edit-header">
        <div className="plan-edit-header-left">
          <div className="plan-edit-icon">
            <Sparkles size={22} />
          </div>
          <div>
            <h1>{isNew ? "Write a new post" : "Edit post"}</h1>
            <p>
              Use plain paragraphs separated by blank lines. Lines starting
              with <code>## </code> become headings and <code>&gt; </code> becomes a quote.
            </p>
          </div>
        </div>
        <div className="plan-edit-header-actions">
          {!isNew && form.status === "published" && (
            <a
              href={`/blog/${form.slug || ""}`}
              target="_blank"
              rel="noreferrer"
              className="dash-btn"
            >
              <Eye size={15} /> Preview
            </a>
          )}
          <button className="dash-btn dash-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
            {saving ? "Saving…" : isNew ? "Create post" : "Save changes"}
          </button>
        </div>
      </div>

      {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

      <form className="plan-edit-form" onSubmit={handleSave}>
        <div className="dash-card plan-edit-card">
          <div className="plan-edit-card-head">
            <div className="plan-edit-card-title">
              <Sparkles size={16} />
              <div>
                <h2>Article details</h2>
                <p>Headline, summary and cover image</p>
              </div>
            </div>
            <span className="plan-edit-card-hint">Required</span>
          </div>
          <div className="dash-card-body">
            <div className={`form-field ${fieldErrors.title ? "has-error" : ""}`}>
              <label>Title <span>*</span></label>
              <input
                className="dash-input"
                type="text"
                value={form.title}
                onChange={handleChange("title")}
                placeholder="e.g. 5 prospecting playbooks that actually work in 2025"
                maxLength={255}
              />
              {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
            </div>
            <div className="form-field">
              <label>Excerpt <small className="form-hint" style={{ marginLeft: 6 }}>shown in cards &amp; meta description</small></label>
              <textarea
                className="dash-textarea"
                value={form.excerpt}
                onChange={handleChange("excerpt")}
                placeholder="A short teaser that explains what the reader will get out of this post."
                rows={3}
                maxLength={500}
              />
            </div>
            <div className={`form-field ${fieldErrors.coverImageUrl ? "has-error" : ""}`}>
              <label>Cover image URL <small className="form-hint" style={{ marginLeft: 6 }}>optional</small></label>
              <input
                className="dash-input"
                type="url"
                value={form.coverImageUrl}
                onChange={handleChange("coverImageUrl")}
                placeholder="https://images.unsplash.com/…"
                maxLength={500}
              />
              {fieldErrors.coverImageUrl && <span className="field-error">{fieldErrors.coverImageUrl}</span>}
              {form.coverImageUrl && /^https?:\/\//.test(form.coverImageUrl) && (
                <div
                  className="blog-cover-preview"
                  style={{ backgroundImage: `url(${form.coverImageUrl})` }}
                />
              )}
            </div>
          </div>
        </div>

        <div className="dash-card plan-edit-card">
          <div className="plan-edit-card-head">
            <div className="plan-edit-card-title">
              <Globe size={16} />
              <div>
                <h2>Content</h2>
                <p>The full post body</p>
              </div>
            </div>
            <span className="plan-edit-card-hint">Required</span>
          </div>
          <div className="dash-card-body">
            <div className={`form-field ${fieldErrors.body ? "has-error" : ""}`}>
              <textarea
                className="dash-textarea"
                value={form.body}
                onChange={handleChange("body")}
                rows={20}
                placeholder={`Start with a short intro paragraph.\n\nThen break the post into sections:\n\n## Why this matters\n…\n\n## How to apply it\n…\n\n> Optional: drop in a quote with a leading >\n`}
              />
              {fieldErrors.body && <span className="field-error">{fieldErrors.body}</span>}
              <small className="form-hint">
                {form.body.length} characters · ~{Math.max(1, Math.round(form.body.split(/\s+/).filter(Boolean).length / 200))} min read
              </small>
            </div>
          </div>
        </div>

        <div className="dash-card plan-edit-card">
          <div className="plan-edit-card-head">
            <div className="plan-edit-card-title">
              <Globe size={16} />
              <div>
                <h2>Visibility</h2>
                <p>Choose whether to publish now or keep it as a draft</p>
              </div>
            </div>
          </div>
          <div className="dash-card-body">
            <div className="plan-edit-toggles-row">
              <label className={`toggle-card ${form.status === "draft" ? "active" : ""}`}>
                <div className="toggle-card-icon default">
                  <Save size={18} />
                </div>
                <div className="toggle-card-text">
                  <strong>Draft</strong>
                  <small>Only admins can see this post. Useful while you iterate on the copy.</small>
                </div>
                <div className="toggle-card-check">
                  {form.status === "draft" && <Save size={14} />}
                </div>
                <input
                  type="radio"
                  name="status"
                  value="draft"
                  checked={form.status === "draft"}
                  onChange={handleChange("status")}
                />
              </label>
              <label className={`toggle-card ${form.status === "published" ? "active" : ""}`}>
                <div className="toggle-card-icon popular">
                  <Globe size={18} />
                </div>
                <div className="toggle-card-text">
                  <strong>Published</strong>
                  <small>Live on the public /blog page. Sets the published date if it's the first publish.</small>
                </div>
                <div className="toggle-card-check">
                  {form.status === "published" && <Save size={14} />}
                </div>
                <input
                  type="radio"
                  name="status"
                  value="published"
                  checked={form.status === "published"}
                  onChange={handleChange("status")}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="plan-edit-footer">
          <Link to="/admin/blog" className="dash-btn dash-btn-ghost">Cancel</Link>
          <button type="submit" className="dash-btn dash-btn-primary" disabled={saving}>
            {saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
            {saving ? "Saving…" : isNew ? "Create post" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
