import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  ChevronDown,
  Compass,
  Globe2,
  Layers,
  Map,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";

/**
 * Faceted filter rail for the leads directory.
 *
 * Every dimension is a searchable option list with live result counts, and the
 * location filters cascade: Country → State/Province → City. Options come from
 * `/api/leads/facets` (or the local fallback) so the user only ever sees values
 * that would actually return leads.
 */

const RADIUS_OPTIONS = [
  { value: 10000, label: "10 km" },
  { value: 25000, label: "25 km" },
  { value: 50000, label: "50 km" },
  { value: 100000, label: "100 km" },
  { value: 250000, label: "250 km" },
];

function formatCount(n) {
  if (n == null) return "";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/** A collapsible group with a type-ahead box and a scrollable option list. */
function FacetGroup({
  icon: Icon,
  title,
  options,
  value,
  onSelect,
  placeholder,
  emptyHint,
  disabled = false,
  searchable = true,
  defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [term, setTerm] = useState("");

  const filtered = useMemo(() => {
    if (!term.trim()) return options;
    const lower = term.trim().toLowerCase();
    return options.filter((o) => String(o.value).toLowerCase().includes(lower));
  }, [options, term]);

  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div className={`filter-group${disabled ? " disabled" : ""}`}>
      <button
        type="button"
        className="filter-group-head"
        onClick={() => !disabled && setOpen((p) => !p)}
        aria-expanded={open}
      >
        <span className="filter-group-title">
          <Icon size={14} />
          {title}
        </span>
        <span className="filter-group-head-right">
          {value && (
            <span className="filter-group-selected" title={selected?.value || value}>
              {selected?.value || value}
            </span>
          )}
          <ChevronDown size={14} className={`filter-caret${open ? " open" : ""}`} />
        </span>
      </button>

      {open && !disabled && (
        <div className="filter-group-body">
          {searchable && options.length > 8 && (
            <input
              className="filter-search"
              type="text"
              value={term}
              placeholder={placeholder}
              onChange={(e) => setTerm(e.target.value)}
            />
          )}

          {options.length === 0 ? (
            <p className="filter-empty">{emptyHint}</p>
          ) : (
            <ul className="filter-options">
              <li>
                <button
                  type="button"
                  className={`filter-option${!value ? " active" : ""}`}
                  onClick={() => onSelect(null)}
                >
                  <span className="filter-option-label">All {title.toLowerCase()}</span>
                </button>
              </li>
              {filtered.map((option) => {
                const isActive = String(option.value) === String(value);
                return (
                  <li key={`${option.id ?? option.value}`}>
                    <button
                      type="button"
                      className={`filter-option${isActive ? " active" : ""}`}
                      onClick={() => onSelect(isActive ? null : option)}
                      title={option.value}
                    >
                      <span className="filter-option-label">{option.value}</span>
                      {option.count != null && (
                        <span className="filter-option-count">{formatCount(option.count)}</span>
                      )}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="filter-empty">No match for “{term}”</li>}
            </ul>
          )}
        </div>
      )}

      {disabled && <p className="filter-locked-hint">{emptyHint}</p>}
    </div>
  );
}

export default function LeadFilterPanel({
  facets,
  filters,
  onChange,
  onReset,
  activeCount,
  loading,
  onClose,
}) {
  const {
    category,
    industry,
    country,
    region,
    city,
    verifiedOnly,
    geo,
    radius,
  } = filters;

  return (
    <aside className="filter-panel">
      <div className="filter-panel-head">
        <h2>
          <SlidersHorizontal size={15} />
          Filters
          {activeCount > 0 && <span className="filter-active-count">{activeCount}</span>}
        </h2>
        <div className="filter-panel-head-actions">
          {activeCount > 0 && (
            <button type="button" className="filter-reset-btn" onClick={onReset}>
              <RotateCcw size={12} /> Reset
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="filter-close-btn"
              onClick={onClose}
              aria-label="Close filters"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Verified refinement — a regular pressed button, not a switch. */}
      <button
        type="button"
        className={`filter-verified-btn${verifiedOnly ? " active" : ""}`}
        onClick={() => onChange({ verifiedOnly: !verifiedOnly })}
        aria-pressed={verifiedOnly}
      >
        <span className="filter-verified-text">
          <BadgeCheck size={14} />
          Verified leads only
          {facets?.totals?.verified != null && (
            <em>{formatCount(facets.totals.verified)}</em>
          )}
        </span>
      </button>

      <FacetGroup
        icon={Layers}
        title="Category"
        options={facets?.categories || []}
        value={category}
        placeholder="Search categories…"
        emptyHint="No categories available yet."
        onSelect={(opt) => onChange({ category: opt?.value || "", industry: "" })}
      />

      <FacetGroup
        icon={Building2}
        title="Industry"
        options={facets?.industries || []}
        value={industry}
        placeholder="Search industries…"
        emptyHint="No industries match the current filters."
        onSelect={(opt) => onChange({ industry: opt?.value || "" })}
      />

      <FacetGroup
        icon={Globe2}
        title="Country"
        options={facets?.countries || []}
        value={country?.value}
        placeholder="Search countries…"
        emptyHint="No countries match the current filters."
        onSelect={(opt) =>
          onChange({
            country: opt ? { id: opt.id, value: opt.value, code: opt.code } : null,
            region: null,
            city: null,
          })
        }
      />

      <FacetGroup
        icon={Map}
        title="State / Province"
        options={facets?.regions || []}
        value={region?.value}
        placeholder="Search states…"
        emptyHint={country ? "No states recorded for this country." : "Pick a country first."}
        disabled={!country}
        onSelect={(opt) =>
          onChange({ region: opt ? { id: opt.id, value: opt.value } : null, city: null })
        }
      />

      <FacetGroup
        icon={MapPin}
        title="City"
        options={facets?.cities || []}
        value={city?.value}
        placeholder="Search cities…"
        emptyHint={country ? "No cities recorded for this selection." : "Pick a country first."}
        disabled={!country}
        onSelect={(opt) => onChange({ city: opt ? { id: opt.id, value: opt.value } : null })}
      />

      {/* Radius only matters while a "Near Me" geo search is active. */}
      {geo && (
        <div className="filter-group">
          <div className="filter-group-head static">
            <span className="filter-group-title">
              <Compass size={14} />
              Search radius
            </span>
          </div>
          <div className="filter-radius-row">
            {RADIUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`filter-radius-btn${radius === opt.value ? " active" : ""}`}
                onClick={() => onChange({ radius: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="filter-loading">Updating filter counts…</div>}
    </aside>
  );
}
