import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Columns3,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import "../styles/csv-field-mapping.css";

export const DB_FIELDS = [
  { key: "full_name", label: "Full name", required: true, hint: "Lead's display name" },
  { key: "headline", label: "Headline", hint: "Professional headline" },
  { key: "about", label: "About", hint: "Bio or summary" },
  { key: "email", label: "Email", hint: "Email address" },
  { key: "phone", label: "Phone", hint: "Phone number" },
  { key: "linkedin_url", label: "LinkedIn URL", hint: "LinkedIn profile" },
  { key: "twitter_url", label: "X / Twitter URL", hint: "X or Twitter profile" },
  { key: "facebook_url", label: "Facebook URL", hint: "Facebook profile" },
  { key: "website_url", label: "Website URL", hint: "Personal or company site" },
  { key: "company_name", label: "Company name", hint: "Current company" },
  { key: "job_title", label: "Job title", hint: "Current position" },
  { key: "num_employees", label: "Number of employees", hint: "Company headcount" },
  { key: "industry", label: "Industry", hint: "Business sector" },
  { key: "country", label: "Country", hint: "Country name" },
  { key: "country_code", label: "Country code", hint: "ISO alpha-2 code" },
  { key: "region", label: "Region / State", hint: "State or province" },
  { key: "city", label: "City", hint: "City or town" },
  { key: "lat", label: "Latitude", hint: "Decimal latitude" },
  { key: "lon", label: "Longitude", hint: "Decimal longitude" },
];

const FIELD_ALIASES = {
  full_name: ["full name", "fullname", "name", "contact name", "person name"],
  headline: ["headline", "professional headline", "profile headline"],
  about: ["about", "bio", "biography", "description", "summary"],
  email: ["email", "email address", "e-mail", "mail"],
  phone: ["phone", "phone number", "telephone", "mobile", "cell", "mobile number"],
  linkedin_url: ["linkedin", "linkedin url", "linkedin profile", "linkedin link"],
  twitter_url: ["twitter", "twitter url", "twitter profile", "x url", "x profile"],
  facebook_url: ["facebook", "facebook url", "facebook profile", "fb url"],
  website_url: ["website", "website url", "web url", "site", "homepage"],
  company_name: ["company", "company name", "organization", "organisation", "employer"],
  job_title: ["job title", "title", "position", "role", "designation"],
  num_employees: ["number of employees", "num employees", "num_employees", "employees", "employee count", "headcount", "company size"],
  industry: ["industry", "sector", "business sector"],
  country: ["country", "country name", "nation"],
  country_code: ["country code", "iso code", "country iso", "country iso2"],
  region: [
    "region",
    "state",
    "province",
    "state province",
    "state/province",
    "primary state",
    "parent state",
    "primary state province",
    "parent state province",
    "primary state name",
    "parent state name",
    "primary province",
    "parent province",
  ],
  city: [
    "city",
    "city name",
    "town",
    "primary city",
    "parent city",
    "primary city name",
    "parent city name",
  ],
  lat: ["lat", "latitude", "gps lat"],
  lon: ["lon", "lng", "longitude", "gps lon", "gps lng"],
};

const normalize = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[_./-]+/g, " ")
  .replace(/[^a-z0-9 ]/g, "")
  .replace(/\s+/g, " ");

export function buildAutomaticMapping(headers) {
  const output = {};
  const used = new Set();

  DB_FIELDS.forEach((field) => {
    const aliases = new Set([field.key, field.label, ...(FIELD_ALIASES[field.key] || [])].map(normalize));
    const match = headers.find((header) => !used.has(header) && aliases.has(normalize(header)));
    if (match) {
      output[field.key] = { type: "single", csvField: match };
      used.add(match);
    }
  });

  // A very common CSV shape: first_name + last_name. Combine it automatically,
  // inserting a middle name between the first and last name when present.
  if (!output.full_name) {
    const first = headers.find((h) => ["first name", "firstname", "given name"].includes(normalize(h)));
    const middle = headers.find((h) => ["middle name", "middlename", "middle initial"].includes(normalize(h)));
    const last = headers.find((h) => ["last name", "lastname", "surname", "family name"].includes(normalize(h)));
    if (first && last) {
      output.full_name = middle
        ? { type: "combined", csvFields: [first, middle, last], separator: "space" }
        : { type: "combined", csvFields: [first, last], separator: "space" };
    }
  }
  return output;
}

const separatorText = (separator) => separator === "comma" ? ", " : " ";

function mappingSources(config) {
  if (!config) return [];
  return config.type === "combined" ? config.csvFields : [config.csvField];
}

