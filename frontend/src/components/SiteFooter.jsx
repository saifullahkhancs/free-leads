import { Link } from "react-router-dom";
import { Target } from "lucide-react";

/** Shared footer for the public + app surface (matches SiteHeader width). */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link to="/" className="site-footer-brand">
          <span className="site-brand-badge"><Target size={14} /></span>
          <span className="site-brand-name">free<span>leads</span></span>
        </Link>

        <nav className="site-footer-links" aria-label="Footer navigation">
          <Link to="/app">Search Leads</Link>
          <Link to="/app/plans">Pricing &amp; Plans</Link>
          <Link to="/app/blog">Blog</Link>
          <Link to="/app/contact">Contact Us</Link>
        </nav>

        <p>© {new Date().getFullYear()} Free Leads · Find better. Connect sooner.</p>
      </div>
    </footer>
  );
}
