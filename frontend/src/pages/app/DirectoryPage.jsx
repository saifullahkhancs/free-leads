import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  Compass,
  Copy,
  Download,
  Filter,
  Grid,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Users,
  X,
} from "lucide-react";
import * as api from "../../api/client";
import LeadDetailModal from "../../components/LeadDetailModal";
import { avatarColor, formatDate, initialsOf, locationString } from "../../utils/format";
import { DEFAULT_MOCK_LEADS } from "../../utils/mockLeads";
import {
  exportLeadsToCsv,
  getSavedLeads,
  isLeadSaved,
  removeSavedLead,
  saveLead,
} from "../../utils/savedLeads";

const QUICK_CHIPS = [
  { id: "all", label: "All Leads", icon: Sparkles },
  { id: "verified", label: "Verified Only", icon: BadgeCheck },
  { id: "saved", label: "Saved Leads", icon: Bookmark },
  { id: "Software & SaaS", label: "Software & SaaS", icon: Layers },
  { id: "Healthcare & Biotech", label: "Healthcare", icon: Briefcase },
  { id: "Fintech & Banking", label: "Fintech & Banking", icon: Building2 },
  { id: "Design & Creative", label: "Design", icon: Tag },
  { id: "Marketing & Media", label: "Marketing", icon: Users },
  { id: "geo", label: "Near Me", icon: Compass },
];

