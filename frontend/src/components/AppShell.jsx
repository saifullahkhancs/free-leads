import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bookmark,
  Compass,
  FileText,
  Globe2,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Sparkles,
  Target,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { initialsOf } from "../utils/format";
import { getSavedLeads } from "../utils/savedLeads";

export default function AppShell() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const menuRef = useRef(null);

  const isAdmin = user?.roles?.some((r) => ["admin", "super_admin", "editor"].includes(r));

  // Update saved count on interval or storage events
  useEffect(() => {
    const updateCount = () => {
      setSavedCount(getSavedLeads().length);
    };
    updateCount();
    window.addEventListener("storage", updateCount);
    const interval = setInterval(updateCount, 1500);
    return () => {
      window.removeEventListener("storage", updateCount);
      clearInterval(interval);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const roleText =
    user?.roles?.some((r) => r === "super_admin") ? "Super Admin" :
    user?.roles?.some((r) => r === "admin") ? "Admin" :
    user?.roles?.some((r) => r === "editor") ? "Editor" : "Member";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-brand">
            <span className="app-brand-badge"><Target size={18} /></span>
            <span>free<span style={{ color: "#7c9a3f" }}>leads</span></span>
          </Link>

          <nav className="app-nav">
            <NavLink
              to="/app"
              end
              className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
            >
              <Compass size={16} />
              <span>Search Leads</span>
            </NavLink>
            <NavLink
              to="/app/plans"
              className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
            >
              <Sparkles size={16} />
              <span>Pricing &amp; Plans</span>
            </NavLink>
            <NavLink
              to="/app/blog"
              className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
            >
              <FileText size={16} />
              <span>Blog</span>
            </NavLink>
            <NavLink
              to="/app/contact"
              className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
            >
              <Mail size={16} />
              <span>Contact Us</span>
            </NavLink>
          </nav>

          <div className="app-header-right">
            {isAuthenticated ? (
              <>
                {isAdmin && (
                  <Link to="/admin" className="app-header-btn app-header-btn-primary">
                    <LayoutDashboard size={15} />
                    <span>Dashboard</span>
                  </Link>
                )}

                <div className="app-user-wrapper" ref={menuRef}>
                  <div
                    className="app-user-pill"
                    onClick={() => setMenuOpen((prev) => !prev)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="app-user-avatar">
                      {initialsOf(user)}
                      <span className="app-user-avatar-dot" />
                    </div>
                    <div className="app-user-info">
                      <span className="app-user-name">
                        {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User"}
                      </span>
                      <span className="app-user-role">{roleText}</span>
                    </div>
                  </div>

                  {menuOpen && (
                    <div className="app-user-dropdown">
                      <div className="app-dropdown-header">
                        <strong>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User"}</strong>
                        <small>{user?.email}</small>
                      </div>

                      <Link
                        to="/app"
                        className="app-dropdown-item"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Compass size={15} />
                        <span>Search Leads</span>
                      </Link>

                      <Link
                        to="/app/profile"
                        className="app-dropdown-item"
                        onClick={() => setMenuOpen(false)}
                      >
                        <User size={15} />
                        <span>My Profile</span>
                      </Link>

                      <Link
                        to="/app/billing"
                        className="app-dropdown-item"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Sparkles size={15} />
                        <span>My Plan & Usage</span>
                      </Link>

                      {isAdmin && (
                        <Link
                          to="/admin"
                          className="app-dropdown-item"
                          onClick={() => setMenuOpen(false)}
                        >
                          <LayoutDashboard size={15} />
                          <span>Admin Dashboard</span>
                        </Link>
                      )}

                      <Link
                        to="/"
                        className="app-dropdown-item"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Globe2 size={15} />
                        <span>Landing Page</span>
                      </Link>

                      <div style={{ height: 1, background: "var(--app-border-subtle)", margin: "4px 0" }} />

                      <button
                        type="button"
                        onClick={handleLogout}
                        className="app-dropdown-item danger"
                      >
                        <LogOut size={15} />
                        <span>Log Out</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="app-header-btn">
                  <LogIn size={15} />
                  <span>Log in</span>
                </Link>
                <Link to="/signup" className="app-header-btn app-header-btn-primary">
                  <UserPlus size={15} />
                  <span>Sign up</span>
                </Link>
              </>
            )}

            <button
              className="app-mobile-menu-btn"
              onClick={() => setMobileDrawerOpen((prev) => !prev)}
              aria-label="Toggle menu"
            >
              {mobileDrawerOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileDrawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(14,25,20,0.6)",
            backdropFilter: "blur(6px)",
            zIndex: 90,
          }}
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            style={{
              position: "absolute",
              top: 68,
              left: 0,
              right: 0,
              background: "#fff",
              borderBottom: "1px solid var(--app-border)",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              boxShadow: "var(--app-shadow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isAuthenticated ? (
              <>
                <div style={{ padding: "0 0 10px", borderBottom: "1px solid var(--app-border)" }}>
                  <b>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User"}</b>
                  <div style={{ fontSize: "12px", color: "var(--app-ink-muted)" }}>{user?.email}</div>
                </div>

                <Link
                  to="/app"
                  className="app-header-btn"
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  <Compass size={16} /> Search Leads
                </Link>

                <Link
                  to="/app/profile"
                  className="app-header-btn"
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  <User size={16} /> My Profile
                </Link>

                <Link
                  to="/app/billing"
                  className="app-header-btn"
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  <Sparkles size={16} /> My Plan & Usage
                </Link>

                {isAdmin && (
                  <Link
                    to="/admin"
                    className="app-header-btn app-header-btn-primary"
                    onClick={() => setMobileDrawerOpen(false)}
                  >
                    <LayoutDashboard size={16} /> Admin Dashboard
                  </Link>
                )}

                <button
                  onClick={handleLogout}
                  className="app-header-btn"
                  style={{ color: "#dc2626" }}
                >
                  <LogOut size={16} /> Log Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="app-header-btn"
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  <LogIn size={16} /> Log in
                </Link>
                <Link
                  to="/signup"
                  className="app-header-btn app-header-btn-primary"
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  <UserPlus size={16} /> Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      <main className="app-main-container">
        <Outlet />
      </main>
    </div>
  );
}
