import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Compass,
  Database,
  FilePlus2,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  UploadCloud,
} from "lucide-react";
import * as api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import LeadDetailModal from "../../components/LeadDetailModal";
import { avatarColor, formatDate, initialsOf, locationString } from "../../utils/format";

export default function LeadsPage() {
  const { user } = useAuth();
  const canManage = user?.roles?.some((r) => ["admin", "super_admin", "editor"].includes(r));
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [industries, setIndustries] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [geoActive, setGeoActive] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    api.getLeadStats().then((res) => {
      if (res?.data?.industries) setIndustries(res.data.industries);
    }).catch(() => {});
  }, []);

  const fetchLeads = async ({ reset = false, cursor = null, geo = null } = {}) => {
    const seq = ++requestSeq.current;
    const setter = reset ? setLoading : setLoadingMore;
    setter(true);
    setError(null);
    try {
      const params = { q: q.trim() || undefined, industry: industry || undefined, cursor: cursor || undefined };
      if (geo) {
        params.lat = geo.lat;
        params.lon = geo.lon;
        params.radius = geo.radius || 50000;
      }
      const response = await api.getLeads(params);
      if (seq !== requestSeq.current) return;
      if (reset) {
        setLeads(response.data.leads);
      } else {
        setLeads((prev) => [...prev, ...response.data.leads]);
      }
      setNextCursor(response.data.nextCursor);
    } catch (err) {
      if (seq === requestSeq.current) setError(err.message);
    } finally {
      if (seq === requestSeq.current) setter(false);
    }
  };

  useEffect(() => {
    fetchLeads({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchLeads({ reset: true });
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoActive(true);
        setQ("");
        fetchLeads({
          reset: true,
          geo: { lat: position.coords.latitude, lon: position.coords.longitude, radius: 50000 },
        });
      },
      () => setError("Could not get your location. Please check browser permissions.")
    );
  };

  const resetFilters = () => {
    setQ("");
    setIndustry("");
    setGeoActive(false);
    fetchLeads({ reset: true });
  };

  return (
    <>
      <div className="dash-page-head">
        <div>
          <h1>Leads</h1>
          <p>Search, filter and manage every lead in your database.</p>
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
        </div>
      </div>

      {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

      <form className="dash-searchbar" onSubmit={handleSearch} style={{ marginBottom: "16px" }}>
        <div className="dash-search-input-wrap">
          <Search size={16} />
          <input
            className="dash-search-input"
            type="text"
            placeholder="Search leads (name, company, headline)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="dash-select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="">All industries</option>
          {industries.map((ind) => (
            <option key={ind} value={ind}>{ind}</option>
          ))}
        </select>
        <button type="submit" className="dash-btn dash-btn-primary">Search</button>
        <button type="button" className="dash-btn" onClick={handleNearMe}>
          <Compass size={15} /> Near me
        </button>
        {(q || industry || geoActive) && (
          <button type="button" className="dash-btn dash-btn-ghost" onClick={resetFilters}>
            <RefreshCw size={14} /> Reset
          </button>
        )}
      </form>

      <div className="dash-toolbar">
        <span className="dash-toolbar-count">
          {loading ? "Loading…" : `${leads.length} lead${leads.length === 1 ? "" : "s"} shown`}
        </span>
        {geoActive && <span className="dash-badge badge-green"><MapPin size={11} /> Within 50 km of you</span>}
      </div>

      <div className="dash-card">
        {loading ? (
          <div className="dash-loader"><Loader2 className="spin" size={28} /> Loading leads…</div>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Database size={24} /></div>
            <h3>No leads found</h3>
            <p>Adjust your search, or add leads to get started.</p>
            <button className="dash-btn dash-btn-primary" onClick={resetFilters}>
              <RefreshCw size={15} /> Reset search
            </button>
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Company</th>
                  <th>Industry</th>
                  <th>Location</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)}>
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
                    <td>{lead.industry || <span className="faint">—</span>}</td>
                    <td className="muted">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <MapPin size={12} /> {locationString(lead) || "Unknown"}
                      </span>
                    </td>
                    <td>{lead.email || <span className="faint">Hidden</span>}</td>
                    <td>
                      {lead.is_verified ? (
                        <span className="dash-badge badge-green"><BadgeCheck size={11} /> Verified</span>
                      ) : (
                        <span className="dash-badge badge-gray">Unverified</span>
                      )}
                    </td>
                    <td className="muted">{formatDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {nextCursor && !loading && (
          <div style={{ textAlign: "center", padding: "18px" }}>
            <button
              className="dash-btn"
              disabled={loadingMore}
              onClick={() => fetchLeads({ cursor: nextCursor })}
            >
              {loadingMore ? <Loader2 className="spin" size={15} /> : null}
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      {selectedLead && (
        <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </>
  );
}
