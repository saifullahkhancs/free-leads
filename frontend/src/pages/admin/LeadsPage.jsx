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
  Trash2,
  UploadCloud,
  Map,
  Pencil,
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
  const [countryId, setCountryId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  // Keep the actual coordinates, not only an on/off flag. Pagination and
  // subsequent filter requests must continue sending the same Near Me point.
  const [geoFilter, setGeoFilter] = useState(null);
  const geoActive = Boolean(geoFilter);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodingLeadId, setGeocodingLeadId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const limit = 20;
  const requestSeq = useRef(0);

  useEffect(() => {
    Promise.all([api.getLeadStats(), api.getLeadFacets()]).then(([stats, facets]) => {
      if (stats?.data?.industries) setIndustries(stats.data.industries);
      setCountries(facets?.data?.countries || []);
      setRegions(facets?.data?.regions || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.getLeadFacets({ country_id: countryId || undefined })
      .then((res) => setRegions(res?.data?.regions || []))
      .catch(() => {});
  }, [countryId]);

  const fetchLeads = async ({ reset = false, cursor = null, geo, page = 1, filters = null } = {}) => {
    const seq = ++requestSeq.current;
    const setter = reset ? setLoading : setLoadingMore;
    setter(true);
    setError(null);
    try {
      const selected = filters || { q, industry, countryId, regionId };
      // `undefined` means reuse the active geo filter; explicit `null` clears it.
      const selectedGeo = geo === undefined ? geoFilter : geo;
      const params = { 
        q: selected.q?.trim() || undefined,
        industry: selected.industry || undefined,
        country_id: selected.countryId || undefined,
        region_id: selected.regionId || undefined,
        cursor: cursor || undefined,
        limit: limit,
        offset: (page - 1) * limit
      };
      if (selectedGeo) {
        params.lat = selectedGeo.lat;
        params.lon = selectedGeo.lon;
        params.radius = selectedGeo.radius || 50000;
        params.sort = "distance";
      }
      const response = await api.getLeads(params);
      if (seq !== requestSeq.current) return;
      if (reset) {
        setLeads(response.data.leads);
        setCurrentPage(1);
      } else {
        setLeads(response.data.leads);
        setCurrentPage(page);
      }
      setTotalLeads(response.data.total || response.data.leads.length);
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
    // The user's saved profile location, if any — used when the browser
    // can't/won't provide a device position.
    const profileGeo =
      user?.location?.lat != null && user?.location?.lng != null
        ? { lat: Number(user.location.lat), lon: Number(user.location.lng) }
        : null;

    const applyGeo = (geo) => {
      const nextGeo = { ...geo, radius: 50000 };
      setGeoFilter(nextGeo);
      setQ("");
      fetchLeads({
        reset: true,
        geo: nextGeo,
        filters: { q: "", industry, countryId, regionId },
      });
    };

    // An explicitly pinned profile location beats browser geolocation, which on
    // desktops resolves to the IP/VPN location and can be hundreds of km off —
    // making the radius search look like it returns nothing.
    if (profileGeo) {
      applyGeo(profileGeo);
      return;
    }

    const onGeoError = () => {
      setError("Could not get your location. Please check browser permissions.");
    };

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        applyGeo({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        }),
      onGeoError,
      // Previously no timeout was passed: on devices without GPS the lookup
      // could hang forever, leaving Near Me looking completely unresponsive.
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const resetFilters = () => {
    setQ("");
    setIndustry("");
    setCountryId("");
    setRegionId("");
    setGeoFilter(null);
    fetchLeads({
      reset: true,
      page: 1,
      geo: null,
      filters: { q: "", industry: "", countryId: "", regionId: "" },
    });
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > Math.ceil(totalLeads / limit)) return;
    fetchLeads({ reset: false, page: newPage });
  };

  const handleDeleteAll = async () => {
    if (!confirm("Are you sure you want to delete ALL leads? This action cannot be undone.")) {
      return;
    }
    
    setDeleting(true);
    try {
      await api.deleteAllLeads();
      setLeads([]);
      setNextCursor(null);
      setShowDeleteDialog(false);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to delete leads");
    } finally {
      setDeleting(false);
    }
  };

  const handleGeocodeLead = async (leadId) => {
    setGeocodingLeadId(leadId);
    setGeocoding(true);
    try {
      await api.geocodeLead(leadId);
      // Refresh the leads to show updated coordinates
      fetchLeads({ reset: true, page: currentPage });
    } catch (err) {
      setError(err.message || "Failed to geocode lead");
    } finally {
      setGeocoding(false);
      setGeocodingLeadId(null);
    }
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
              {user?.roles?.some((r) => ["admin", "super_admin"].includes(r)) && (
                <>
                  <button 
                    className="dash-btn dash-btn-info"
                    onClick={async () => {
                      if (!confirm("Run geocoding for all leads without coordinates? This may take several minutes.")) return;
                      try {
                        const result = await api.runGeocodingBatch();
                        alert(`Geocoding complete: ${result.data.totalSuccess} success, ${result.data.totalFailed} failed`);
                        fetchLeads({ reset: true, page: 1 });
                      } catch (err) {
                        alert(`Geocoding failed: ${err.message}`);
                      }
                    }}
                  >
                    <Map size={16} /> Geocode All
                  </button>
                  <button 
                    className="dash-btn dash-btn-danger"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={leads.length === 0}
                  >
                    <Trash2 size={16} /> Delete All
                  </button>
                </>
              )}
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
        <select className="dash-select" aria-label="Filter by country" value={countryId} onChange={(e) => { setCountryId(e.target.value); setRegionId(""); }}>
          <option value="">All countries</option>
          {countries.map((item) => <option key={item.id} value={item.id}>{item.value} ({item.count})</option>)}
        </select>
        <select className="dash-select" aria-label="Filter by state" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="">All states</option>
          {regions.map((item) => <option key={item.id} value={item.id}>{item.value} ({item.count})</option>)}
        </select>
        <select className="dash-select" aria-label="Filter by industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="">All industries</option>
          {industries.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
        </select>
        <button type="submit" className="dash-btn dash-btn-primary">Apply filters</button>
        <button type="button" className="dash-btn" onClick={handleNearMe}>
          <Compass size={15} /> Near me
        </button>
        {(q || industry || countryId || regionId || geoActive) && (
          <button type="button" className="dash-btn dash-btn-ghost" onClick={resetFilters}>
            <RefreshCw size={14} /> Reset
          </button>
        )}
      </form>

      <div className="dash-toolbar">
        <span className="dash-toolbar-count">
          {loading ? "Loading…" : `${totalLeads} total lead${totalLeads === 1 ? "" : "s"} (Page ${currentPage} of ${Math.ceil(totalLeads / limit) || 1})`}
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
                  <th>Employees</th>
                  <th>Industry</th>
                  <th>Location</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Coordinates</th>
                  <th>Added</th>
                  <th>Actions</th>
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
                    <td>{lead.num_employees != null ? Number(lead.num_employees).toLocaleString() : <span className="faint">—</span>}</td>
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
                    <td>
                      {lead.lat != null && lead.lon != null ? <span className="coordinate-value" title={`${lead.lat}, ${lead.lon}`}><b>{Number(lead.lat).toFixed(4)}</b><small>{Number(lead.lon).toFixed(4)}</small></span> : <span className="dash-badge badge-gray">Not set</span>}
                    </td>
                    <td className="muted">{formatDate(lead.created_at)}</td>
                    <td>
                      <div className="lead-row-actions">
                        {canManage && <Link className="dash-btn dash-btn-sm" to={`/admin/leads/${lead.id}/edit`} onClick={(e) => e.stopPropagation()} title="Edit lead"><Pencil size={14} /></Link>}
                        <button
                          className="dash-btn dash-btn-sm"
                          onClick={(e) => { e.stopPropagation(); handleGeocodeLead(lead.id); }}
                          disabled={geocoding && geocodingLeadId === lead.id}
                          title="Get coordinates for this lead's location"
                        >
                          {geocoding && geocodingLeadId === lead.id ? <Loader2 className="spin" size={14} /> : <Map size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalLeads > limit && !loading && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "18px" }}>
            <button
              className="dash-btn"
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              Previous
            </button>
            <span style={{ fontSize: "14px", color: "var(--ink-muted)" }}>
              Page {currentPage} of {Math.ceil(totalLeads / limit)}
            </span>
            <button
              className="dash-btn"
              disabled={currentPage >= Math.ceil(totalLeads / limit)}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {selectedLead && (
        <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}

      {showDeleteDialog && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="dash-card" style={{ maxWidth: 400, padding: 24, margin: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Delete All Leads</h3>
            <p style={{ marginBottom: 20, color: "var(--ink-muted)" }}>
              Are you sure you want to delete all {leads.length} leads? This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button 
                className="dash-btn"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button 
                className="dash-btn dash-btn-danger"
                onClick={handleDeleteAll}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                {deleting ? "Deleting..." : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
