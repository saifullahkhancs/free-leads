import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Factory, FolderTree, Globe2, Loader2, Pencil, Search, Trash2, X } from "lucide-react";
import * as api from "../../api/client";

const CONFIG = {
  country: { label: "Countries", singular: "country", icon: Globe2, key: (x) => x.id },
  industry: { label: "Industries", singular: "industry", icon: Factory, key: (x) => x.name },
  category: { label: "Categories", singular: "category", icon: FolderTree, key: (x) => x.name },
};

export default function LeadManagementPage() {
  const [data, setData] = useState(null);
  const [active, setActive] = useState("country");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState(null);
  const [name, setName] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortControllerRef = useRef(null);

  const load = (signal) => {
    setError("");
    return api
      .getLeadDimensions(signal)
      .then((res) => {
        if (!signal?.aborted) setData(res.data);
      })
      .catch((err) => {
        if (err?.name === "AbortError" || signal?.aborted) return;
        setError(err.message);
      });
  };

  useEffect(() => {
    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    load(controller.signal);
    // Cleanup: abort the request if the component unmounts or effect re-runs
    return () => controller.abort();
  }, []);

  const list = data?.[active === "country" ? "countries" : `${active}s`] || [];
  const filtered = useMemo(() => list.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [list, query]);
  const openAction = (mode, item) => { setAction({ mode, item }); setName(item.name); setConfirmation(""); setError(""); };
  const close = () => { if (!busy) setAction(null); };

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const key = CONFIG[active].key(action.item);
      if (action.mode === "rename") await api.renameLeadDimension(active, key, name.trim());
      else await api.deleteLeadDimension(active, key);
      setAction(null);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (!data && !error) return <div className="dash-loader"><Loader2 className="spin" /> Loading lead data…</div>;
  const summary = data?.summary || {};

  return <>
    <div className="dash-page-head"><div><h1>Lead data management</h1><p>Keep countries, industries and categories consistent across your directory.</p></div></div>
    {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}
    <div className="dimension-stats">
      {[['leads', 'Total leads', Database], ['countries', 'Countries', Globe2], ['industries', 'Industries', Factory], ['categories', 'Categories', FolderTree]].map(([key, label, Icon]) =>
        <div className="dimension-stat" key={key}><span><Icon size={19} /></span><div><b>{Number(summary[key] || 0).toLocaleString()}</b><small>{label}</small></div></div>)}
    </div>
    <div className="dash-card dimension-card">
      <div className="dimension-tabs">
        {Object.entries(CONFIG).map(([key, cfg]) => <button key={key} className={active === key ? "active" : ""} onClick={() => { setActive(key); setQuery(""); }}><cfg.icon size={16} /> {cfg.label}<span>{summary[`${key === 'country' ? 'countries' : `${key}s`}`] || 0}</span></button>)}
      </div>
      <div className="dimension-toolbar">
        <div><h2>{CONFIG[active].label}</h2><p>Rename a value everywhere, or remove it together with its related leads.</p></div>
        <label className="dimension-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${CONFIG[active].label.toLowerCase()}…`} /></label>
      </div>
      <div className="dash-table-wrap"><table className="dash-table dimension-table">
        <thead><tr><th>Name</th>{active === "country" && <th>Code</th>}<th>Related leads</th><th className="align-right">Actions</th></tr></thead>
        <tbody>{filtered.map((item) => <tr key={CONFIG[active].key(item)}>
          <td><b>{item.name}</b></td>{active === "country" && <td><span className="dash-badge badge-gray">{item.code}</span></td>}
          <td>{Number(item.lead_count).toLocaleString()}</td>
          <td><div className="dimension-actions"><button className="dash-btn dash-btn-sm" onClick={() => openAction("rename", item)}><Pencil size={13} /> Rename</button><button className="dash-btn dash-btn-sm dash-btn-danger" onClick={() => openAction("delete", item)}><Trash2 size={13} /> Remove</button></div></td>
        </tr>)}</tbody>
      </table>{!filtered.length && <div className="empty-state"><h3>No matching {CONFIG[active].label.toLowerCase()}</h3><p>Try a different search.</p></div>}</div>
    </div>

    {action && <div className="modal-overlay dimension-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dash-card dimension-modal" role="dialog" aria-modal="true">
        <button className="dimension-modal-close" onClick={close} aria-label="Close"><X size={18} /></button>
        <div className={`dimension-modal-icon ${action.mode}`} >{action.mode === "rename" ? <Pencil /> : <Trash2 />}</div>
        <h2>{action.mode === "rename" ? `Rename ${CONFIG[active].singular}` : `Remove ${CONFIG[active].singular}?`}</h2>
        {action.mode === "rename" ? <>
          <p>This updates <b>{action.item.name}</b> in all {Number(action.item.lead_count).toLocaleString()} related lead records.</p>
          <div className="form-field"><label>New name <span>*</span></label><input className="dash-input" autoFocus value={name} maxLength={150} onChange={(e) => setName(e.target.value)} /></div>
        </> : <>
          <div className="dimension-danger-note"><b>This cannot be undone.</b><span>Removing <b>{action.item.name}</b> will permanently delete all <b>{Number(action.item.lead_count).toLocaleString()} related leads</b>{active === "country" ? ", states and cities" : ""}.</span></div>
          <div className="form-field"><label>Type <b>DELETE</b> to confirm</label><input className="dash-input" autoFocus value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="DELETE" /></div>
        </>}
        <div className="dimension-modal-actions"><button className="dash-btn" onClick={close} disabled={busy}>Cancel</button><button className={`dash-btn ${action.mode === "delete" ? "dash-btn-danger" : "dash-btn-primary"}`} disabled={busy || (action.mode === "rename" ? !name.trim() || name.trim() === action.item.name : confirmation !== "DELETE")} onClick={submit}>{busy && <Loader2 className="spin" size={15} />}{action.mode === "rename" ? "Update everywhere" : `Delete ${action.item.lead_count} leads`}</button></div>
      </div>
    </div>}
  </>;
}
