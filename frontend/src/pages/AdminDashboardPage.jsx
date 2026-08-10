import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api/client";

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("users");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", firstName: "", lastName: "", role: "user" });

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, []);

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

  const loadRoles = async () => {
    try {
      const data = await api.getRoles();
      setRoles(data.roles || []);
    } catch (err) {
      console.error("Failed to load roles:", err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.createUser(newUser);
      setShowCreateUser(false);
      setNewUser({ email: "", password: "", firstName: "", lastName: "", role: "user" });
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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

  const handleToggleActive = async (userId, isActive) => {
    try {
      await api.toggleUserActive(userId, !isActive);
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case "super_admin": return "#dc3545";
      case "admin": return "#fd7e14";
      case "editor": return "#0d6efd";
      default: return "#28a745";
    }
  };

  return (
    <div className="admin-container" style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", paddingBottom: "20px", borderBottom: "2px solid #eee" }}>
        <div>
          <h1>🔧 Admin Dashboard</h1>
          <div style={{ display: "flex", gap: "20px", alignItems: "center", marginTop: "10px" }}>
            <span style={{ background: "#007bff", color: "white", padding: "4px 12px", borderRadius: "12px", fontSize: "14px" }}>
              {user?.firstName} {user?.lastName}
            </span>
            <span style={{ background: "#dc3545", color: "white", padding: "4px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold" }}>
              {user?.roles?.map(r => r.replace("_", " ").toUpperCase()).join(", ")}
            </span>
          </div>
        </div>
        <button onClick={logout} className="auth-submit-btn" style={{ maxWidth: 150 }}>
          Log out
        </button>
      </header>

      {error && (
        <div style={{ background: "#f8d7da", color: "#721c24", padding: "12px", borderRadius: "4px", marginBottom: "20px" }}>
          Error: {error}
        </div>
      )}

      <nav style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => setActiveTab("users")}
          style={{
            padding: "10px 20px",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            background: activeTab === "users" ? "#007bff" : "#e9ecef",
            color: activeTab === "users" ? "white" : "#333",
            fontWeight: activeTab === "users" ? "bold" : "normal"
          }}
        >
          👥 User Management
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          style={{
            padding: "10px 20px",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            background: activeTab === "roles" ? "#007bff" : "#e9ecef",
            color: activeTab === "roles" ? "white" : "#333",
            fontWeight: activeTab === "roles" ? "bold" : "normal"
          }}
        >
          🔐 Roles & Permissions
        </button>
      </nav>

      {activeTab === "users" && (
        <section className="users-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2>Users ({users.length})</h2>
            <button 
              onClick={() => setShowCreateUser(true)}
              className="auth-submit-btn"
              style={{ maxWidth: 200, background: "#28a745" }}
            >
              + Create User
            </button>
          </div>

          {showCreateUser && (
            <div style={{ background: "#f8f9fa", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
              <h3>Create New User</h3>
              <form onSubmit={handleCreateUser} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                <input
                  type="email"
                  placeholder="Email *"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  required
                  style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}
                />
                <input
                  type="password"
                  placeholder="Password *"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                  style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}
                />
                <input
                  type="text"
                  placeholder="First Name"
                  value={newUser.firstName}
                  onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                  style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={newUser.lastName}
                  onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                  style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}
                />
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}
                >
                  <option value="user">User</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button type="submit" className="auth-submit-btn" disabled={loading} style={{ maxWidth: 150 }}>
                    {loading ? "Creating..." : "Create"}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setShowCreateUser(false)}
                    className="auth-submit-btn"
                    style={{ maxWidth: 150, background: "#6c757d" }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>Loading users...</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: "8px", overflow: "hidden" }}>
              <thead style={{ background: "#f8f9fa" }}>
                <tr>
                  <th style={{ padding: "12px", textAlign: "left" }}>User</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Email</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Roles</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Status</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Created</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "12px" }}>
                      <strong>{u.first_name} {u.last_name}</strong>
                      <div style={{ fontSize: "12px", color: "#666" }}>ID: {u.id.slice(0, 8)}...</div>
                    </td>
                    <td style={{ padding: "12px" }}>{u.email}</td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {(u.roles || []).map((role) => (
                          <span 
                            key={role}
                            style={{ 
                              background: getRoleBadgeColor(role),
                              color: "white",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "11px",
                              cursor: "pointer"
                            }}
                            onClick={() => handleRemoveRole(u.id, role)}
                            title="Click to remove"
                          >
                            {role.replace("_", " ").toUpperCase()} ×
                          </span>
                        ))}
                        <select
                          onChange={(e) => e.target.value && handleUpdateRole(u.id, e.target.value)}
                          value=""
                          style={{ 
                            padding: "2px 5px", 
                            fontSize: "11px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                            cursor: "pointer"
                          }}
                        >
                          <option value="">+ Add Role</option>
                          {roles.filter(r => !u.roles?.includes(r.name)).map((r) => (
                            <option key={r.id} value={r.name}>{r.name.replace("_", " ")}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ 
                        color: u.is_active ? "#28a745" : "#dc3545",
                        fontWeight: "bold"
                      }}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                      {u.is_email_verified ? (
                        <span style={{ color: "#28a745", marginLeft: "8px" }}>✓ Verified</span>
                      ) : (
                        <span style={{ color: "#ffc107", marginLeft: "8px" }}>✗ Not Verified</span>
                      )}
                    </td>
                    <td style={{ padding: "12px", fontSize: "13px", color: "#666" }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {u.id !== user.id && (
                        <button
                          onClick={() => handleToggleActive(u.id, u.is_active)}
                          className="auth-submit-btn"
                          style={{ 
                            maxWidth: 100, 
                            padding: "5px 10px",
                            fontSize: "12px",
                            background: u.is_active ? "#dc3545" : "#28a745"
                          }}
                        >
                          {u.is_active ? "Deactivate" : "Activate"}
                        </button>
                      )}
                      {u.id === user.id && (
                        <span style={{ color: "#999", fontSize: "12px" }}>Current User</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {activeTab === "roles" && (
        <section className="roles-section">
          <h2>Roles & Permissions</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px", marginTop: "20px" }}>
            {roles.map((role) => (
              <div key={role.id} style={{ background: "white", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <h3 style={{ 
                  color: "white",
                  background: getRoleBadgeColor(role.name),
                  padding: "10px",
                  borderRadius: "4px",
                  marginBottom: "15px"
                }}>
                  {role.name.replace("_", " ").toUpperCase()}
                </h3>
                <div style={{ fontSize: "13px" }}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Permissions:</strong>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {(role.permissions || []).map((perm) => (
                      <li key={perm} style={{ padding: "4px 0", borderBottom: "1px solid #eee" }}>
                        <span style={{ color: "#28a745" }}>✓</span> {perm}
                      </li>
                    ))}
                    {(!role.permissions || role.permissions.length === 0) && (
                      <li style={{ color: "#999" }}>No permissions</li>
                    )}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
