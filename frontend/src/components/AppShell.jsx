import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Target } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { initialsOf } from "../utils/format";

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.roles?.some((r) => ["admin", "super_admin"].includes(r));

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-brand">
            <span className="app-brand-badge"><Target size={16} /></span>
            free<span style={{ color: "#7c9a3f" }}>leads</span>
          </Link>

          <nav className="app-nav">
            <NavLink to="/app" end className={({ isActive }) => (isActive ? "active" : "")}>
              Directory
            </NavLink>
            {isAdmin && <NavLink to="/admin">Dashboard</NavLink>}
          </nav>

          <div className="app-header-right">
            <div className="app-header-user">
              <span className="dash-avatar" style={{ background: "linear-gradient(135deg,#3fae8a,#1d6f55)" }}>
                {initialsOf(user)}
              </span>
              <span className="who">
                <b>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User"}</b>
                <small>{user?.email}</small>
              </span>
            </div>
            <button onClick={handleLogout} className="dash-btn dash-btn-ghost dash-btn-sm" title="Log out">
              <LogOut size={15} />
              <span className="logout-label">Log out</span>
            </button>
            {isAdmin && (
              <Link to="/admin" className="dash-btn dash-btn-primary dash-btn-sm">
                <LayoutDashboard size={15} /> Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
