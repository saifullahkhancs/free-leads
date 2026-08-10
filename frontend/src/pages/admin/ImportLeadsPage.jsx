import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, ShieldAlert, UploadCloud, XCircle } from "lucide-react";
import * as api from "../../api/client";
import { useAuth } from "../../context/AuthContext";

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

export default function ImportLeadsPage() {
  const { user } = useAuth();
  const canManage = user?.roles?.some((r) => ["admin", "super_admin", "editor"].includes(r));
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

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
      const text = await file.text();
      const res = await api.importLeadsCsv(text, "csv_upload");
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
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
              <div style={{ display: "flex", gap: 10 }}>
                <button className="dash-btn dash-btn-primary" onClick={handleImport} disabled={importing}>
                  {importing ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}
                  {importing ? "Importing…" : `Import ${file.name}`}
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
    </>
  );
}
