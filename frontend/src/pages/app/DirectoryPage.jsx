import { useEffect, useRef, useState } from "react";
import { Compass, Loader2, MapPin, RefreshCw, Search, Users } from "lucide-react";
import * as api from "../../api/client";
import LeadDetailModal from "../../components/LeadDetailModal";
import { avatarColor, initialsOf, locationString } from "../../utils/format";

export default function DirectoryPage() {
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
    // Pull the industry list for the filter dropdown (best-effort).
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
      if (seq !== requestSeq.current) return; // stale response
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
    setError(null);
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
      <section className="app-hero">
        <h1>Leads Directory</h1>
        <p>Search the network of people and companies — {geoActive ? "showing results near you." : "find your next connection."}</p>

        <form className="app-hero-search" onSubmit={handleSearch}>
          <div className="dash-search-input-wrap">
            <Search size={16} />
            <input
              className="dash-search-input"
              type="text"
              placeholder="Search by name, company or headline…"
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
          <button type="submit" className="dash-btn dash-btn-primary">
            <Search size={15} /> Search
          </button>
          <button type="button" className="dash-btn" onClick={handleNearMe}>
            <Compass size={15} /> Near me
          </button>
          {(q || industry || geoActive) && (
            <button type="button" className="dash-btn dash-btn-ghost" onClick={resetFilters}>
              <RefreshCw size={14} /> Reset
            </button>
          )}
        </form>
      </section>

      {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

      <div className="dash-toolbar">
        <span className="dash-toolbar-count">
          {loading ? "Searching…" : `${leads.length} lead${leads.length === 1 ? "" : "s"} shown`}
        </span>
        {geoActive && <span className="dash-badge badge-green"><MapPin size={11} /> Within 50 km of you</span>}
      </div>

      {loading ? (
        <div className="dash-loader"><Loader2 className="spin" size={30} /> Searching the directory…</div>
      ) : leads.length === 0 ? (
        <div className="dash-card">
          <div className="empty-state">
            <div className="empty-state-icon"><Users size={26} /></div>
            <h3>No leads found</h3>
            <p>Try a different search term, clear the industry filter, or reset the search.</p>
            <button className="dash-btn dash-btn-primary" onClick={resetFilters}>
              <RefreshCw size={15} /> Reset search
            </button>
          </div>
        </div>
      ) : (
        <div className="dir-grid">
          {leads.map((lead) => (
            <article key={lead.id} className="dir-card" onClick={() => setSelectedLead(lead)}>
              <div className="dir-card-top">
                <span className="dash-avatar" style={{ background: avatarColor(lead.full_name) }}>
                  {initialsOf(lead)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <h3>{lead.full_name}</h3>
                  <small>{lead.headline || lead.job_title || "Lead profile"}</small>
                </div>
              </div>
              <div className="dir-card-tags">
                {lead.industry && <span className="dash-badge">{lead.industry}</span>}
                {lead.company_name && <span className="dash-badge">{lead.company_name}</span>}
                {lead.is_verified && <span className="dash-badge badge-green">✓ Verified</span>}
              </div>
              <div className="dir-card-loc">
                <MapPin size={13} /> {locationString(lead) || "Location unknown"}
              </div>
              <div className="dir-card-foot">
                <span className="faint">Added {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "—"}</span>
                <span style={{ color: "var(--dash-green)", fontWeight: 700 }}>View profile →</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {nextCursor && !loading && (
        <div style={{ textAlign: "center", marginTop: "26px" }}>
          <button
            className="dash-btn"
            disabled={loadingMore}
            onClick={() => fetchLeads({ cursor: nextCursor })}
          >
            {loadingMore ? <Loader2 className="spin" size={15} /> : null}
            {loadingMore ? "Loading…" : "Load more leads"}
          </button>
        </div>
      )}

      {selectedLead && (
        <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </>
  );
}