export default function CsvFieldMapping({ csvHeaders, sampleData = [], totalRows, startRow, endRow, useRowRange, onConfirm, onCancel, submitting = false, error = null, progress = null }) {
  const [mapping, setMapping] = useState(() => buildAutomaticMapping(csvHeaders));
  const [selectedSource, setSelectedSource] = useState(null);
  const [combining, setCombining] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [lineCanvas, setLineCanvas] = useState({ items: [], width: 0, height: 0 });
  const boardRef = useRef(null);
  const sourceRefs = useRef({});
  const targetRefs = useRef({});

  useEffect(() => {
    setMapping(buildAutomaticMapping(csvHeaders));
    setSelectedSource(null);
  }, [csvHeaders]);

  const mappedCount = Object.keys(mapping).length;
  const requiredReady = Boolean(mapping.full_name);
  const autoCount = useMemo(() => Object.keys(buildAutomaticMapping(csvHeaders)).length, [csvHeaders]);
  const mappedSources = useMemo(() => new Set(Object.values(mapping).flatMap(mappingSources)), [mapping]);

  const updateLines = () => {
    const board = boardRef.current;
    if (!board || window.innerWidth < 760) return setLineCanvas({ items: [], width: 0, height: 0 });
    const boardBox = board.getBoundingClientRect();
    const next = [];
    Object.entries(mapping).forEach(([target, config], targetIndex) => {
      mappingSources(config).forEach((source, sourceIndex) => {
        const sourceNode = sourceRefs.current[source];
        const targetNode = targetRefs.current[target];
        if (!sourceNode || !targetNode) return;
        const a = sourceNode.getBoundingClientRect();
        const b = targetNode.getBoundingClientRect();
        next.push({
          id: `${target}-${source}-${sourceIndex}`,
          x1: a.right - boardBox.left + board.scrollLeft,
          y1: a.top + a.height / 2 - boardBox.top + board.scrollTop,
          x2: b.left - boardBox.left + board.scrollLeft,
          y2: b.top + b.height / 2 - boardBox.top + board.scrollTop,
          color: targetIndex % 2 ? "#7c3aed" : "#4f46e5",
        });
      });
    });
    setLineCanvas({ items: next, width: board.scrollWidth, height: board.scrollHeight });
  };

  useLayoutEffect(() => {
    updateLines();
    const observer = new ResizeObserver(updateLines);
    if (boardRef.current) observer.observe(boardRef.current);
    window.addEventListener("resize", updateLines);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLines);
    };
  }, [mapping, csvHeaders]);

  const mapSingle = (target, source) => {
    if (!source) return;
    setMapping((current) => ({ ...current, [target]: { type: "single", csvField: source } }));
    setSelectedSource(null);
  };

  const removeMapping = (target) => {
    setMapping((current) => {
      const next = { ...current };
      delete next[target];
      return next;
    });
  };

  const startCombination = (target) => {
    const existing = mapping[target];
    setCombining({
      target,
      csvFields: existing ? mappingSources(existing) : [],
      separator: existing?.separator || "space",
    });
  };

  const combinedSample = combining
    ? combining.csvFields.map((field) => sampleData[0]?.[field]).filter((value) => String(value || "").trim()).join(separatorText(combining.separator))
    : "";

  return (
    <div className="csv-map-overlay" role="dialog" aria-modal="true" aria-labelledby="csv-map-title">
      <section className="csv-map-modal">
        <header className="csv-map-header">
          <div className="csv-map-heading">
            <span className="csv-map-icon"><Columns3 size={21} /></span>
            <div>
              <div className="csv-map-eyebrow">Step 2 of 2 · Configure import</div>
              <h2 id="csv-map-title">Match your CSV columns</h2>
              <p>
                We matched what we could. Review the connections before importing.
                {useRowRange && (
                  <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 500 }}>
                    Importing rows {startRow}{endRow ? ` to ${endRow}` : '+'} of {totalRows?.toLocaleString() || 'unknown'} total
                  </span>
                )}
              </p>
            </div>
          </div>
          <button className="csv-map-icon-btn" onClick={onCancel} aria-label="Close field mapping"><X size={20} /></button>
        </header>

        <div className="csv-map-toolbar">
          <div className="csv-map-stats">
            <span className="csv-map-stat csv-map-stat-good"><Sparkles size={15} /> {autoCount} auto-matched</span>
            <span className="csv-map-stat"><Link2 size={15} /> {mappedCount} of {DB_FIELDS.length} fields mapped</span>
            <span className={`csv-map-stat ${requiredReady ? "csv-map-stat-good" : "csv-map-stat-warn"}`}>
              {requiredReady ? <Check size={15} /> : <span className="csv-map-dot" />} Full name {requiredReady ? "ready" : "required"}
            </span>
          </div>
          <button className="csv-map-preview-toggle" onClick={() => setShowPreview((value) => !value)}>
            Preview CSV <ChevronDown size={15} className={showPreview ? "open" : ""} />
          </button>
        </div>

        {showPreview && (
          <div className="csv-map-preview">
            <table>
              <thead><tr>{csvHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>{sampleData.slice(0, 3).map((row, index) => (
                <tr key={index}>{csvHeaders.map((header) => <td key={header}>{row[header] || <span>—</span>}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        )}

        <div className="csv-map-instruction">
          <span className="csv-map-instruction-number">1</span>
          <span>Select a CSV column</span><ArrowRight size={14} /><span>then select a lead field.</span>
          <span className="csv-map-instruction-muted">Use “Combine” to join two or more columns.</span>
        </div>

        <div className="csv-map-board" ref={boardRef}>
          <svg className="csv-map-lines" aria-hidden="true" style={{ width: lineCanvas.width, height: lineCanvas.height }}>
            {lineCanvas.items.map((line) => {
              const curve = Math.max(45, (line.x2 - line.x1) * 0.42);
              return <path key={line.id} d={`M ${line.x1} ${line.y1} C ${line.x1 + curve} ${line.y1}, ${line.x2 - curve} ${line.y2}, ${line.x2} ${line.y2}`} stroke={line.color} />;
            })}
          </svg>

          <div className="csv-map-column csv-map-source-column">
            <div className="csv-map-column-head">
              <div><span>Source</span><h3>CSV columns</h3></div><b>{csvHeaders.length}</b>
            </div>
            <div className="csv-map-list">
              {csvHeaders.map((header) => {
                const selected = selectedSource === header;
                const used = mappedSources.has(header);
                return (
                  <button
                    type="button"
                    key={header}
                    ref={(node) => { sourceRefs.current[header] = node; }}
                    className={`csv-source-card${selected ? " selected" : ""}${used ? " mapped" : ""}`}
                    onClick={() => setSelectedSource(selected ? null : header)}
                  >
                    <span className="csv-card-status">{used ? <Check size={12} /> : null}</span>
                    <span className="csv-card-copy"><strong>{header}</strong><small>{sampleData[0]?.[header] || "No sample value"}</small></span>
                    <span className="csv-card-port" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="csv-map-column csv-map-target-column">
            <div className="csv-map-column-head">
              <div><span>Destination</span><h3>Lead database fields</h3></div><b>{DB_FIELDS.length}</b>
            </div>
            <div className="csv-map-list">
              {DB_FIELDS.map((field) => {
                const config = mapping[field.key];
                const sources = mappingSources(config);
                return (
                  <div
                    key={field.key}
                    ref={(node) => { targetRefs.current[field.key] = node; }}
                    className={`csv-target-card${config ? " mapped" : ""}${selectedSource ? " awaiting" : ""}`}
                    onClick={() => selectedSource && mapSingle(field.key, selectedSource)}
                  >
                    <span className="csv-card-port" />
                    <div className="csv-target-main">
                      <div className="csv-target-title">
                        <strong>{field.label}{field.required && <em>Required</em>}</strong>
                        <small>{field.hint}</small>
                      </div>
                      {config ? (
                        <div className="csv-mapping-value">
                          {sources.map((source, index) => <span key={source}>{index > 0 && <i>{config.separator === "comma" ? "," : "+"}</i>}<b>{source}</b></span>)}
                        </div>
                      ) : (
                        <select value="" onChange={(event) => mapSingle(field.key, event.target.value)} onClick={(event) => event.stopPropagation()} aria-label={`Map ${field.label}`}>
                          <option value="">Choose a CSV column…</option>
                          {csvHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                        </select>
                      )}
                    </div>
                    <div className="csv-target-actions">
                      <button type="button" onClick={(event) => { event.stopPropagation(); startCombination(field.key); }} title={config?.type === "combined" ? "Edit combined mapping" : "Combine columns"}>
                        <Plus size={13} /> <span>Combine</span>
                      </button>
                      {config && <button type="button" className="remove" onClick={(event) => { event.stopPropagation(); removeMapping(field.key); }} title="Remove mapping"><X size={14} /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {!requiredReady && <div className="csv-map-required-note">Map a CSV column—or combine first and last name—to <strong>Full name</strong> before importing.</div>}
        {error && <div className="csv-map-import-error" role="alert">{error}</div>}

        {progress && (
          <div className="csv-import-progress" role="status" aria-live="polite">
            <div className="csv-import-progress-head">
              <span className="csv-import-progress-title">
                <Loader2 className="spin" size={15} /> Importing leads…
              </span>
              <span className="csv-import-progress-count">
                <strong>{progress.processed.toLocaleString()}</strong> of {progress.total.toLocaleString()} rows ·{" "}
                <strong>{progress.remaining.toLocaleString()}</strong> remaining
              </span>
            </div>
            <div className="csv-import-progress-bar">
              <div
                className="csv-import-progress-fill"
                style={{ width: `${progress.total ? Math.min(100, (progress.processed / progress.total) * 100) : 0}%` }}
              />
            </div>
            <div className="csv-import-progress-stats">
              <span className="csv-import-progress-good">Imported {progress.imported.toLocaleString()}</span>
              <span>Skipped {progress.skipped.toLocaleString()}</span>
              <span>Failed {progress.failed.toLocaleString()}</span>
            </div>
          </div>
        )}

        <footer className="csv-map-footer">
          <button className="dash-btn dash-btn-ghost" onClick={onCancel} disabled={submitting}>Back</button>
          <div className="csv-map-footer-copy"><strong>{mappedCount} fields will be imported</strong><span>Unmapped CSV columns will be ignored</span></div>
          <button className="dash-btn dash-btn-primary csv-map-import" onClick={() => onConfirm(mapping)} disabled={!requiredReady || submitting}>
            {submitting ? "Importing…" : "Confirm & import leads"} <ArrowRight size={16} />
          </button>
        </footer>
      </section>

      {combining && (
        <div className="csv-combine-overlay" onMouseDown={(event) => event.target === event.currentTarget && setCombining(null)}>
          <section className="csv-combine-modal" role="dialog" aria-modal="true" aria-labelledby="combine-title">
            <header><div><span>COMBINE COLUMNS</span><h3 id="combine-title">Build {DB_FIELDS.find((field) => field.key === combining.target)?.label}</h3><p>Select columns in the order they should appear.</p></div><button onClick={() => setCombining(null)} aria-label="Close"><X size={18} /></button></header>
            <div className="csv-combine-fields">
              {csvHeaders.map((header) => {
                const index = combining.csvFields.indexOf(header);
                return <button key={header} className={index >= 0 ? "selected" : ""} onClick={() => setCombining((current) => ({ ...current, csvFields: index >= 0 ? current.csvFields.filter((item) => item !== header) : [...current.csvFields, header] }))}>
                  <span>{index >= 0 ? index + 1 : ""}</span><div><strong>{header}</strong><small>{sampleData[0]?.[header] || "No sample value"}</small></div>{index >= 0 && <Check size={15} />}
                </button>;
              })}
            </div>
            {combining.csvFields.length > 1 && <div className="csv-combine-order">
              <label>Column order</label>
              {combining.csvFields.map((field, index) => <div key={field}><b>{index + 1}</b><span>{field}</span><button disabled={index === 0} onClick={() => setCombining((current) => { const fields = [...current.csvFields]; [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]]; return { ...current, csvFields: fields }; })}><ArrowUp size={14} /></button><button disabled={index === combining.csvFields.length - 1} onClick={() => setCombining((current) => { const fields = [...current.csvFields]; [fields[index + 1], fields[index]] = [fields[index], fields[index + 1]]; return { ...current, csvFields: fields }; })}><ArrowDown size={14} /></button></div>)}
            </div>}
            <div className="csv-combine-separator"><label>Join values with</label><div><button className={combining.separator === "space" ? "active" : ""} onClick={() => setCombining((current) => ({ ...current, separator: "space" }))}>Space <code>First Last</code></button><button className={combining.separator === "comma" ? "active" : ""} onClick={() => setCombining((current) => ({ ...current, separator: "comma" }))}>Comma <code>City, State</code></button></div></div>
            <div className="csv-combine-sample"><span>RESULT PREVIEW</span><strong>{combinedSample || "Select at least one column"}</strong></div>
            <footer><button className="dash-btn dash-btn-ghost" onClick={() => setCombining(null)}>Cancel</button><button className="dash-btn dash-btn-primary" disabled={!combining.csvFields.length} onClick={() => { setMapping((current) => ({ ...current, [combining.target]: combining.csvFields.length === 1 ? { type: "single", csvField: combining.csvFields[0] } : { type: "combined", csvFields: combining.csvFields, separator: combining.separator } })); setCombining(null); }}>Save combination</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
