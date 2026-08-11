import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Edit,
  FileText,
  Globe,
  Loader2,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import * as api from "../../api/client";
import { formatDate } from "../../utils/format";

/**
 * Admin page for managing blog posts. Lists every post (any status) and
 * lets admins create / edit / publish / delete them. The edit experience
 * lives on a dedicated page (BlogPostEditPage) so it can be deep-linked.
 */
export default function BlogPostsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState(null);
  const [toast, setToast] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const loadPosts = async (status = statusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListPosts({ status: status || undefined, limit: 100 });
      setPosts(res?.data?.posts || []);
    } catch (err) {
      setError(err?.message || "Couldn't load blog posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  useEffect(() => {
    loadPosts(statusFilter);
  }, [statusFilter]);

  // Show toast from edit page navigation
  useEffect(() => {
    if (location.state?.toast) {
      setToast(location.state.toast);
      setTimeout(() => setToast(""), 3500);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleDelete = async (post) => {
    if (!window.confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    setDeletingId(post.id);
    try {
      await api.adminDeletePost(post.id);
      setToast(`✓ Deleted "${post.title}"`);
      setTimeout(() => setToast(""), 3000);
      await loadPosts(statusFilter);
    } catch (err) {
      setError(err?.message || "Couldn't delete the post.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="admin-plans-page">
      <div className="admin-plans-header">
        <div>
          <h1>Blog Posts</h1>
          <p>Write, draft and publish articles that appear on the public <a href="/blog" target="_blank" rel="noreferrer">/blog</a> page.</p>
        </div>
        <div className="dash-page-actions" style={{ display: "flex", gap: 10 }}>
          <button className="dash-btn" onClick={() => loadPosts(statusFilter)} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
          <button className="dash-btn dash-btn-primary" onClick={() => navigate("/admin/blog/new")}>
            <PlusCircle size={16} /> New Post
          </button>
        </div>
      </div>

      {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

      {toast && (
        <div className="app-toast" style={{ position: "relative", bottom: "auto", right: "auto", marginBottom: 16 }}>
          <CheckCircle2 size={15} color="var(--dash-lime)" /> <span>{toast}</span>
        </div>
      )}

      <div className="dash-card" style={{ marginBottom: 20 }}>
        <div className="dash-card-head" style={{ padding: "14px 18px" }}>
          <div className="dash-toolbar" style={{ margin: 0, width: "100%" }}>
            <select
              className="dash-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minWidth: 160 }}
            >
              <option value="">All posts</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
            <span className="dash-toolbar-count" style={{ marginLeft: "auto" }}>
              {loading ? "Loading…" : `${posts.length} post${posts.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="dash-loader"><Loader2 className="spin" size={24} /> Loading posts…</div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><FileText size={24} /></div>
            <h3>No posts yet</h3>
            <p>Create your first article to start the blog.</p>
            <button className="dash-btn dash-btn-primary" onClick={() => navigate("/admin/blog/new")}>
              <PlusCircle size={16} /> Write first post
            </button>
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Author</th>
                  <th>Published</th>
                  <th>Reading time</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{p.title}</div>
                      <small className="muted" style={{ display: "block", maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        /{p.slug}
                      </small>
                    </td>
                    <td>
                      {p.status === "published" ? (
                        <span className="dash-badge badge-green">
                          <Globe size={11} /> Published
                        </span>
                      ) : (
                        <span className="dash-badge badge-gray">
                          <X size={11} /> Draft
                        </span>
                      )}
                    </td>
                    <td>
                      {[p.first_name, p.last_name].filter(Boolean).join(" ") || <span className="faint">—</span>}
                    </td>
                    <td className="muted">{formatDate(p.published_at || p.created_at)}</td>
                    <td>{p.reading_time_minutes ? `${p.reading_time_minutes} min` : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                        {p.status === "published" && (
                          <a className="dash-btn dash-btn-sm" href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" title="View public page">
                            <Globe size={13} /> View
                          </a>
                        )}
                        <button
                          className="dash-btn dash-btn-sm"
                          onClick={() => navigate(`/admin/blog/${p.id}/edit`)}
                        >
                          <Edit size={13} /> Edit
                        </button>
                        <button
                          className="dash-btn dash-btn-sm dash-btn-danger"
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                        >
                          {deletingId === p.id ? <Loader2 className="spin" size={13} /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
