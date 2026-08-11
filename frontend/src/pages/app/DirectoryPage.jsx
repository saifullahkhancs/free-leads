import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Bookmark,
  Building2,
  Check,
  ChevronRight,
  Compass,
  Copy,
  Download,
  Globe2,
  Grid,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  Map,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Users,
  X,
} from "lucide-react";
import * as api from "../../api/client";
import LeadDetailModal from "../../components/LeadDetailModal";
import LeadFilterPanel from "../../components/LeadFilterPanel";
import { useAuth } from "../../context/AuthContext";
import { avatarColor, formatDate, initialsOf, locationString } from "../../utils/format";
import { DEFAULT_MOCK_LEADS } from "../../utils/mockLeads";
import {
  applyLocalFilters,
  buildLocalFacets,
  categoryOf,
  formatDistance,
  sortLeads,
} from "../../utils/leadFilters";
import { getSavedLeads, removeSavedLead, saveLead } from "../../utils/savedLeads";

const EMPTY_FILTERS = {
  category: "",
  industry: "",
  country: null, // { id, value, code }
  region: null, // { id, value }
  city: null, // { id, value }
  verifiedOnly: false,
  savedOnly: false,
  geo: null, // { lat, lon }
  radius: 50000,
};

export default function DirectoryPage() {
  const { user } = useAuth();

  // ---- Search + filter state -------------------------------------------------
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState("recent");

  // ---- Results ---------------------------------------------------------------
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [error, setError] = useState(null);

  // ---- Facets (filter options + counts) --------------------------------------
  const [facets, setFacets] = useState(null);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  // ---- UI --------------------------------------------------------------------
  const [viewMode, setViewMode] = useState("grid");
  const [filtersOpen, setFiltersOpen] = useState(false); // mobile drawer
  const [selectedLead, setSelectedLead] = useState(null);
  const [savedLeadIds, setSavedLeadIds] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [quota, setQuota] = useState(null);
  const [exporting, setExporting] = useState(false);

  const requestSeq = useRef(0);
  const facetSeq = useRef(0);
  const searchInputRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2600);
  }, []);

  // ---------------------------------------------------------------------------
  // Saved leads (localStorage)
  // ---------------------------------------------------------------------------
  const refreshSavedSet = useCallback(() => {
    setSavedLeadIds(new Set(getSavedLeads().map((l) => l.id)));
  }, []);

  useEffect(() => {
    refreshSavedSet();
    window.addEventListener("storage", refreshSavedSet);
    return () => window.removeEventListener("storage", refreshSavedSet);
  }, [refreshSavedSet]);

  // Cmd/Ctrl+K or "/" focuses the search box.
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

  // ---------------------------------------------------------------------------
  // Translate the filter state into API query params.
  // ---------------------------------------------------------------------------
  const buildParams = useCallback(
    (overrides = {}) => {
      const f = { ...filters, ...overrides.filters };
      const query = overrides.q !== undefined ? overrides.q : submittedQ;

      const params = {
        q: query.trim() || undefined,
        category: f.category || undefined,
        industry: f.industry || undefined,
        country_id: f.country?.id || undefined,
        region_id: f.region?.id || undefined,
        city_id: f.city?.id || undefined,
        verified: f.verifiedOnly ? "true" : undefined,
        sort: sortBy !== "recent" ? sortBy : undefined,
      };
      if (f.geo) {
        params.lat = f.geo.lat;
        params.lon = f.geo.lon;
        params.radius = f.radius;
      }
      return params;
    },
    [filters, submittedQ, sortBy]
  );

  // Local-filter shape used by the mock-data fallback.
  const localFilterShape = useCallback(
    (overrides = {}) => {
      const f = { ...filters, ...overrides.filters };
      return {
        q: overrides.q !== undefined ? overrides.q : submittedQ,
        category: f.category,
        industry: f.industry,
        countryName: f.country?.value || "",
        regionName: f.region?.value || "",
        cityName: f.city?.value || "",
        verified: f.verifiedOnly,
        geo: f.geo,
        radius: f.radius,
      };
    },
    [filters, submittedQ]
  );

  // ---------------------------------------------------------------------------
  // Fetch leads. Falls back to the bundled mock dataset — with the same filters
  // applied locally — when the API is unreachable or returns nothing.
  // ---------------------------------------------------------------------------
  const fetchLeads = useCallback(
    async ({ cursor = null, ...overrides } = {}) => {
      const seq = ++requestSeq.current;
      const isAppend = Boolean(cursor);
      (isAppend ? setLoadingMore : setLoading)(true);
      setError(null);

      const applyFallback = () => {
        const filtered = sortLeads(
          applyLocalFilters(DEFAULT_MOCK_LEADS, localFilterShape(overrides)),
          sortBy
        );
        setLeads(filtered);
        setNextCursor(null);
        setUsingFallback(true);
      };

      try {
        const params = buildParams(overrides);
        if (cursor) params.cursor = cursor;

        const response = await api.getLeads(params);
        if (seq !== requestSeq.current) return;

        if (response?.data?.quota) setQuota(response.data.quota);
        const fetched = response?.data?.leads || [];

        if (fetched.length === 0 && !isAppend) {
          // A genuinely empty *filtered* result must stay empty — only fall back
          // to the demo dataset when nothing is filtered and the DB is bare.
          const hasAnyFilter =
            submittedQ.trim() ||
            filters.category ||
            filters.industry ||
            filters.country ||
            filters.verifiedOnly ||
            filters.geo;
          if (hasAnyFilter) {
            setLeads([]);
            setNextCursor(null);
            setUsingFallback(false);
          } else {
            applyFallback();
          }
        } else {
          setUsingFallback(false);
          setLeads((prev) => (isAppend ? [...prev, ...fetched] : fetched));
          setNextCursor(response.data.nextCursor);
        }
      } catch (err) {
        if (seq !== requestSeq.current) return;
        if (err?.status === 429) {
          setError(
            err?.data?.errors?.code === "QUOTA_EXCEEDED"
              ? "You've used all your searches for today. Upgrade your plan for more."
              : "You're searching too fast — give it a second and try again."
          );
        }
        applyFallback();
      } finally {
        if (seq === requestSeq.current) (isAppend ? setLoadingMore : setLoading)(false);
      }
    },
    [buildParams, localFilterShape, sortBy, submittedQ, filters]
  );

  // ---------------------------------------------------------------------------
  // Fetch facets whenever a filter that scopes them changes.
  // ---------------------------------------------------------------------------
  const fetchFacets = useCallback(async () => {
    const seq = ++facetSeq.current;
    setFacetsLoading(true);
    try {
      const res = await api.getLeadFacets({
        q: submittedQ.trim() || undefined,
        category: filters.category || undefined,
        industry: filters.industry || undefined,
        country_id: filters.country?.id || undefined,
        region_id: filters.region?.id || undefined,
        verified: filters.verifiedOnly ? "true" : undefined,
      });
      if (seq !== facetSeq.current) return;

      const data = res?.data;
      const hasOptions =
        (data?.categories?.length || 0) +
          (data?.industries?.length || 0) +
          (data?.countries?.length || 0) >
        0;

      if (hasOptions) {
        setFacets(data);
        if (data.suggestion?.country) setSuggestion(data.suggestion);
      } else {
        // Backend reachable but no data yet — derive facets from the demo set.
        setFacets(buildLocalFacets(DEFAULT_MOCK_LEADS, localFilterShape()));
      }
    } catch {
      if (seq !== facetSeq.current) return;
      setFacets(buildLocalFacets(DEFAULT_MOCK_LEADS, localFilterShape()));
      // Without the API, suggest from the profile we already have in context.
      if (user?.location?.country) {
        setSuggestion({
          country: user.location.country,
          region: user.location.region,
          city: user.location.city,
          country_id: null,
        });
      }
    } finally {
      if (seq === facetSeq.current) setFacetsLoading(false);
    }
  }, [
    submittedQ,
    filters.category,
    filters.industry,
    filters.country,
    filters.region,
    filters.verifiedOnly,
    localFilterShape,
    user,
  ]);

  // Re-run the search whenever any server-side filter changes.
  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    submittedQ,
    filters.category,
    filters.industry,
    filters.country,
    filters.region,
    filters.city,
    filters.verifiedOnly,
    filters.geo,
    filters.radius,
    sortBy,
  ]);

  useEffect(() => {
    fetchFacets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    submittedQ,
    filters.category,
    filters.industry,
    filters.country,
    filters.region,
    filters.verifiedOnly,
  ]);

  // ---------------------------------------------------------------------------
  // Filter mutations
  // ---------------------------------------------------------------------------
  const updateFilters = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setQ("");
    setSubmittedQ("");
    setFilters(EMPTY_FILTERS);
    setSortBy("recent");
    showToast("Filters cleared");
  }, [showToast]);

  const handleSearch = (e) => {
    e?.preventDefault();
    setSubmittedQ(q);
  };

  // "Near Me" — browser geolocation + radius filter.
  const handleNearMe = () => {
    if (filters.geo) {
      updateFilters({ geo: null });
      return;
    }
    if (!navigator.geolocation) {
      showToast("Geolocation isn't supported by your browser");
      return;
    }
    showToast("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateFilters({
          geo: { lat: position.coords.latitude, lon: position.coords.longitude },
        });
        setSortBy("distance");
        showToast("📍 Showing leads near you");
      },
      () => showToast("⚠ Couldn't get your location — check browser permissions.")
    );
  };

  // One-click "leads in my country", sourced from the user's profile location.
  const applySuggestedCountry = () => {
    if (!suggestion?.country) return;
    const match = facets?.countries?.find(
      (c) => String(c.value).toLowerCase() === String(suggestion.country).toLowerCase()
    );
    updateFilters({
      country: match
        ? { id: match.id, value: match.value, code: match.code }
        : { id: suggestion.country_id || null, value: suggestion.country },
      region: null,
      city: null,
    });
    showToast(`Showing leads in ${suggestion.country}`);
  };

  const applySuggestedCity = () => {
    if (!suggestion?.city) return;
    const countryMatch = facets?.countries?.find(
      (c) => String(c.value).toLowerCase() === String(suggestion.country || "").toLowerCase()
    );
    updateFilters({
      country: countryMatch
        ? { id: countryMatch.id, value: countryMatch.value, code: countryMatch.code }
        : suggestion.country
        ? { id: suggestion.country_id || null, value: suggestion.country }
        : null,
      region: null,
      city: { id: null, value: suggestion.city },
    });
    showToast(`Showing leads in ${suggestion.city}`);
  };

  // ---------------------------------------------------------------------------
  // Suggested / quick filters shown above the results
  // ---------------------------------------------------------------------------
  const topCategories = useMemo(() => (facets?.categories || []).slice(0, 4), [facets]);

  const quickChips = useMemo(() => {
    const chips = [
      {
        id: "all",
        label: "All Leads",
        icon: Sparkles,
        active:
          !filters.category &&
          !filters.industry &&
          !filters.country &&
          !filters.verifiedOnly &&
          !filters.savedOnly &&
          !filters.geo,
        onClick: () => setFilters(EMPTY_FILTERS),
        count: facets?.totals?.total,
      },
      {
        id: "verified",
        label: "Verified",
        icon: BadgeCheck,
        active: filters.verifiedOnly,
        onClick: () => updateFilters({ verifiedOnly: !filters.verifiedOnly }),
        count: facets?.totals?.verified,
      },
      {
        id: "near",
        label: filters.geo ? `Near Me · ${Math.round(filters.radius / 1000)} km` : "Near Me",
        icon: Compass,
        active: Boolean(filters.geo),
        onClick: handleNearMe,
      },
      {
        id: "saved",
        label: "Saved",
        icon: Bookmark,
        active: filters.savedOnly,
        onClick: () => updateFilters({ savedOnly: !filters.savedOnly }),
        count: savedLeadIds.size || undefined,
      },
    ];

    // Country suggestion derived from the signed-in user's profile location.
    if (suggestion?.country) {
      const isActive =
        String(filters.country?.value || "").toLowerCase() ===
        String(suggestion.country).toLowerCase();
      chips.push({
        id: "suggested-country",
        label: `In ${suggestion.country}`,
        icon: Globe2,
        suggested: true,
        active: isActive,
        onClick: () => (isActive ? updateFilters({ country: null, region: null, city: null }) : applySuggestedCountry()),
        count: suggestion.count || undefined,
      });
    }
    if (suggestion?.city) {
      const isActive =
        String(filters.city?.value || "").toLowerCase() ===
        String(suggestion.city).toLowerCase();
      chips.push({
        id: "suggested-city",
        label: `In ${suggestion.city}`,
        icon: MapPin,
        suggested: true,
        active: isActive,
        onClick: () => (isActive ? updateFilters({ city: null }) : applySuggestedCity()),
      });
    }

    topCategories.forEach((cat) => {
      chips.push({
        id: `cat-${cat.value}`,
        label: cat.value,
        icon: Layers,
        active: filters.category === cat.value,
        onClick: () =>
          updateFilters({
            category: filters.category === cat.value ? "" : cat.value,
            industry: "",
          }),
        count: cat.count,
      });
    });

    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, facets, suggestion, topCategories, savedLeadIds.size]);

  // ---------------------------------------------------------------------------
  // Client-side post-processing: saved-only view + sorting.
  // ---------------------------------------------------------------------------
  const processedLeads = useMemo(() => {
    let list = [...leads];

    if (filters.savedOnly) {
      const savedList = getSavedLeads();
      const savedIds = new Set(savedList.map((s) => s.id));
      const missing = savedList.filter((s) => !list.some((l) => l.id === s.id));
      list = [...missing, ...list.filter((l) => savedIds.has(l.id))];
      // Saved leads are stored locally, so re-apply the filters to them too.
      list = applyLocalFilters(list, localFilterShape());
    }

    return sortLeads(list, sortBy);
  }, [leads, filters.savedOnly, sortBy, savedLeadIds, localFilterShape]);

  // ---------------------------------------------------------------------------
  // Active filter chips (removable) shown in the toolbar
  // ---------------------------------------------------------------------------
  const activeFilterTags = useMemo(() => {
    const tags = [];
    if (submittedQ.trim())
      tags.push({
        key: "q",
        icon: Search,
        label: `“${submittedQ.trim()}”`,
        clear: () => {
          setQ("");
          setSubmittedQ("");
        },
      });
    if (filters.category)
      tags.push({
        key: "category",
        icon: Layers,
        label: filters.category,
        clear: () => updateFilters({ category: "", industry: "" }),
      });
    if (filters.industry)
      tags.push({
        key: "industry",
        icon: Building2,
        label: filters.industry,
        clear: () => updateFilters({ industry: "" }),
      });
    if (filters.country)
      tags.push({
        key: "country",
        icon: Globe2,
        label: filters.country.value,
        clear: () => updateFilters({ country: null, region: null, city: null }),
      });
    if (filters.region)
      tags.push({
        key: "region",
        icon: Map,
        label: filters.region.value,
        clear: () => updateFilters({ region: null, city: null }),
      });
    if (filters.city)
      tags.push({
        key: "city",
        icon: MapPin,
        label: filters.city.value,
        clear: () => updateFilters({ city: null }),
      });
    if (filters.verifiedOnly)
      tags.push({
        key: "verified",
        icon: BadgeCheck,
        label: "Verified only",
        clear: () => updateFilters({ verifiedOnly: false }),
      });
    if (filters.savedOnly)
      tags.push({
        key: "saved",
        icon: Bookmark,
        label: `Saved (${savedLeadIds.size})`,
        clear: () => updateFilters({ savedOnly: false }),
      });
    if (filters.geo)
      tags.push({
        key: "geo",
        icon: Compass,
        label: `Within ${Math.round(filters.radius / 1000)} km`,
        clear: () => updateFilters({ geo: null }),
      });
    return tags;
  }, [submittedQ, filters, savedLeadIds.size, updateFilters]);

  const activeFilterCount = activeFilterTags.length;

  // ---------------------------------------------------------------------------
  // Lead actions
  // ---------------------------------------------------------------------------
  const handleToggleSave = (e, lead) => {
    e.stopPropagation();
    if (savedLeadIds.has(lead.id)) {
      removeSavedLead(lead.id);
      refreshSavedSet();
      showToast(`Removed ${lead.full_name} from saved`);
    } else {
      saveLead(lead);
      refreshSavedSet();
      showToast(`⭐ Saved ${lead.full_name}`);
    }
  };

  const handleCopyEmail = (e, lead) => {
    e.stopPropagation();
    if (!lead.email) return;
    navigator.clipboard.writeText(lead.email);
    setCopiedId(lead.id);
    showToast(`✓ Copied ${lead.email}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await api.exportLeads({ ...buildParams(), limit: 100 }, "csv");
      const blob = new Blob([result.content], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", result.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("✓ Export ready");
      api.getMyBilling().then((r) => r?.data?.quota && setQuota(r.data.quota)).catch(() => {});
    } catch (err) {
      const code = err?.data?.errors?.code;
      if (err?.status === 429 || code === "QUOTA_EXCEEDED" || code === "THROTTLED") {
        showToast("⚠ Export limit reached. Upgrade your plan to export more.");
      } else {
        showToast(`⚠ ${err.message || "Export failed"}`);
      }
    } finally {
      setExporting(false);
    }
  };

  // Modal navigation
  const modalIndex = selectedLead
    ? processedLeads.findIndex((l) => l.id === selectedLead.id)
    : -1;
  const handlePrevLead =
    modalIndex > 0 ? () => setSelectedLead(processedLeads[modalIndex - 1]) : null;
  const handleNextLead =
    modalIndex >= 0 && modalIndex < processedLeads.length - 1
      ? () => setSelectedLead(processedLeads[modalIndex + 1])
      : null;

  const panelProps = {
    facets,
    filters,
    onChange: updateFilters,
    onReset: resetFilters,
    activeCount: activeFilterCount,
    loading: facetsLoading,
  };

  return (
    <>
      {/* ===================== Hero + search command bar ===================== */}
      <section className="app-hero-card">
        <div className="app-hero-kicker-row">
          <span className="app-hero-kicker">
            <span className="pulse-circle" />
            <b>SEARCH LEADS</b> · Real-Time Directory
          </span>
          {filters.geo && (
            <span
              className="app-hero-kicker"
              style={{ background: "#eef7d9", color: "#506d28", borderColor: "#d5e9a9" }}
            >
              <Compass size={12} /> Within {Math.round(filters.radius / 1000)} km of you
            </span>
          )}
          {usingFallback && (
            <span
              className="app-hero-kicker"
              style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" }}
            >
              Demo data
            </span>
          )}
        </div>

        <h1 className="app-hero-title">
          Find & connect with <span className="text-gradient">decision makers</span>
        </h1>
        <p className="app-hero-sub">
          Filter by category, industry, country, state and city — or jump straight to verified
          leads near you.
        </p>

        <div className="app-search-hub">
          <form className="app-search-bar" onSubmit={handleSearch}>
            <div className="app-search-input-field">
              <Search size={18} />
              <input
                ref={searchInputRef}
                className="app-search-input"
                type="text"
                placeholder="Search by name, company, title or keyword…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {q && (
                <button
                  type="button"
                  className="app-search-clear"
                  onClick={() => {
                    setQ("");
                    setSubmittedQ("");
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="app-search-divider" />

            {/* Inline category + country selects mirror the sidebar filters so
                the most common refinements are one click away on any screen. */}
            <div className="app-select-wrap">
              <Layers size={14} className="icon-left" />
              <select
                className="app-select-input"
                value={filters.category}
                onChange={(e) => updateFilters({ category: e.target.value, industry: "" })}
              >
                <option value="">All Categories</option>
                {(facets?.categories || []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value}
                    {c.count != null ? ` (${c.count})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="app-select-wrap">
              <Globe2 size={14} className="icon-left" />
              <select
                className="app-select-input"
                value={filters.country?.value || ""}
                onChange={(e) => {
                  const match = (facets?.countries || []).find(
                    (c) => c.value === e.target.value
                  );
                  updateFilters({
                    country: match
                      ? { id: match.id, value: match.value, code: match.code }
                      : null,
                    region: null,
                    city: null,
                  });
                }}
              >
                <option value="">All Countries</option>
                {(facets?.countries || []).map((c) => (
                  <option key={c.id ?? c.value} value={c.value}>
                    {c.value}
                    {c.count != null ? ` (${c.count})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className={`app-btn-geo${filters.geo ? " active" : ""}`}
              onClick={handleNearMe}
              title="Filter leads near your location"
            >
              <Compass size={15} />
              <span>{filters.geo ? "Near You" : "Near Me"}</span>
            </button>

            <button type="submit" className="app-btn-search">
              <Search size={15} />
              <span>Search</span>
            </button>
          </form>

          {/* Suggested / quick filter chips */}
          <div className="app-chips-row">
            {quickChips.map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`app-chip${chip.active ? " active" : ""}${
                    chip.suggested ? " suggested" : ""
                  }`}
                  onClick={chip.onClick}
                  title={chip.suggested ? "Suggested from your profile location" : undefined}
                >
                  <Icon size={14} />
                  <span>{chip.label}</span>
                  {chip.count != null && (
                    <span className="app-chip-counter">{chip.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error && (
        <div className="dash-alert dash-alert-error" style={{ marginBottom: 20 }}>
          ⚠ {error}
        </div>
      )}

      {/* ===================== Two-column: filters + results ===================== */}
      <div className="app-search-layout">
        {/* Desktop filter rail */}
        <div className="app-filter-rail">
          <LeadFilterPanel {...panelProps} />
        </div>

        {/* Mobile filter drawer */}
        {filtersOpen && (
          <div className="app-filter-drawer" onClick={() => setFiltersOpen(false)}>
            <div className="app-filter-drawer-inner" onClick={(e) => e.stopPropagation()}>
              <LeadFilterPanel {...panelProps} onClose={() => setFiltersOpen(false)} />
            </div>
          </div>
        )}

        <div className="app-results-col">
          {/* Toolbar */}
          <div className="app-toolbar">
            <div className="app-toolbar-left">
              <button
                type="button"
                className="app-filter-toggle-btn"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={15} />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="app-chip-counter">{activeFilterCount}</span>
                )}
              </button>

              <div className="app-count-badge">
                <span>Showing</span>
                <span className="app-count-number">{processedLeads.length}</span>
                <span>{processedLeads.length === 1 ? "lead" : "leads"}</span>
              </div>

              {activeFilterTags.map((tag) => {
                const Icon = tag.icon;
                return (
                  <span key={tag.key} className="app-active-tag">
                    <Icon size={12} />
                    {tag.label}
                    <button onClick={tag.clear} aria-label={`Remove ${tag.label} filter`}>
                      <X size={13} />
                    </button>
                  </span>
                );
              })}

              {activeFilterCount > 0 && (
                <button type="button" className="app-clear-all-btn" onClick={resetFilters}>
                  Reset all
                </button>
              )}
            </div>

            <div className="app-toolbar-right">
              <select
                className="app-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="recent">Recently Added</option>
                <option value="name">Name (A–Z)</option>
                <option value="company">Company (A–Z)</option>
                <option value="verified">Verified First</option>
                {filters.geo && <option value="distance">Nearest First</option>}
              </select>

              <div className="app-view-toggle">
                <button
                  type="button"
                  className={`app-view-btn${viewMode === "grid" ? " active" : ""}`}
                  onClick={() => setViewMode("grid")}
                  title="Grid view"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  className={`app-view-btn${viewMode === "table" ? " active" : ""}`}
                  onClick={() => setViewMode("table")}
                  title="Table view"
                >
                  <List size={15} />
                </button>
                <button
                  type="button"
                  className={`app-view-btn${viewMode === "compact" ? " active" : ""}`}
                  onClick={() => setViewMode("compact")}
                  title="Compact view"
                >
                  <Grid size={15} />
                </button>
              </div>

              {quota && (
                <Link to="/app/billing" className="app-quota-pill" title="View your plan & usage">
                  <Sparkles size={13} />
                  <span>
                    {quota.plan.name} ·{" "}
                    {quota.searches.limit === -1
                      ? "Unlimited searches"
                      : `${Math.max(0, quota.searches.limit - quota.searches.used)} searches left`}
                  </span>
                </Link>
              )}

              <button
                type="button"
                className="app-export-btn"
                onClick={handleExport}
                disabled={exporting}
                title="Download a CSV of the current search"
              >
                {exporting ? <Loader2 className="spin" size={14} /> : <Download size={14} />}
                <span>{exporting ? "Exporting…" : "Export CSV"}</span>
              </button>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="app-grid">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="skeleton-card">
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div className="skeleton-shimmer skeleton-avatar" />
                    <div style={{ flex: 1 }}>
                      <div
                        className="skeleton-shimmer skeleton-title"
                        style={{ marginBottom: 6 }}
                      />
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
                {filters.savedOnly
                  ? "You haven't saved any leads yet. Bookmark a lead to build your shortlist."
                  : "No leads match this combination of filters. Try widening the location or clearing a filter."}
              </p>

              {activeFilterTags.length > 0 && (
                <div className="app-suggestions">
                  <span>Remove a filter:</span>
                  {activeFilterTags.map((tag) => (
                    <button
                      key={tag.key}
                      type="button"
                      className="app-suggestion-chip"
                      onClick={tag.clear}
                    >
                      {tag.label} <X size={11} />
                    </button>
                  ))}
                </div>
              )}

              <button type="button" className="app-btn-search" onClick={resetFilters}>
                <RefreshCw size={15} />
                <span>Reset All Filters</span>
              </button>
            </div>
          ) : viewMode === "grid" ? (
            <div className="app-grid">
              {processedLeads.map((lead) => {
                const isSaved = savedLeadIds.has(lead.id);
                const isCopied = copiedId === lead.id;
                const distance = formatDistance(lead.distance);

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
                      {categoryOf(lead) && (
                        <span className="lead-pill lead-pill-category">
                          <Layers size={12} /> {categoryOf(lead)}
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
                      {distance && <em className="lead-card-distance">{distance} away</em>}
                    </div>

                    {lead.email && (
                      <div className="lead-card-contact-row">
                        <div className="lead-card-email">
                          <Mail
                            size={12}
                            style={{
                              display: "inline",
                              marginRight: 5,
                              verticalAlign: "middle",
                            }}
                          />
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
                      <span>
                        Added {lead.created_at ? formatDate(lead.created_at) : "recently"}
                      </span>
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
            <div className="app-table-wrapper">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Lead & Role</th>
                    <th>Company</th>
                    <th>Category</th>
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
                          <span className="lead-pill lead-pill-category">
                            {categoryOf(lead) || "—"}
                          </span>
                        </td>
                        <td>
                          <span className="lead-pill lead-pill-industry">
                            {lead.industry || "—"}
                          </span>
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              color: "var(--app-ink-muted)",
                              fontSize: "12.5px",
                            }}
                          >
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
                          <div
                            className="table-actions-cell"
                            onClick={(e) => e.stopPropagation()}
                          >
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

          {nextCursor && !loading && (
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <button
                type="button"
                className="app-header-btn app-header-btn-primary"
                style={{ padding: "10px 24px", fontSize: "13.5px" }}
                disabled={loadingMore}
                onClick={() => fetchLeads({ cursor: nextCursor })}
              >
                {loadingMore ? <Loader2 className="spin" size={16} /> : null}
                <span>{loadingMore ? "Loading more leads…" : "Load More Leads"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onPrev={handlePrevLead}
          onNext={handleNextLead}
        />
      )}

      {toastMessage && (
        <div className="app-toast">
          <Sparkles size={16} color="var(--app-lime)" />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
