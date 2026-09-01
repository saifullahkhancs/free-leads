import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, Download, FileSpreadsheet, Loader2, ShieldAlert, StopCircle, UploadCloud, XCircle } from "lucide-react";
import * as api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import CsvFieldMapping from "../../components/CsvFieldMapping";

// Imports up to this many data rows run synchronously (instant result).
// Anything bigger is uploaded once and processed by the server's Redis
// (BullMQ) background worker, so the request can never hit a gateway timeout.
const SYNC_MAX_ROWS = 2000;
// Files above this size skip the client-side row count and always queue.
const SYNC_MAX_FILE_BYTES = 4 * 1024 * 1024;
const JOB_POLL_INTERVAL_MS = 2000;

const CSV_TEMPLATE = [
  "full_name,headline,about,email,linkedin_url,twitter_url,facebook_url,website_url,country,country_code,region,city,industry,company_name,job_title,num_employees",
  "John Doe,Software Engineer,Experienced dev,john.doe@example.com,https://linkedin.com/in/johndoe,,,,United States,US,California,San Francisco,Software,Tech Corp,Senior Developer,250",
  "Jane Smith,Marketing Specialist,SEO expert,jane.smith@example.com,,,,,United Kingdom,GB,Greater London,London,Marketing,Ad Agency,Account Manager,42",
  "Bob Brown,Sales Lead,Top closer,bob.brown@example.com,,,,https://bobbrown.com,Canada,CA,Ontario,Toronto,Sales,Sales Force,Sales Director,1200",
].join("\n");

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leads-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Split CSV text into individual record strings (header + data rows), correctly
 * honouring quoted fields (commas, escaped quotes and even embedded newlines
 * stay inside their record). Used to count rows client-side and to stream the
 * import in small windows so we can report live "X uploaded / Y remaining".
 */
function splitCsvRecords(text) {
  const raw = [];
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++; // escaped quote -> still inside the field
        else inQuotes = false;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "\n") {
      raw.push(text.slice(start, i));
      start = i + 1;
    }
  }
  const last = text.slice(start);
  if (last.trim() !== "") raw.push(last);

  return raw
    .map((r) => (r.endsWith("\r") ? r.slice(0, -1) : r))
    .filter((r) => r.trim() !== "");
}

/** Build import windows of `chunkSize` data rows, each re-including the header. */
function formatJobTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

