import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, UserPlus, Users as UsersIcon } from "lucide-react";
import * as api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { formatDate, initialsOf } from "../../utils/format";

const ROLE_COLORS = {
  super_admin: { bg: "rgba(255, 107, 107, 0.15)", fg: "#ff6b6b" },
  admin: { bg: "rgba(255, 209, 102, 0.15)", fg: "#ffd166" },
  editor: { bg: "rgba(37, 99, 235, 0.15)", fg: "#2563EB" },
  user: { bg: "rgba(16, 185, 129, 0.12)", fg: "#059669" },
};

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", firstName: "", lastName: "", role: "user" });

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAllUsers();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    api.getRoles().then((res) => setRoles(res.roles || [])).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createUser(newUser);
      setShowCreate(false);
      setNewUser({ email: "", password: "", firstName: "", lastName: "", role: "user" });
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async (userId, role) => {
    try {
      await api.updateUserRole(userId, role, "assign");
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveRole = async (userId, role) => {
    try {
      await api.updateUserRole(userId, role, "remove");
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await api.toggleUserActive(u.id, !u.is_active);
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="dash-page-head">
        <div>
          <h1>Users</h1>
          <p>Manage accounts, assign roles and control access to the platform.</p>
        </div>
        <div className="dash-page-actions">
          <button className="dash-btn dash-btn-primary" onClick={() => setShowCreate(true)}>
            <UserPlus size={16} /> Create User
          </button>
        </div>
      </div>

      {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

      {showCreate && (
        <div className="dash-card" style={{ marginBottom: "20px" }}>
          <div className="dash-card-head">
            <h2>Create new user</h2>
          </div>
          <form className="dash-card-body dash-form" onSubmit={handleCreate}>
            <div className="form-grid">
              <div className="form-field">
                <label>Email <span>*</span></label>
                <input className="dash-input" type="email" required placeholder="person@company.com" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Password <span>*</span></label>
                <input className="dash-input" type="password" required placeholder="••••••••" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              </div>
              <div className="form-field">
                <label>First name</label>
                <input className="dash-input" type="text" placeholder="Jane" value={newUser.firstName} onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Last name</label>
                <input className="dash-input" type="text" placeholder="Smith" value={newUser.lastName} onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Role</label>
                <select className="dash-select" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  <option value="user">User</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="dash-btn dash-btn-primary" disabled={creating}>
                {creating ? <Loader2 className="spin" size={16} /> : <UserPlus size={16} />}
                {creating ? "Creating…" : "Create user"}
              </button>
              <button type="button" className="dash-btn dash-btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="dash-card">
        {loading ? (
          <div className="dash-loader"><Loader2 className="spin" size={28} /> Loading users…</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.id === user.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="lead-cell">
                          <span className="dash-avatar">{initialsOf(u)}</span>
                          <div>
                            <b>{u.first_name} {u.last_name}{isMe && <span className="dash-badge badge-blue" style={{ marginLeft: 6 }}>You</span>}</b>
                            <small>ID: {String(u.id).slice(0, 8)}…</small>
                          </div>
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                          {(u.roles || []).map((role) => {
                            const c = ROLE_COLORS[role] || ROLE_COLORS.user;
                            return (
                              <span
                                key={role}
                                className="dash-badge"
                                style={{ background: c.bg, color: c.fg, cursor: "pointer" }}
                                title="Click to remove role"
                                onClick={() => handleRemoveRole(u.id, role)}
                              >
                                {role.replace("_", " ").toUpperCase()} ×
                              </span>
                            );
                          })}
                          <select
                            className="dash-select"
                            value=""
                            onChange={(e) => e.target.value && handleUpdateRole(u.id, e.target.value)}
                            style={{ width: "auto", padding: "5px 28px 5px 10px", fontSize: 11.5, minWidth: 0 }}
                          >
                            <option value="">+ Add role</option>
                            {roles.filter((r) => !u.roles?.includes(r.name)).map((r) => (
                              <option key={r.id} value={r.name}>{r.name.replace("_", " ")}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span className={`dash-badge ${u.is_active ? "badge-green" : "badge-red"}`} style={{ width: "fit-content" }}>
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                          <span className={`dash-badge ${u.is_email_verified ? "badge-lime" : "badge-orange"}`} style={{ width: "fit-content" }}>
                            {u.is_email_verified ? "✓ Verified" : "Not verified"}
                          </span>
                        </div>
                      </td>
                      <td className="muted">{formatDate(u.created_at)}</td>
                      <td>
                        {!isMe && (
                          <button
                            className={`dash-btn dash-btn-sm ${u.is_active ? "dash-btn-danger" : ""}`}
                            onClick={() => handleToggleActive(u)}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && users.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon"><UsersIcon size={24} /></div>
                <h3>No users yet</h3>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
