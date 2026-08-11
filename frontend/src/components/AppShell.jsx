import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

/**
 * Layout for every /app route.
 *
 * Renders exactly one navigation bar (<SiteHeader />). Child pages must NOT
 * render their own <header> — doing so is what produced the duplicated menu
 * bar. Pages render page content only.
 */
export default function AppShell() {
  const location = useLocation();

  // Scroll to top on navigation so a new page never opens mid-scroll.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }, [location.pathname]);

  return (
    <div className="site-shell">
      <SiteHeader />

      <main className="site-main">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  );
}