const JOB_STATUS_LABELS = {
  queued: "Queued",
  processing: "Importing…",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default function ImportLeadsPage() {
  const { user } = useAuth();
  const canManage = user?.roles?.some((r) => ["admin", "super_admin", "editor"].includes(r));
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [maxRows, setMaxRows] = useState("");
  const [showMapping, setShowMapping] = useState(false);
  const [csvData, setCsvData] = useState(null);
  const [startRow, setStartRow] = useState(0);
  const [endRow, setEndRow] = useState("");
  const [useRowRange, setUseRowRange] = useState(false);
  // Background import job currently being tracked (Redis/BullMQ on the server).
  const [job, setJob] = useState(null);
  // Client-side guess of how many rows the job will process (drives the bar
  // before the server has counted the file).
  const [jobTotalHint, setJobTotalHint] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [cancelling, setCancelling] = useState(false);
  const pollTimerRef = useRef(null);

  // Stop polling if the page unmounts (the job itself keeps running server-side).
  useEffect(() => () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  const refreshRecentJobs = async () => {
    try {
      const res = await api.listImportJobs(5);
      setRecentJobs(res?.data?.jobs || []);
    } catch {
      // non-critical panel — ignore
    }
  };

  // On load: show recent jobs and resume tracking one that is still running.
  useEffect(() => {
    if (!canManage) return;
    (async () => {
      try {
        const res = await api.listImportJobs(5);
        const jobs = res?.data?.jobs || [];
        setRecentJobs(jobs);
        const active = jobs.find((j) => ["queued", "processing"].includes(j.status));
        if (active) {
          setJob(active);
          pollJob(active.id);
        }
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const pollJob = async (jobId) => {
    try {
      const res = await api.getImportJob(jobId);
      const j = res?.data?.job;
      if (j) {
        setJob(j);
        if (["completed", "failed", "cancelled"].includes(j.status)) {
          setImporting(false);
          setCancelling(false);
          if (j.status === "completed") {
            setResult({
              imported: j.imported || 0,
              skipped: j.skipped || 0,
              failed: j.failed || 0,
              total: j.total_rows ?? j.processed ?? 0,
              errors: j.errors || [],
            });
            setFile(null);
          } else if (j.status === "failed") {
            setError(j.error_message || "Import failed on the server.");
          }
          refreshRecentJobs();
          return;
        }
      }
    } catch {
      // transient poll error (network blip, token refresh) — keep polling
    }
    pollTimerRef.current = setTimeout(() => pollJob(jobId), JOB_POLL_INTERVAL_MS);
  };

  const handleCancelJob = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      const res = await api.cancelImportJob(job.id);
      if (res?.data?.job) setJob(res.data.job);
    } catch (err) {
      setError(err.message || "Could not cancel the import job.");
      setCancelling(false);
    }
  };

  const acceptFile = (f) => {
    setError(null);
    setResult(null);
    if (!f) return;
    const isCsv = f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv";
    if (!isCsv) {
      setError("Please choose a .csv file.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const parsedLimit = (() => {
    if (maxRows === "" || maxRows == null) return undefined;
    const n = Number.parseInt(maxRows, 10);
    return Number.isNaN(n) || n < 1 ? undefined : n;
  })();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer?.files?.[0]);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      // Read only a small prefix for the five-row mapping preview. The final
      // import still streams the complete file to avoid loading large CSVs in memory.
      const previewBytes = 2 * 1024 * 1024;
      const previewText = await file.slice(0, previewBytes).text();
      
      // Use row range if specified
      const start = useRowRange ? parseInt(startRow) || 0 : 0;
      const end = useRowRange && endRow ? parseInt(endRow) : null;
      
      const parseRes = await api.parseCsv(previewText, start, end);
      setCsvData({
        headers: parseRes.data.headers,
        sampleData: parseRes.data.sampleData,
        totalRows: parseRes.data.totalRows,
        startRow: start,
        endRow: end,
        useRowRange: useRowRange
      });
      setShowMapping(true);
    } catch (err) {
      console.error("CSV preview error:", err);
      setError(err.message || "Could not read the CSV. Please check its format.");
    } finally {
      setImporting(false);
    }
  };

  const handleMappingConfirm = async (mapping) => {
    setImporting(true);
    setError(null);
    setResult(null);
    setJob(null);

    // Resolve the requested row window: an explicit range wins over "max rows".
    const start = useRowRange ? parseInt(startRow) || 0 : 0;
    const end = useRowRange && endRow ? parseInt(endRow) : null;
    const offset = start > 0 ? start : undefined;
    const limit = end != null ? Math.max(end - start, 0) : parsedLimit;

    try {
      // Small files import synchronously for an instant result; anything
      // bigger is queued as a Redis background job so no request can ever hit
      // the reverse-proxy timeout (the old 503 on large files).
      if (file.size <= SYNC_MAX_FILE_BYTES) {
        const fullText = await file.text();
        const records = splitCsvRecords(fullText);
        const dataRowCount = Math.max(records.length - 1, 0);
        if (dataRowCount === 0) throw new Error("The CSV file has no rows to import.");
        const windowRows = Math.max(dataRowCount - (offset || 0), 0);
        const effectiveRows = limit != null ? Math.min(limit, windowRows) : windowRows;

        if (effectiveRows <= SYNC_MAX_ROWS) {
          const res = await api.importLeadsCsv(fullText, "csv_upload", { fieldMapping: mapping, limit, offset });
          const d = res?.data || {};
          if (d.queued && d.job) {
            // Server decided to queue it anyway — track the job.
            startTrackingJob(d.job, effectiveRows);
            return;
          }
          setResult({
            imported: d.imported || 0,
            skipped: d.skipped || 0,
            failed: d.failed || 0,
            total: d.total ?? effectiveRows,
            errors: d.errors || [],
          });
          setShowMapping(false);
          setCsvData(null);
          setFile(null);
          setImporting(false);
          refreshRecentJobs();
          return;
        }

        // Big row count in a small-ish file: upload once, import in background.
        const res = await api.importLeadsFile(file, { fieldMapping: mapping, limit, offset });
        startTrackingJob(res?.data?.job, effectiveRows);
        return;
      }

      // Large file: single multipart upload, then the worker takes over.
      const res = await api.importLeadsFile(file, { fieldMapping: mapping, limit, offset });
      startTrackingJob(res?.data?.job, limit ?? null);
    } catch (err) {
      setError(err.message || "Import failed.");
      setImporting(false);
    }
  };

  /** Close the mapping modal and start polling a queued background job. */
  const startTrackingJob = (queuedJob, totalHint) => {
    setShowMapping(false);
    setCsvData(null);
    if (!queuedJob) {
      setError("The import job could not be started. Please try again.");
      setImporting(false);
      return;
    }
    setJob(queuedJob);
    setJobTotalHint(totalHint || null);
    refreshRecentJobs();
    pollTimerRef.current = setTimeout(() => pollJob(queuedJob.id), JOB_POLL_INTERVAL_MS);
  };

  const handleMappingCancel = () => {
    setShowMapping(false);
    setCsvData(null);
  };

  return (
    <>
      <div className="dash-page-head">
        <div>
          <h1>Import CSV</h1>
          <p>Upload a CSV file and every valid row becomes a lead. Unknown countries, regions and cities are resolved automatically.</p>
        </div>
        <div className="dash-page-actions">
          <button className="dash-btn" onClick={downloadTemplate}>
            <Download size={15} /> Download CSV template
          </button>
        </div>
      </div>

      {!canManage && (
        <div className="dash-card">
          <div className="empty-state">
            <div className="empty-state-icon"><ShieldAlert size={24} /></div>
            <h3>Editor access required</h3>
            <p>Only editors, admins and super admins can import leads. Ask an admin to upgrade your role.</p>
            <Link to="/admin/leads" className="dash-btn">Browse leads instead</Link>
          </div>
        </div>
      )}

      {canManage && error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

      {canManage && job && ["queued", "processing"].includes(job.status) && (
        <div className="dash-card" style={{ marginBottom: 20 }}>
          <div className="dash-card-head">
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Loader2 className="spin" size={16} /> Import in progress
            </h2>
          </div>
          <div className="dash-card-body">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <span className="dash-badge badge-gray">{JOB_STATUS_LABELS[job.status] || job.status}</span>
              <span style={{ fontSize: 13, color: "var(--dash-muted)" }}>
                {job.filename || "CSV file"} · started {formatJobTime(job.started_at || job.created_at)}
              </span>
              <button
                className="dash-btn dash-btn-ghost dash-btn-sm"
                style={{ marginLeft: "auto" }}
                onClick={handleCancelJob}
                disabled={cancelling}
              >
                <StopCircle size={14} /> {cancelling ? "Cancelling…" : "Cancel import"}
              </button>
            </div>
            {(() => {
              const total = job.total_rows || jobTotalHint || null;
              const processed = job.processed || 0;
              const pct = total ? Math.min(100, Math.round((processed / total) * 100)) : null;
              return (
                <>
                  <div style={{ height: 10, borderRadius: 6, background: "var(--dash-border, #e4e4e7)", overflow: "hidden", marginBottom: 8 }}>
                    <div
                      style={{
                        height: "100%",
                        width: pct != null ? `${pct}%` : "35%",
                        background: "var(--dash-green, #16a34a)",
                        borderRadius: 6,
                        transition: "width 0.5s ease",
                        ...(pct == null ? { animation: "importJobPulse 1.4s ease-in-out infinite alternate" } : {}),
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                    <span><strong>{processed.toLocaleString()}</strong>{total ? ` of ${total.toLocaleString()}` : ""} rows processed{pct != null ? ` (${pct}%)` : ""}</span>
                    <span style={{ color: "var(--dash-green)" }}>Imported {(job.imported || 0).toLocaleString()}</span>
                    <span style={{ color: "var(--dash-muted)" }}>Skipped {(job.skipped || 0).toLocaleString()}</span>
                    <span style={{ color: "var(--dash-danger)" }}>Failed {(job.failed || 0).toLocaleString()}</span>
                  </div>
                  <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--dash-muted)" }}>
                    The import runs on the server — you can safely leave this page and come back; progress continues in the background.
                  </p>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {canManage && result && (
        <div className="dash-alert dash-alert-success" style={{ display: "block" }}>
          <strong>Import complete</strong> — {result.imported} of {result.total} rows imported
          {result.failed > 0 && `, ${result.failed} skipped`}.
        </div>
      )}

      {canManage && <div className="dash-card" style={{ marginBottom: "20px" }}>
        <div className="dash-card-body">
          {!file ? (
            <div
              className={`upload-zone${dragging ? " dragging" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />
              <div className="upload-zone-icon"><UploadCloud size={26} /></div>
              <h3>Drop your CSV here, or click to browse</h3>
              <p>Only <strong>.csv</strong> files are accepted. Duplicates aren't removed — rows are appended as new leads.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="upload-file-chip">
                <span className="quick-tile-icon" style={{ background: "var(--dash-green-soft)", color: "var(--dash-green)", width: 42, height: 42, borderRadius: 12 }}>
                  <FileSpreadsheet size={20} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="file-name">{file.name}</div>
                  <div className="file-meta">{(file.size / 1024).toFixed(1)} KB · ready to import</div>
                </div>
                <button
                  className="dash-btn dash-btn-ghost dash-btn-sm"
                  style={{ marginLeft: "auto" }}
                  onClick={() => { setFile(null); setResult(null); }}
                >
                  Remove
                </button>
              </div>
              <div className="import-row-limit">
                <label htmlFor="max-rows" style={{ fontWeight: 700, fontSize: 13 }}>
                  Max rows to import
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    id="max-rows"
                    type="number"
                    min="1"
                    placeholder="All rows"
                    value={maxRows}
                    onChange={(e) => setMaxRows(e.target.value)}
                    style={{ width: 160, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--dash-border, #d4d4d8)" }}
                  />
                  <span style={{ fontSize: 12, color: "var(--dash-muted)" }}>
                    {maxRows ? "Import only the first rows from the file." : "Leave empty to import the whole file."}
                  </span>
                </div>
              </div>
              
              <div className="import-row-limit">
                <label style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: "block" }}>
                  Row Range (for large files)
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={useRowRange}
                      onChange={(e) => setUseRowRange(e.target.checked)}
                    />
                    Enable range
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Start row"
                    value={startRow}
                    onChange={(e) => setStartRow(e.target.value)}
                    disabled={!useRowRange}
                    style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--dash-border, #d4d4d8)", fontSize: 12 }}
                  />
                  <span style={{ fontSize: 12 }}>to</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="End row (optional)"
                    value={endRow}
                    onChange={(e) => setEndRow(e.target.value)}
                    disabled={!useRowRange}
                    style={{ width: 120, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--dash-border, #d4d4d8)", fontSize: 12 }}
                  />
                  <span style={{ fontSize: 11, color: "var(--dash-muted)", marginLeft: 4 }}>
                    For files &gt;1M rows to avoid memory issues
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="dash-btn dash-btn-primary" onClick={handleImport} disabled={importing}>
                  {importing ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}
                  {importing ? "Reading CSV…" : "Continue to field mapping"}
                </button>
                <button className="dash-btn dash-btn-ghost" onClick={() => fileInputRef.current?.click()}>
                  Choose another file
                </button>
              </div>
            </div>
          )}
        </div>
      </div>}

      {canManage && result && (
        <div className="dash-card">
          <div className="dash-card-head">
            <h2>Import results</h2>
          </div>
          <div className="dash-card-body">
            <div className="result-row">
              <CheckCircle2 size={18} style={{ color: "var(--dash-green)" }} />
              <strong>Imported</strong>
              <span style={{ marginLeft: "auto" }}>{result.imported} rows</span>
            </div>
            <div className="result-row">
              <XCircle size={18} style={{ color: "var(--dash-danger)" }} />
              <strong>Skipped</strong>
              <span style={{ marginLeft: "auto" }}>{result.failed} rows</span>
            </div>
            {result.errors?.length > 0 && (
              <>
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "var(--dash-muted)" }}>Details:</div>
                <ul className="result-errors" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {result.errors.slice(0, 50).map((e, i) => (
                    <li key={i}>
                      <span className="dash-badge badge-gray" style={{ flex: "none" }}>Row {e.row}</span>
                      {e.error}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {canManage && recentJobs.length > 0 && (
        <div className="dash-card" style={{ marginTop: "20px" }}>
          <div className="dash-card-head">
            <h2>Recent imports</h2>
          </div>
          <div className="dash-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentJobs.map((j) => (
              <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, padding: "8px 10px", borderRadius: 10, background: "var(--dash-bg, #fafafa)", border: "1px solid var(--dash-border, #ececef)" }}>
                {j.status === "completed" && <CheckCircle2 size={15} style={{ color: "var(--dash-green)", flex: "none" }} />}
                {j.status === "failed" && <XCircle size={15} style={{ color: "var(--dash-danger)", flex: "none" }} />}
                {j.status === "cancelled" && <StopCircle size={15} style={{ color: "var(--dash-muted)", flex: "none" }} />}
                {["queued", "processing"].includes(j.status) && <Clock size={15} style={{ color: "var(--dash-muted)", flex: "none" }} />}
                <strong style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.filename || "CSV import"}</strong>
                <span className="dash-badge badge-gray">{JOB_STATUS_LABELS[j.status] || j.status}</span>
                <span style={{ color: "var(--dash-muted)" }}>
                  {(j.imported || 0).toLocaleString()} imported · {(j.skipped || 0).toLocaleString()} skipped · {(j.failed || 0).toLocaleString()} failed
                </span>
                <span style={{ marginLeft: "auto", color: "var(--dash-muted)", fontSize: 12 }}>{formatJobTime(j.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {canManage && <div className="dash-card" style={{ marginTop: "20px" }}>
        <div className="dash-card-head">
          <h2>CSV format</h2>
        </div>
        <div className="dash-card-body" style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--dash-muted)" }}>
          <p style={{ margin: "0 0 10px" }}>
            Only <strong style={{ color: "var(--dash-ink)" }}>full_name</strong> is required. All other columns are optional.
            Recognized columns:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["full_name", "headline", "about", "email", "linkedin_url", "twitter_url", "facebook_url", "website_url", "country", "country_code", "region", "city", "industry", "company_name", "job_title", "num_employees"].map((col) => (
              <code key={col} className="dash-badge badge-gray" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{col}</code>
            ))}
          </div>
          <p style={{ margin: "12px 0 0" }}>
            Tip: the <strong>country_code</strong> column (ISO alpha-2, e.g. <code>US</code>) makes geo-matching more reliable.
            Download the template above to see an example file.
          </p>
        </div>
      </div>}

      {/* CSV Field Mapping Modal */}
      {showMapping && csvData && (
        <CsvFieldMapping
          csvHeaders={csvData.headers}
          sampleData={csvData.sampleData}
          totalRows={csvData.totalRows}
          startRow={csvData.startRow}
          endRow={csvData.endRow}
          useRowRange={csvData.useRowRange}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
          submitting={importing}
          error={error}
        />
      )}
    </>
  );
}
