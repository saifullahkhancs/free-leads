import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import * as api from "../../api/client";

const ROLE_COLORS = {
  super_admin: { bg: "rgba(255, 107, 107, 0.15)", fg: "#ff6b6b" },
  admin: { bg: "rgba(255, 209, 102, 0.15)", fg: "#ffd166" },
  editor: { bg: "rgba(37, 99, 235, 0.15)", fg: "#2563EB" },
  user: { bg: "rgba(16, 185, 129, 0.12)", fg: "#059669" },
};

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getRoles()
      .then((res) => setRoles(res.roles || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="dash-page-head">
        <div>
          <h1>Roles & Permissions</h1>
          <p>Roles are the foundation of access control — every permission check is enforced server-side.</p>
        </div>
      </div>

      {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

      {loading ? (
        <div className="dash-loader"><Loader2 className="spin" size={28} /> Loading roles…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 16 }}>
          {roles.map((role) => {
            const c = ROLE_COLORS[role.name] || ROLE_COLORS.user;
            return (
              <div className="dash-card" key={role.id}>
                <div className="dash-card-head">
                  <h2 style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span className="dash-badge" style={{ background: c.bg, color: c.fg, fontSize: 12, padding: "5px 12px" }}>
                      <ShieldCheck size={13} /> {role.name.replace("_", " ").toUpperCase()}
                    </span>
                  </h2>
                </div>
                <div className="dash-card-body">
                  <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: .6, color: "var(--dash-faint)", marginBottom: 10 }}>
                    Permissions
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {(role.permissions || []).map((perm) => (
                      <li key={perm} style={{ padding: "8px 0", borderBottom: "1px solid var(--dash-line)", fontSize: 13, display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ color: "#1f7a3d", fontWeight: 800 }}>✓</span> {perm}
                      </li>
                    ))}
                    {(!role.permissions || role.permissions.length === 0) && (
                      <li style={{ color: "var(--dash-faint)", fontSize: 13 }}>No permissions assigned</li>
                    )}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
