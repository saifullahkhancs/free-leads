import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Database,
  FilePlus2,
  Globe2,
  Loader2,
  MapPin,
  TrendingUp,
  UploadCloud,
} from "lucide-react";
import * as api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { avatarColor, formatDate, initialsOf, locationString } from "../../utils/format";

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const canManage = user?.roles?.some((r) => ["admin", "super_admin", "editor"].includes(r));
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getLeadStats()
      .then((res) => {
        if (!cancelled) setStats(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const c = stats?.counts || {};

  const statCards = [
    { icon: Database, tone: "green", value: c.total_leads ?? "—", label: "Total leads", sub: c.leads_last_7_days ? `+${c.leads_last_7_days} this week` : "active records" },
    { icon: BadgeCheck, tone: "blue", value: c.verified_leads ?? "—", label: "Verified leads", sub: "confirmed contact info" },
    { icon: Building2, tone: "orange", value: c.industries ?? "—", label: "Industries", sub: "in the directory" },
    { icon: Globe2, tone: "lime", value: c.countries ?? "—", label: "Countries", sub: `${c.regions ?? 0} regions · ${c.cities ?? 0} cities` },
  ];

  return (
    <>
      <div className="dash-page-head">
        <div>
          <h1>Welcome back, {user?.firstName || "there"} 👋</h1>
          <p>Here's what's happening in your lead database. Add new leads manually or import them in bulk from a CSV.</p>
        </div>
        <div className="dash-page-actions">
          {canManage && (
            <>
              <Link to="/admin/add-lead" className="dash-btn dash-btn-lime">
                <FilePlus2 size={16} /> Add Lead
              </Link>
              <Link to="/admin/import" className="dash-btn dash-btn-primary">
                <UploadCloud size={16} /> Import CSV
              </Link>
            </>
          )}
          <Link to="/app" className="dash-btn">Open app</Link>
        </div>
      </div>

      {error && <div className="dash-alert dash-alert-error">⚠ Could not load stats: {error}</div>}

      {loading ? (
        <div className="dash-loader"><Loader2 className="spin" size={28} /> Loading workspace…</div>
      ) : (
        <div className="stat-grid">
          {statCards.map((s) => (
            <div className="stat-card" key={s.label}>
              <div className={`stat-icon ${s.tone}`}><s.icon size={20} /></div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "20px", alignItems: "start" }}>
        <div className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2>Recent leads</h2>
              <p>The latest records added to your database</p>
            </div>
            <Link to="/admin/leads" className="dash-btn dash-btn-sm">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentLeads?.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className="lead-cell">
                        <span className="dash-avatar" style={{ background: avatarColor(lead.full_name) }}>{initialsOf(lead)}</span>
                        <div style={{ minWidth: 0 }}>
                          <b>{lead.full_name}</b>
                          <small>{lead.headline || lead.job_title || "—"}</small>
                        </div>
                      </div>
                    </td>
                    <td>{lead.company_name || <span className="faint">—</span>}</td>
                    <td className="muted">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <MapPin size={12} /> {locationString(lead) || "Unknown"}
                      </span>
                    </td>
                    <td className="muted">{formatDate(lead.created_at)}</td>
                  </tr>
                ))}
                {!loading && (!stats?.recentLeads || stats.recentLeads.length === 0) && (
                  <tr>
                    <td colSpan="4">
                      <div className="empty-state">
                        <div className="empty-state-icon"><Database size={24} /></div>
                        <h3>No leads yet</h3>
                        <p>Add your first lead manually or import a CSV to get started.</p>
                        <Link to="/admin/add-lead" className="dash-btn dash-btn-primary">Add your first lead</Link>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="quick-grid" style={{ gridTemplateColumns: "1fr" }}>
          {canManage && <Link to="/admin/add-lead" className="quick-tile">
            <span className="quick-tile-icon" style={{ background: "var(--dash-lime-soft)", color: "var(--dash-green)" }}>
              <FilePlus2 size={21} />
            </span>
            <div>
              <h3>Add a lead</h3>
              <p>Manually enter a single lead with full contact details.</p>
            </div>
          </Link>}
          {canManage && <Link to="/admin/import" className="quick-tile">
            <span className="quick-tile-icon" style={{ background: "var(--dash-blue-soft)", color: "var(--dash-blue)" }}>
              <UploadCloud size={21} />
            </span>
            <div>
              <h3>Import CSV</h3>
              <p>Bulk-upload hundreds of leads from a spreadsheet.</p>
            </div>
          </Link>}
          <Link to="/app" className="quick-tile">
            <span className="quick-tile-icon" style={{ background: "var(--dash-green-soft)", color: "var(--dash-green)" }}>
              <TrendingUp size={21} />
            </span>
            <div>
              <h3>Open the app</h3>
              <p>Browse the directory like your visitors will.</p>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
