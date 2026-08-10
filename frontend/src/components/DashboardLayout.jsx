import { useEffect, useState } from "react";
import { NavLink, Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Database,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  ShieldCheck,
  Target,
  UploadCloud,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const PAGE_TITLES = {
  "/admin": { title: "Dashboard", subtitle: "Workspace overview" },
  "/admin/leads": { title: "Leads", subtitle: "Browse and manage your lead database" },
  "/admin/add-lead": { title: "Add Lead", subtitle: "Create a single lead manually" },
  "/admin/import": { title: "Import CSV", subtitle: "Bulk upload leads from a CSV file" },
  "/admin/users": { title: "Users", subtitle: "Manage accounts and roles" },
  "/admin/roles": { title: "Roles & Permissions", subtitle: "Control what each role can do" },
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = user?.roles?.some((r) => ["admin", "super_admin"].includes(r));
  const canManage = user?.roles?.some((r) => ["admin", "super_admin", "editor"].includes(r));

  // Close the drawer whenever the route changes (e.g. after tapping a nav item).
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const initials =
    [user?.firstName, user?.lastName].filter(Boolean).map((n) => n?.[0]?.toUpperCase()).join("") ||
    (user?.email?.[0]?.toUpperCase() || "U");

  const roleBadge =
    user?.roles?.some((r) => r === "super_admin") ? "Super Admin" :
    user?.roles?.some((r) => r === "admin") ? "Admin" :
    user?.roles?.some((r) => r === "editor") ? "Editor" : "Member";

  const pageMeta = PAGE_TITLES[location.pathname] || { title: "Dashboard", subtitle: "" };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const navSections = [
    {
      label: "Manage",
      items: [
        { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
        { to: "/admin/leads", label: "Leads", icon: Database },
        ...(canManage
          ? [
              { to: "/admin/add-lead", label: "Add Lead", icon: PlusCircle },
              { to: "/admin/import", label: "Import CSV", icon: UploadCloud },
            ]
          : []),
      ],
    },
    ...(isAdmin
      ? [
          {
            label: "Administration",
            items: [
              { to: "/admin/users", label: "Users", icon: Users },
              { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck },
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="dash">
      <aside className={`dash-sidebar${sidebarOpen ? " open" : ""}`}>
        <Link to="/admin" className="dash-brand">
          <span className="dash-brand-badge"><Target size={18} /></span>
          <span>
            <span className="dash-brand-name">free<span>leads</span></span>
            <span className="dash-brand-tag">Dashboard</span>
          </span>
        </Link>

        <div className="dash-sidebar-scroll">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="dash-nav-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `dash-nav-item${isActive ? " active" : ""}`}
                >
                  <item.icon size={17} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        <div className="dash-sidebar-footer">
          <div className="dash-user-card">
            <span className="dash-avatar">{initials}</span>
            <div className="dash-user-meta">
              <strong>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User"}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
          <div className="dash-user-actions">
            <Link to="/" className="dash-btn dash-btn-sm">View site</Link>
            <Link to="/app" className="dash-btn dash-btn-sm">Open app</Link>
            <button onClick={handleLogout} className="dash-btn dash-btn-sm dash-btn-danger" title="Log out">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <div
        className={`dash-overlay${sidebarOpen ? " show" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div className="dash-main">
        <header className="dash-topbar">
          <button className="dash-burger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={19} />
          </button>
          <div className="dash-topbar-title">
            {pageMeta.title}
            <small>{pageMeta.subtitle}</small>
          </div>
          <div className="dash-topbar-right">
            <div className="dash-topbar-user">
              <span className="dash-avatar">{initials}</span>
              <span>
                <b>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User"}</b>
                <small>{user?.email}</small>
              </span>
            </div>
            <button onClick={handleLogout} className="dash-btn dash-btn-ghost dash-btn-sm" title="Log out">
              <LogOut size={15} />
              <span className="logout-label">Log out</span>
            </button>
          </div>
        </header>

        <main className="dash-content">
          <Outlet context={{ roleBadge }} />
        </main>
      </div>
    </div>
  );
}
