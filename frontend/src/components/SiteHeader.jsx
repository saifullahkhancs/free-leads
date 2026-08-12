import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Compass,
  FileText,
  Globe2,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Sparkles,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { initialsOf } from "../utils/format";

export const NAV_ITEMS = [
  { to: "/app", label: "Home", icon: Globe2, end: true },
  { to: "/app/search", label: "Search Leads", icon: Compass },
  { to: "/app/plans", label: "Pricing & Plans", icon: Sparkles },
  { to: "/app/blog", label: "Blog", icon: FileText },
  { to: "/app/contact", label: "Contact Us", icon: Mail },
];

export default function SiteHeader() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef(null);

  const isAdmin = user?.roles?.some((r) => ["admin", "super_admin"].includes(r));

  const roleText =
    user?.roles?.some((r) => r === "super_admin") ? "Super Admin" :
    user?.roles?.some((r) => r === "admin") ? "Admin" :
    user?.roles?.some((r) => r === "editor") ? "Editor" : "Member";

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";

  useEffect(() => {
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/app" className="site-brand">
          <span className="site-brand-dot" aria-hidden="true" />
          <span className="site-brand-name">FreeLeads</span>
        </Link>

        <nav className="site-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `site-nav-link${isActive ? " is-active" : ""}`}
            >
              <item.icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="site-header-actions">
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <Link to="/admin" className="site-btn site-btn-primary site-btn-dashboard">
                  <LayoutDashboard size={15} aria-hidden="true" />
                  <span>Dashboard</span>
                </Link>
              )}

              <div className="site-user" ref={menuRef}>
                <button
                  type="button"
                  className="site-user-pill"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <span className="site-user-avatar">
                    {initialsOf(user)}
                    <span className="site-user-dot" />
                  </span>
                  <span className="site-user-meta">
                    <span className="site-user-name">{fullName}</span>
                    <span className="site-user-role">{roleText}</span>
                  </span>
                </button>

                {menuOpen && (
                  <div className="site-dropdown" role="menu">
                    <div className="site-dropdown-head">
                      <strong>{fullName}</strong>
                      <small>{user?.email}</small>
                    </div>

                    <Link to="/app" className="site-dropdown-item" role="menuitem">
                      <Compass size={15} aria-hidden="true" />
                      <span>Search Leads</span>
                    </Link>
                    <Link to="/app/profile" className="site-dropdown-item" role="menuitem">
                      <User size={15} aria-hidden="true" />
                      <span>My Profile</span>
                    </Link>
                    <Link to="/app/billing" className="site-dropdown-item" role="menuitem">
                      <Sparkles size={15} aria-hidden="true" />
                      <span>My Plan &amp; Usage</span>
                    </Link>
                    {isAdmin && (
                      <Link to="/admin" className="site-dropdown-item" role="menuitem">
                        <LayoutDashboard size={15} aria-hidden="true" />
                        <span>Admin Dashboard</span>
                      </Link>
                    )}
                    <Link to="/" className="site-dropdown-item" role="menuitem">
                      <Globe2 size={15} aria-hidden="true" />
                      <span>Landing Page</span>
                    </Link>

                    <div className="site-dropdown-sep" />

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="site-dropdown-item is-danger"
                      role="menuitem"
                    >
                      <LogOut size={15} aria-hidden="true" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="site-btn site-btn-login">
                <LogIn size={15} aria-hidden="true" />
                <span>Log in</span>
              </Link>
              <Link to="/signup" className="site-btn site-btn-primary">
                <UserPlus size={15} aria-hidden="true" />
                <span>Start free</span>
              </Link>
            </>
          )}

          <button
            type="button"
            className="site-burger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="site-drawer-backdrop" onClick={() => setMobileOpen(false)}>
          <div className="site-drawer" onClick={(e) => e.stopPropagation()}>
            {isAuthenticated && (
              <div className="site-drawer-user">
                <span className="site-user-avatar">{initialsOf(user)}</span>
                <span>
                  <strong>{fullName}</strong>
                  <small>{user?.email}</small>
                </span>
              </div>
            )}

            <nav className="site-drawer-nav" aria-label="Mobile navigation">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `site-drawer-link${isActive ? " is-active" : ""}`}
                >
                  <item.icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="site-drawer-sep" />

            {isAuthenticated ? (
              <>
                <Link to="/app/profile" className="site-drawer-link">
                  <User size={17} aria-hidden="true" />
                  <span>My Profile</span>
                </Link>
                <Link to="/app/billing" className="site-drawer-link">
                  <Sparkles size={17} aria-hidden="true" />
                  <span>My Plan &amp; Usage</span>
                </Link>
                {isAdmin && (
                  <Link to="/admin" className="site-drawer-link">
                    <LayoutDashboard size={17} aria-hidden="true" />
                    <span>Admin Dashboard</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="site-drawer-link is-danger"
                >
                  <LogOut size={17} aria-hidden="true" />
                  <span>Log Out</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="site-drawer-link">
                  <LogIn size={17} aria-hidden="true" />
                  <span>Log in</span>
                </Link>
                <Link to="/signup" className="site-drawer-link is-primary">
                  <UserPlus size={17} aria-hidden="true" />
                  <span>Start free</span>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
