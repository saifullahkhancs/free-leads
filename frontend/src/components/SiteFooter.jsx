import { Link } from "react-router-dom";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link to="/app" className="site-footer-brand">
          <span className="site-brand-dot" aria-hidden="true" />
          <span className="site-brand-name">FreeLeads</span>
        </Link>

        <nav className="site-footer-links" aria-label="Footer navigation">
          <Link to="/app">Search Leads</Link>
          <Link to="/app/plans">Pricing & Plans</Link>
          <Link to="/app/blog">Blog</Link>
          <Link to="/app/contact">Contact Us</Link>
        </nav>

        <p>© {new Date().getFullYear()} Free Leads · Find better. Connect sooner.</p>
      </div>
    </footer>
  );
}