export default function DirectoryPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [industries, setIndustries] = useState([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [geoActive, setGeoActive] = useState(false);
  const [geoCoords, setGeoCoords] = useState(null);
  const [activeChip, setActiveChip] = useState("all");
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "table" | "compact"
  const [sortBy, setSortBy] = useState("recent"); // "recent" | "name" | "company" | "verified"
  const [selectedLead, setSelectedLead] = useState(null);
  const [savedLeadIds, setSavedLeadIds] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const requestSeq = useRef(0);
  const searchInputRef = useRef(null);

  // Sync saved leads
  const refreshSavedSet = () => {
    const saved = getSavedLeads();
    setSavedLeadIds(new Set(saved.map((l) => l.id)));
  };

  useEffect(() => {
    refreshSavedSet();
    window.addEventListener("storage", refreshSavedSet);
    return () => window.removeEventListener("storage", refreshSavedSet);
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K or / focuses search bar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load industries list
  useEffect(() => {
    api.getLeadStats()
      .then((res) => {
        if (res?.data?.industries && res.data.industries.length > 0) {
          setIndustries(res.data.industries);
        } else {
          // Fallback to distinct industries from mock data
          const set = Array.from(new Set(DEFAULT_MOCK_LEADS.map((l) => l.industry).filter(Boolean)));
          setIndustries(set);
        }
      })
      .catch(() => {
        const set = Array.from(new Set(DEFAULT_MOCK_LEADS.map((l) => l.industry).filter(Boolean)));
        setIndustries(set);
      });
  }, []);

  // Fetch leads from API (or fallback to mock dataset)
  const fetchLeads = async ({ reset = false, cursor = null, geo = null, query = q, ind = industry } = {}) => {
    const seq = ++requestSeq.current;
    const setter = reset ? setLoading : setLoadingMore;
    setter(true);
    setError(null);

    try {
      const params = {
        q: query.trim() || undefined,
        industry: ind || undefined,
        cursor: cursor || undefined,
      };
      if (geo) {
        params.lat = geo.lat;
        params.lon = geo.lon;
        params.radius = geo.radius || 50000;
      }

      const response = await api.getLeads(params);
      if (seq !== requestSeq.current) return;

      const fetched = response?.data?.leads || [];
      if (fetched.length > 0) {
        if (reset) {
          setLeads(fetched);
        } else {
          setLeads((prev) => [...prev, ...fetched]);
        }
        setNextCursor(response.data.nextCursor);
      } else {
        // Filter mock leads if backend returned empty
        let filtered = [...DEFAULT_MOCK_LEADS];
        if (query.trim()) {
          const lower = query.trim().toLowerCase();
          filtered = filtered.filter(
            (l) =>
              l.full_name?.toLowerCase().includes(lower) ||
              l.company_name?.toLowerCase().includes(lower) ||
              l.headline?.toLowerCase().includes(lower) ||
              l.job_title?.toLowerCase().includes(lower)
          );
        }
        if (ind) {
          filtered = filtered.filter((l) => l.industry?.toLowerCase() === ind.toLowerCase());
        }
        if (reset) {
          setLeads(filtered);
        } else {
          setLeads((prev) => [...prev, ...filtered]);
        }
        setNextCursor(null);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // In case of backend connection error, fallback to mock leads smoothly
      let filtered = [...DEFAULT_MOCK_LEADS];
      if (query.trim()) {
        const lower = query.trim().toLowerCase();
        filtered = filtered.filter(
          (l) =>
            l.full_name?.toLowerCase().includes(lower) ||
            l.company_name?.toLowerCase().includes(lower) ||
            l.headline?.toLowerCase().includes(lower) ||
            l.job_title?.toLowerCase().includes(lower)
        );
      }
      if (ind) {
        filtered = filtered.filter((l) => l.industry?.toLowerCase() === ind.toLowerCase());
      }
      setLeads(filtered);
      setNextCursor(null);
    } finally {
      if (seq === requestSeq.current) setter(false);
    }
  };

  useEffect(() => {
    fetchLeads({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Search Submit
  const handleSearch = (e) => {
    e?.preventDefault();
    fetchLeads({ reset: true, query: q, ind: industry });
  };

  // Near Me Geolocation
  const handleNearMe = () => {
    if (geoActive) {
      setGeoActive(false);
      setGeoCoords(null);
      setActiveChip("all");
      fetchLeads({ reset: true, geo: null });
      return;
    }

    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lon: position.coords.longitude, radius: 50000 };
        setGeoActive(true);
        setGeoCoords(coords);
        setActiveChip("geo");
        showToast("📍 Filtering leads near your location (50km)");
        fetchLeads({ reset: true, geo: coords });
      },
      () => {
        showToast("⚠ Could not get location. Check browser permissions.");
      }
    );
  };

  // Quick Chips Selection
  const handleChipClick = (chip) => {
    setActiveChip(chip.id);

    if (chip.id === "all") {
      setIndustry("");
      setVerifiedOnly(false);
      setShowSavedOnly(false);
      setGeoActive(false);
      fetchLeads({ reset: true, query: q, ind: "" });
    } else if (chip.id === "verified") {
      setVerifiedOnly(true);
      setShowSavedOnly(false);
    } else if (chip.id === "saved") {
      setShowSavedOnly(true);
      setVerifiedOnly(false);
    } else if (chip.id === "geo") {
      handleNearMe();
    } else {
      // Industry chip
      setIndustry(chip.id);
      setShowSavedOnly(false);
      fetchLeads({ reset: true, query: q, ind: chip.id });
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setQ("");
    setIndustry("");
    setVerifiedOnly(false);
    setShowSavedOnly(false);
    setGeoActive(false);
    setGeoCoords(null);
    setActiveChip("all");
    fetchLeads({ reset: true, query: "", ind: "" });
    showToast("Filters reset");
  };

  // Toast Helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Toggle Save Lead
  const handleToggleSave = (e, lead) => {
    e.stopPropagation();
    if (savedLeadIds.has(lead.id)) {
      removeSavedLead(lead.id);
      refreshSavedSet();
      showToast(`Removed ${lead.full_name} from saved leads`);
    } else {
      saveLead(lead);
      refreshSavedSet();
      showToast(`⭐ Saved ${lead.full_name} to your list`);
    }
  };

  // Copy Email to Clipboard
  const handleCopyEmail = (e, lead) => {
    e.stopPropagation();
    if (lead.email) {
      navigator.clipboard.writeText(lead.email);
      setCopiedId(lead.id);
      showToast(`✓ Copied ${lead.email} to clipboard`);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Export current list to CSV
  const handleExport = () => {
    const listToExport = processedLeads;
    if (listToExport.length === 0) {
      showToast("No leads to export");
      return;
    }
    exportLeadsToCsv(listToExport, `freeleads_export_${new Date().toISOString().slice(0, 10)}.csv`);
    showToast(`✓ Exported ${listToExport.length} leads to CSV`);
  };

  // Process leads: filter by saved/verified, and sort
  const processedLeads = useMemo(() => {
    let list = [...leads];

    if (showSavedOnly) {
      const savedList = getSavedLeads();
      const savedIds = new Set(savedList.map((s) => s.id));
      list = list.filter((l) => savedIds.has(l.id));
      // If some saved leads aren't in current leads array, prepend them
      const missing = savedList.filter((s) => !list.some((l) => l.id === s.id));
      list = [...missing, ...list];
    }

    if (verifiedOnly) {
      list = list.filter((l) => l.is_verified);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "name") {
        return (a.full_name || "").localeCompare(b.full_name || "");
      }
      if (sortBy === "company") {
        return (a.company_name || "").localeCompare(b.company_name || "");
      }
      if (sortBy === "verified") {
        return (b.is_verified ? 1 : 0) - (a.is_verified ? 1 : 0);
      }
      // "recent" default
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    return list;
  }, [leads, showSavedOnly, verifiedOnly, sortBy, savedLeadIds]);

  // Modal navigation (previous / next)
  const currentModalIndex = selectedLead ? processedLeads.findIndex((l) => l.id === selectedLead.id) : -1;
  const handlePrevLead = currentModalIndex > 0 ? () => setSelectedLead(processedLeads[currentModalIndex - 1]) : null;
  const handleNextLead = currentModalIndex >= 0 && currentModalIndex < processedLeads.length - 1 ? () => setSelectedLead(processedLeads[currentModalIndex + 1]) : null;

  const hasActiveFilters = Boolean(q || industry || verifiedOnly || showSavedOnly || geoActive);

  return (
    <>
      {/* Modern Hero & Unified Search Command Hub */}
      <section className="app-hero-card">
        <div className="app-hero-kicker-row">
          <span className="app-hero-kicker">
            <span className="pulse-circle" />
            <b>PROSPECTING DIRECTORY</b> · Real-Time Network
          </span>
          {geoActive && (
            <span className="app-hero-kicker" style={{ background: "#eef7d9", color: "#506d28", borderColor: "#d5e9a9" }}>
              <Compass size={12} /> Within 50 km of you
            </span>
          )}
        </div>

        <h1 className="app-hero-title">
          Find & connect with <span className="text-gradient">decision makers</span>
        </h1>
        <p className="app-hero-sub">
          Search across 150+ industries, filter by verified status, discover nearby contacts, or save high-value prospects to your list.
        </p>

        {/* Unified Search Bar */}
        <div className="app-search-hub">
          <form className="app-search-bar" onSubmit={handleSearch}>
            <div className="app-search-input-field">
              <Search size={18} />
              <input
                ref={searchInputRef}
                className="app-search-input"
                type="text"
                placeholder="Search by name, company, title, or skills..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {q && (
                <button
                  type="button"
                  className="app-search-clear"
                  onClick={() => {
                    setQ("");
                    fetchLeads({ reset: true, query: "", ind: industry });
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="app-search-divider" />

            {/* Industry Selector */}
            <div className="app-select-wrap">
              <Building2 size={14} className="icon-left" />
              <select
                className="app-select-input"
                value={industry}
                onChange={(e) => {
                  setIndustry(e.target.value);
                  fetchLeads({ reset: true, query: q, ind: e.target.value });
                }}
              >
                <option value="">All Industries</option>
                {industries.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>

            {/* Near Me Geo Button */}
            <button
              type="button"
              className={`app-btn-geo${geoActive ? " active" : ""}`}
              onClick={handleNearMe}
              title="Filter leads near your location"
            >
              <Compass size={15} />
              <span>{geoActive ? "Near You (50km)" : "Near Me"}</span>
            </button>

            {/* Search Submit */}
            <button type="submit" className="app-btn-search">
              <Search size={15} />
              <span>Search</span>
            </button>
          </form>

          {/* Quick Filter Chips Carousel */}
          <div className="app-chips-row">
            {QUICK_CHIPS.map((chip) => {
              const Icon = chip.icon;
              const isActive =
                (chip.id === "all" && !industry && !verifiedOnly && !showSavedOnly && !geoActive) ||
                (chip.id === "verified" && verifiedOnly) ||
                (chip.id === "saved" && showSavedOnly) ||
                (chip.id === "geo" && geoActive) ||
                (chip.id === industry && !showSavedOnly);

              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`app-chip${isActive ? " active" : ""}`}
                  onClick={() => handleChipClick(chip)}
                >
                  <Icon size={14} />
                  <span>{chip.label}</span>
                  {chip.id === "saved" && savedLeadIds.size > 0 && (
                    <span className="app-chip-counter">{savedLeadIds.size}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div className="dash-alert dash-alert-error" style={{ marginBottom: "20px" }}>
          ⚠ {error}
        </div>
      )}

      {/* Results Toolbar */}
      <div className="app-toolbar">
        <div className="app-toolbar-left">
          <div className="app-count-badge">
            <span>Showing</span>
            <span className="app-count-number">{processedLeads.length}</span>
            <span>{processedLeads.length === 1 ? "lead" : "leads"}</span>
          </div>

          {/* Active Filter Tags */}
          {q && (
            <span className="app-active-tag">
              Query: "{q}"
              <button onClick={() => { setQ(""); fetchLeads({ reset: true, query: "", ind: industry }); }}>
                <X size={13} />
              </button>
            </span>
          )}

          {industry && (
            <span className="app-active-tag">
              Industry: {industry}
              <button onClick={() => { setIndustry(""); fetchLeads({ reset: true, query: q, ind: "" }); }}>
                <X size={13} />
              </button>
            </span>
          )}

          {verifiedOnly && (
            <span className="app-active-tag">
              <BadgeCheck size={12} /> Verified Only
              <button onClick={() => setVerifiedOnly(false)}>
                <X size={13} />
              </button>
            </span>
          )}

          {showSavedOnly && (
            <span className="app-active-tag">
              <Bookmark size={12} /> Saved Leads ({savedLeadIds.size})
              <button onClick={() => setShowSavedOnly(false)}>
                <X size={13} />
              </button>
            </span>
          )}

          {geoActive && (
            <span className="app-active-tag">
              <Compass size={12} /> Within 50km
              <button onClick={handleNearMe}>
                <X size={13} />
              </button>
            </span>
          )}

          {hasActiveFilters && (
            <button type="button" className="app-clear-all-btn" onClick={resetFilters}>
              Reset all filters
            </button>
          )}
        </div>

        <div className="app-toolbar-right">
          {/* Sort Selector */}
          <select
            className="app-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="recent">Recently Added</option>
            <option value="name">Name (A–Z)</option>
            <option value="company">Company (A–Z)</option>
            <option value="verified">Verified First</option>
          </select>

          {/* View Mode Toggle */}
          <div className="app-view-toggle">
            <button
              type="button"
              className={`app-view-btn${viewMode === "grid" ? " active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Grid Cards View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              className={`app-view-btn${viewMode === "table" ? " active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table List View"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              className={`app-view-btn${viewMode === "compact" ? " active" : ""}`}
              onClick={() => setViewMode("compact")}
              title="Compact Cards View"
            >
              <Grid size={15} />
            </button>
          </div>

          {/* Export CSV */}
          <button
            type="button"
            className="app-export-btn"
            onClick={handleExport}
            title="Download CSV of current leads"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Leads Display */}
      {loading ? (
        <div className="app-grid">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="skeleton-card">
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div className="skeleton-shimmer skeleton-avatar" />
                <div style={{ flex: 1 }}>
                  <div className="skeleton-shimmer skeleton-title" style={{ marginBottom: "6px" }} />
                  <div className="skeleton-shimmer skeleton-sub" />
                </div>
              </div>
              <div className="skeleton-shimmer skeleton-line" style={{ margin: "8px 0" }} />
              <div className="skeleton-shimmer skeleton-pills" />
            </div>
          ))}
        </div>
      ) : processedLeads.length === 0 ? (
        <div className="app-empty-state">
          <div className="app-empty-icon">
            <Users size={32} />
          </div>
          <h3>No matching leads found</h3>
          <p>
            {showSavedOnly
              ? "You haven't saved any leads to your list yet. Browse the directory and click the star icon on any lead."
              : "We couldn't find any leads matching your current criteria. Try adjusting your keywords or clearing active filters."}
          </p>

          <div className="app-suggestions">
            <span>Popular searches:</span>
            {["Software", "Stripe", "Figma", "Marketing", "London", "San Francisco"].map((term) => (
              <button
                key={term}
                type="button"
                className="app-suggestion-chip"
                onClick={() => {
                  setQ(term);
                  setShowSavedOnly(false);
                  fetchLeads({ reset: true, query: term, ind: "" });
                }}
              >
                {term}
              </button>
            ))}
          </div>

          <button type="button" className="app-btn-search" onClick={resetFilters}>
            <RefreshCw size={15} />
            <span>Reset All Filters</span>
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="app-grid">
          {processedLeads.map((lead) => {
            const isSaved = savedLeadIds.has(lead.id);
            const isCopied = copiedId === lead.id;

            return (
              <article
                key={lead.id}
                className="lead-card"
                onClick={() => setSelectedLead(lead)}
              >
                <div className="lead-card-top">
                  <div
                    className="lead-card-avatar"
                    style={{ background: avatarColor(lead.full_name) }}
                  >
                    {initialsOf(lead)}
                    {lead.is_verified && (
                      <span className="lead-card-avatar-verified" title="Verified lead">
                        <Check size={11} />
                      </span>
                    )}
                  </div>

                  <div className="lead-card-header-info">
                    <h3 className="lead-card-name">{lead.full_name}</h3>
                    <span className="lead-card-title">
                      {lead.job_title || "Lead Profile"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={`lead-card-bookmark-btn${isSaved ? " saved" : ""}`}
                    onClick={(e) => handleToggleSave(e, lead)}
                    title={isSaved ? "Remove from saved" : "Save lead"}
                  >
                    <Bookmark size={15} fill={isSaved ? "currentColor" : "none"} />
                  </button>
                </div>

                <p className="lead-card-headline">
                  {lead.headline || `Executive at ${lead.company_name || "Growth Company"}`}
                </p>

                <div className="lead-card-meta-pills">
                  {lead.company_name && (
                    <span className="lead-pill lead-pill-company">
                      <Building2 size={12} /> {lead.company_name}
                    </span>
                  )}
                  {lead.industry && (
                    <span className="lead-pill lead-pill-industry">
                      <Tag size={12} /> {lead.industry}
                    </span>
                  )}
                  {lead.is_verified && (
                    <span className="lead-pill lead-pill-verified">
                      <BadgeCheck size={12} /> Verified
                    </span>
                  )}
                </div>

                <div className="lead-card-loc">
                  <MapPin size={13} />
                  <span>{locationString(lead) || "Location on file"}</span>
                </div>

                {/* Email Preview & Copy */}
                {lead.email && (
                  <div className="lead-card-contact-row">
                    <div className="lead-card-email">
                      <Mail size={12} style={{ display: "inline", marginRight: "5px", verticalAlign: "middle" }} />
                      {lead.email}
                    </div>
                    <button
                      type="button"
                      className={`lead-card-copy-btn${isCopied ? " copied" : ""}`}
                      onClick={(e) => handleCopyEmail(e, lead)}
                    >
                      {isCopied ? <Check size={11} /> : <Copy size={11} />}
                      <span>{isCopied ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                )}

                <div className="lead-card-footer">
                  <span>Added {lead.created_at ? formatDate(lead.created_at) : "recently"}</span>
                  <span className="lead-card-view-link">
                    <span>View profile</span>
                    <ChevronRight size={15} />
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW */
        <div className="app-table-wrapper">
          <table className="app-table">
            <thead>
              <tr>
                <th>Lead & Role</th>
                <th>Company</th>
                <th>Industry</th>
                <th>Location</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedLeads.map((lead) => {
                const isSaved = savedLeadIds.has(lead.id);
                const isCopied = copiedId === lead.id;

                return (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)}>
                    <td>
                      <div className="table-lead-cell">
                        <div
                          className="table-lead-avatar"
                          style={{ background: avatarColor(lead.full_name) }}
                        >
                          {initialsOf(lead)}
                        </div>
                        <div>
                          <div className="table-lead-name">{lead.full_name}</div>
                          <div className="table-lead-headline">
                            {lead.headline || lead.job_title || "Lead profile"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="lead-pill lead-pill-company">
                        <Building2 size={12} /> {lead.company_name || "—"}
                      </span>
                    </td>
                    <td>
                      <span className="lead-pill lead-pill-industry">
                        {lead.industry || "—"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--app-ink-muted)", fontSize: "12.5px" }}>
                        <MapPin size={13} color="var(--app-ink-faint)" />
                        {locationString(lead) || "—"}
                      </div>
                    </td>
                    <td>
                      {lead.is_verified ? (
                        <span className="lead-pill lead-pill-verified">
                          <BadgeCheck size={12} /> Verified
                        </span>
                      ) : (
                        <span className="lead-pill lead-pill-company">Standard</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions-cell" onClick={(e) => e.stopPropagation()}>
                        {lead.email && (
                          <button
                            type="button"
                            className={`lead-card-copy-btn${isCopied ? " copied" : ""}`}
                            onClick={(e) => handleCopyEmail(e, lead)}
                            title="Copy email"
                          >
                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`lead-card-bookmark-btn${isSaved ? " saved" : ""}`}
                          onClick={(e) => handleToggleSave(e, lead)}
                          title={isSaved ? "Remove from saved" : "Save lead"}
                        >
                          <Bookmark size={14} fill={isSaved ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          className="app-header-btn"
                          style={{ padding: "5px 10px", fontSize: "11.5px" }}
                          onClick={() => setSelectedLead(lead)}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* COMPACT VIEW */
        <div className="app-compact-grid">
          {processedLeads.map((lead) => {
            const isSaved = savedLeadIds.has(lead.id);

            return (
              <div
                key={lead.id}
                className="compact-card"
                onClick={() => setSelectedLead(lead)}
              >
                <div
                  className="compact-avatar"
                  style={{ background: avatarColor(lead.full_name) }}
                >
                  {initialsOf(lead)}
                </div>
                <div className="compact-info">
                  <strong>{lead.full_name}</strong>
                  <small>
                    {lead.job_title ? `${lead.job_title} · ` : ""}
                    {lead.company_name || lead.industry || "Lead"}
                  </small>
                </div>
                <button
                  type="button"
                  className={`lead-card-bookmark-btn${isSaved ? " saved" : ""}`}
                  onClick={(e) => handleToggleSave(e, lead)}
                  title={isSaved ? "Saved" : "Save lead"}
                >
                  <Bookmark size={13} fill={isSaved ? "currentColor" : "none"} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Load More */}
      {nextCursor && !loading && (
        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <button
            type="button"
            className="app-header-btn app-header-btn-primary"
            style={{ padding: "10px 24px", fontSize: "13.5px" }}
            disabled={loadingMore}
            onClick={() => fetchLeads({ cursor: nextCursor })}
          >
            {loadingMore ? <Loader2 className="spin" size={16} /> : null}
            <span>{loadingMore ? "Loading more leads..." : "Load More Leads"}</span>
          </button>
        </div>
      )}

      {/* Interactive Detail Modal with Arrow Keys Navigation */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onPrev={handlePrevLead}
          onNext={handleNextLead}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="app-toast">
          <Sparkles size={16} color="var(--app-lime)" />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
