import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, ShieldAlert, UploadCloud, XCircle } from "lucide-react";
import * as api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import CsvFieldMapping from "../../components/CsvFieldMapping";

const CSV_TEMPLATE = [
  "full_name,headline,about,email,linkedin_url,twitter_url,facebook_url,website_url,country,country_code,region,city,industry,company_name,job_title",
  "John Doe,Software Engineer,Experienced dev,john.doe@example.com,https://linkedin.com/in/johndoe,,,,United States,US,California,San Francisco,Software,Tech Corp,Senior Developer",
  "Jane Smith,Marketing Specialist,SEO expert,jane.smith@example.com,,,,,United Kingdom,GB,Greater London,London,Marketing,Ad Agency,Account Manager",
  "Bob Brown,Sales Lead,Top closer,bob.brown@example.com,,,,https://bobbrown.com,Canada,CA,Ontario,Toronto,Sales,Sales Force,Sales Director",
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
function buildCsvChunks(header, dataRows, chunkSize) {
  const chunks = [];
  for (let i = 0; i < dataRows.length; i += chunkSize) {
    chunks.push([header, ...dataRows.slice(i, i + chunkSize)].join("\n") + "\n");
  }
  return chunks;
}

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
  // Live import progress: { processed, total, imported, skipped, failed, remaining }
  const [importProgress, setImportProgress] = useState(null);

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
    setImportProgress({ processed: 0, total: 0, imported: 0, skipped: 0, failed: 0, remaining: 0 });

    const CHUNK_SIZE = 2000;
    let accumulated = { imported: 0, skipped: 0, failed: 0, errors: [] };

    try {
      // Read the whole file once so we can count rows and import in windows,
      // reporting live progress ("X uploaded, Y remaining") as we go.
      const fullText = await file.text();
      const records = splitCsvRecords(fullText);
      if (records.length === 0) throw new Error("The CSV file has no rows to import.");

      const header = records[0];
      let dataRows = records.slice(1);
      if (parsedLimit && dataRows.length > parsedLimit) {
        dataRows = dataRows.slice(0, parsedLimit);
      }
      const total = dataRows.length;
      setImportProgress((p) => ({ ...p, total }));

      const chunks = buildCsvChunks(header, dataRows, CHUNK_SIZE);

      for (let i = 0; i < chunks.length; i++) {
        const res = await api.importLeadsCsv(chunks[i], "csv_upload", { fieldMapping: mapping });
        const d = res?.data || {};
        accumulated.imported += d.imported || 0;
        accumulated.skipped += d.skipped || 0;
        accumulated.failed += d.failed || 0;
        if (Array.isArray(d.errors)) accumulated.errors = accumulated.errors.concat(d.errors);

        const processed = Math.min((i + 1) * CHUNK_SIZE, total);
        setImportProgress({
          processed,
          total,
          imported: accumulated.imported,
          skipped: accumulated.skipped,
          failed: accumulated.failed,
          remaining: total - processed,
        });
      }

      setResult({
        imported: accumulated.imported,
        skipped: accumulated.skipped,
        failed: accumulated.failed,
        total,
        errors: accumulated.errors,
      });
      setShowMapping(false);
      setCsvData(null);
    } catch (err) {
      setError(err.message || "Import failed.");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
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
            {["full_name", "headline", "about", "email", "linkedin_url", "twitter_url", "facebook_url", "website_url", "country", "country_code", "region", "city", "industry", "company_name", "job_title"].map((col) => (
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
          progress={importProgress}
        />
      )}
    </>
  );
}
