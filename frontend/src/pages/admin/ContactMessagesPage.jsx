import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import * as api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { formatDate, initialsOf } from "../../utils/format";

const STATUS_COLORS = {
  new: { bg: "rgba(127, 168, 255, 0.15)", fg: "#7fa8ff", label: "New" },
  read: { bg: "rgba(255, 209, 102, 0.15)", fg: "#ffd166", label: "Read" },
  replied: { bg: "rgba(75, 195, 140, 0.15)", fg: "#62d69f", label: "Replied" },
  closed: { bg: "rgba(255, 255, 255, 0.08)", fg: "#82938a", label: "Closed" },
};

/**
 * Admin page for managing contact-form submissions. Admins can:
 *   - browse / filter messages by status
 *   - open one to view the full thread
 *   - change status (new / read / replied / closed)
 *   - send an email reply (status auto-flips to "replied")
 */
export default function ContactMessagesPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const loadList = async (status = statusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getContactMessages({ status: status || undefined, limit: 100 });
      setMessages(res?.data?.messages || []);
    } catch (err) {
      setError(err?.message || "Couldn't load contact messages.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    api.getContactStats().then((r) => setStats(r?.data || null)).catch(() => {});
  }, []);

  useEffect(() => {
    loadList(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    if (!activeId) {
      setActive(null);
      setReply("");
      return;
    }
    let cancelled = false;
    api
      .getContactMessage(activeId)
      .then((res) => {
        if (cancelled) return;
        setActive(res?.data || null);
        setReply(res?.data?.admin_reply || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Couldn't load message.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const refreshAll = async () => {
    await loadList(statusFilter);
    if (activeId) {
      const res = await api.getContactMessage(activeId);
      setActive(res?.data || null);
    }
    const statsRes = await api.getContactStats().catch(() => null);
    if (statsRes?.data) setStats(statsRes.data);
  };

  const handleStatusChange = async (newStatus) => {
    if (!active || saving) return;
    setSaving(true);
    try {
      const res = await api.updateContactMessage(active.id, { status: newStatus });
      setActive(res?.data);
      showToast(`✓ Marked as "${STATUS_COLORS[newStatus]?.label || newStatus}"`);
      await loadList(statusFilter);
      const statsRes = await api.getContactStats().catch(() => null);
      if (statsRes?.data) setStats(statsRes.data);
    } catch (err) {
      setError(err?.message || "Couldn't update status.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendReply = async () => {
    if (!active || !reply.trim() || saving) return;
    setSaving(true);
    try {
      const res = await api.updateContactMessage(active.id, { admin_reply: reply.trim() });
      setActive(res?.data);
      showToast("✓ Reply emailed to the sender");
      await loadList(statusFilter);
      const statsRes = await api.getContactStats().catch(() => null);
      if (statsRes?.data) setStats(statsRes.data);
    } catch (err) {
      setError(err?.message || "Couldn't send the reply.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="dash-page-head">
        <div>
          <h1>Contact Messages</h1>
          <p>Submissions from the public Contact Us form. Reply by email and the sender is notified directly.</p>
        </div>
        <div className="dash-page-actions">
          <button className="dash-btn" onClick={refreshAll} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

      {stats && (
        <div className="stat-grid">
          <StatCard icon={Inbox} tone="blue" value={stats.total ?? 0} label="Total" sub={`${stats.last_7_days ?? 0} in last 7 days`} />
          <StatCard icon={MessageSquare} tone="orange" value={stats.new_count ?? 0} label="Awaiting reply" sub="Unread submissions" />
          <StatCard icon={Send} tone="lime" value={stats.replied_count ?? 0} label="Replied" sub="Emailed back" />
          <StatCard icon={ShieldCheck} tone="green" value={stats.closed_count ?? 0} label="Closed" sub="Resolved / archived" />
        </div>
      )}

      <div className="dash-card" style={{ marginBottom: 20 }}>
        <div className="dash-card-head" style={{ padding: "14px 18px" }}>
          <div className="dash-toolbar" style={{ margin: 0, width: "100%" }}>
            <span className="dash-toolbar-count" style={{ marginRight: 8 }}>
              <Filter size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Filter:
            </span>
            <select
              className="dash-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minWidth: 160 }}
            >
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="read">Read</option>
              <option value="replied">Replied</option>
              <option value="closed">Closed</option>
            </select>
            <span className="dash-toolbar-count" style={{ marginLeft: "auto" }}>
              {loading ? "Loading…" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="dash-loader"><Loader2 className="spin" size={24} /> Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Inbox size={24} /></div>
            <h3>No messages</h3>
            <p>When visitors submit the Contact Us form, their messages will show up here.</p>
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Received</th>
                  <th style={{ textAlign: "right" }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => {
                  const sc = STATUS_COLORS[m.status] || STATUS_COLORS.read;
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setActiveId(m.id)}
                      style={{
                        background: activeId === m.id ? "var(--dash-lime-soft)" : undefined,
                      }}
                    >
                      <td>
                        <div className="lead-cell">
                          <span className="dash-avatar">{initialsOf({ first_name: m.full_name?.split(" ")[0], last_name: m.full_name?.split(" ").slice(1).join(" ") })}</span>
                          <div>
                            <b>{m.full_name}</b>
                            <small>{m.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.subject}</div>
                        <small className="muted" style={{ display: "block", maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {(m.message || "").slice(0, 90)}…
                        </small>
                      </td>
                      <td>
                        <span className="dash-badge" style={{ background: sc.bg, color: sc.fg }}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="muted">
                        <Clock size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                        {formatDate(m.created_at)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button className="dash-btn dash-btn-sm">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {active && (
        <div className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MessageSquare size={16} /> {active.subject}
              </h2>
              <p>
                From <strong>{active.full_name}</strong> &lt;{active.email}&gt; · received {formatDate(active.created_at)}
              </p>
            </div>
            <button
              className="modal-close"
              onClick={() => setActiveId(null)}
              aria-label="Close thread"
            >
              <X size={16} />
            </button>
          </div>
          <div className="dash-card-body">
            <div className="contact-thread">
              <div className="contact-thread-msg">
                <div className="contact-thread-meta">
                  <strong>{active.full_name}</strong>
                  <span>{active.email}</span>
                  <span className="muted">{formatDate(active.created_at)}</span>
                </div>
                <p style={{ whiteSpace: "pre-wrap" }}>{active.message}</p>
              </div>

              {active.admin_reply && (
                <div className="contact-thread-msg contact-thread-reply">
                  <div className="contact-thread-meta">
                    <strong>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Team"}</strong>
                    <span>Replied to {active.email}</span>
                    <span className="muted">{formatDate(active.replied_at)}</span>
                  </div>
                  <p style={{ whiteSpace: "pre-wrap" }}>{active.admin_reply}</p>
                </div>
              )}
            </div>

            <div className="contact-reply-editor">
              <label>
                <span><Send size={13} /> Reply by email (this sends a message to the submitter)</span>
                <textarea
                  className="dash-textarea"
                  rows={5}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your reply… Markdown is not rendered in the email."
                />
              </label>
              <div className="contact-reply-actions">
                <select
                  className="dash-select"
                  value={active.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={saving}
                  style={{ minWidth: 160 }}
                >
                  <option value="new">New</option>
                  <option value="read">Read</option>
                  <option value="replied">Replied</option>
                  <option value="closed">Closed</option>
                </select>
                <button
                  className="dash-btn dash-btn-primary"
                  onClick={handleSendReply}
                  disabled={saving || !reply.trim()}
                >
                  {saving ? <Loader2 className="spin" size={15} /> : <Send size={15} />}
                  {saving ? "Sending…" : "Send reply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="app-toast" style={{ position: "fixed" }}>
          <Check size={15} color="var(--dash-lime)" /> <span>{toast}</span>
        </div>
      )}
    </>
  );
}

function StatCard({ icon: Icon, tone, value, label, sub }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

// Tiny shim to keep the inline icon in the filter row referencing the same
// import surface (Filter is from lucide-react).
import { Filter } from "lucide-react";
