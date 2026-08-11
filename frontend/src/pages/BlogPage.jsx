import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  Clock,
  Compass,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Rss,
  Search as SearchIcon,
  Sparkles,
  Target,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api/client";
import { initialsOf } from "../utils/format";

/**
 * Public blog list page. Shows every published post in newest-first order.
 * Empty state nudges visitors back to the directory or to the contact form.
 */
export default function BlogPage() {
  const { isAuthenticated, user, logout } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  const handleLogout = async () => {
    await logout();
    window.location.href = "/blog";
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getPublishedPosts({ limit: 30 })
      .then((res) => {
        if (cancelled) return;
        setPosts(res?.data?.posts || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Couldn't load the blog.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = posts.filter((p) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      p.title?.toLowerCase().includes(q) ||
      p.excerpt?.toLowerCase().includes(q)
    );
  });

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link to="/" className="brand">
            <span className="brand-badge"><Target size={18} /></span>
            <span className="brand-name">free<span>leads</span></span>
          </Link>
          <TopNav active="blog" />
          <div className="landing-auth-actions">
            {isAuthenticated ? (
              <>
                <div className="landing-user">
                  <span className="landing-avatar">{initialsOf(user)}</span>
                  <span className="landing-user-meta">
                    <strong>{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User"}</strong>
                    <small>{user?.email}</small>
                  </span>
                </div>
                <Link to="/admin" className="btn btn-outline"><LayoutDashboard size={15} /> <span className="btn-text">Dashboard</span></Link>
                <Link to="/app" className="btn btn-primary"><span className="btn-text">App</span> <ArrowRight size={15} /></Link>
                <button onClick={handleLogout} className="btn btn-logout" title="Log out"><LogOut size={15} /> <span className="logout-text">Log out</span></button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost"><LogIn size={15} /> Log in</Link>
                <Link to="/signup" className="btn btn-primary">Start for free <ArrowRight size={15} /></Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero blog-hero">
          <div className="hero-grid-bg" />
          <div className="landing-container blog-hero-inner">
            <span className="hero-badge"><Rss size={13} /> Notes from the Free Leads team</span>
            <h1>The Free Leads <span className="accent">blog</span></h1>
            <p className="hero-sub" style={{ margin: "0 auto", textAlign: "center" }}>
              Field-tested playbooks, product updates, and prospecting stories
              from the people building the directory.
            </p>

            <div className="blog-search-row">
              <SearchIcon size={16} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search articles…"
              />
            </div>
          </div>
        </section>

        <section className="landing-section blog-list-section">
          <div className="landing-container">
            {error && <div className="dash-alert dash-alert-error">⚠ {error}</div>}

            {loading ? (
              <div className="blog-grid">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="blog-card blog-card-skel">
                    <div className="blog-card-cover shimmer" />
                    <div className="shimmer shimmer-line short" />
                    <div className="shimmer shimmer-line" />
                    <div className="shimmer shimmer-line tiny" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="app-empty-state">
                <div className="app-empty-icon"><FileText size={28} /></div>
                <h3>No articles yet</h3>
                <p>
                  {query.trim()
                    ? "No posts match your search. Try another keyword."
                    : "The team is writing their first posts. Check back soon — or get in touch if there's a topic you'd like us to cover."}
                </p>
                <Link to="/contact" className="btn btn-primary"><Mail size={15} /> Suggest a topic</Link>
              </div>
            ) : (
              <>
                {featured && (
                  <Link to={`/blog/${featured.slug}`} className="blog-feature">
                    <div
                      className="blog-feature-cover"
                      style={featured.cover_image_url ? { backgroundImage: `url(${featured.cover_image_url})` } : {}}
                    >
                      <span className="blog-feature-kicker">Latest article</span>
                    </div>
                    <div className="blog-feature-body">
                      <h2>{featured.title}</h2>
                      {featured.excerpt && <p>{featured.excerpt}</p>}
                      <div className="blog-meta">
                        <span><Calendar size={12} /> {formatDate(featured.published_at || featured.created_at)}</span>
                        {featured.reading_time_minutes ? (
                          <span><Clock size={12} /> {featured.reading_time_minutes} min read</span>
                        ) : null}
                        {(featured.first_name || featured.last_name) && (
                          <span>By {[featured.first_name, featured.last_name].filter(Boolean).join(" ")}</span>
                        )}
                      </div>
                      <span className="blog-feature-cta">Read article <ArrowRight size={14} /></span>
                    </div>
                  </Link>
                )}

                {rest.length > 0 && (
                  <div className="blog-grid">
                    {rest.map((post) => (
                      <Link to={`/blog/${post.slug}`} key={post.id} className="blog-card">
                        <div
                          className="blog-card-cover"
                          style={post.cover_image_url ? { backgroundImage: `url(${post.cover_image_url})` } : {}}
                        >
                          <Sparkles size={20} />
                        </div>
                        <div className="blog-card-body">
                          <h3>{post.title}</h3>
                          {post.excerpt && <p>{post.excerpt}</p>}
                          <div className="blog-meta">
                            <span><Calendar size={12} /> {formatDate(post.published_at || post.created_at)}</span>
                            {post.reading_time_minutes ? (
                              <span><Clock size={12} /> {post.reading_time_minutes} min</span>
                            ) : null}
                          </div>
                          <span className="blog-card-cta">Read more <ArrowRight size={13} /></span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-container landing-cta-inner">
            <span className="section-kicker">READY TO EXPLORE?</span>
            <h2>Start your search on the directory.</h2>
            <p>5M+ profiles across 195 countries, ready in seconds.</p>
            <div className="hero-ctas center">
              <Link to="/app" className="btn btn-light btn-lg"><Compass size={17} /> Open directory <ArrowRight size={18} /></Link>
              <Link to="/plans" className="btn btn-outline-light btn-lg">View plans</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <Link to="/" className="brand">
            <span className="brand-badge"><Target size={14} /></span>
            <span className="brand-name">free<span>leads</span></span>
          </Link>
          <div className="footer-links">
            <Link to="/#features">Platform</Link>
            <Link to="/#how-it-works">How it works</Link>
            <Link to="/plans">Pricing &amp; Plans</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/contact">Contact</Link>
          </div>
          <p>© {new Date().getFullYear()} Free Leads · Find better. Connect sooner.</p>
        </div>
      </footer>
    </div>
  );
}

function TopNav({ active }) {
  return (
    <nav className="landing-nav">
      <Link to="/#features" className={active === "platform" ? "active" : ""}>Platform</Link>
      <Link to="/#how-it-works" className={active === "how" ? "active" : ""}>How it works</Link>
      <Link to="/plans" className={active === "plans" ? "active" : ""}>Pricing &amp; Plans</Link>
      <Link to="/blog" className={active === "blog" ? "active" : ""}>Blog</Link>
      <Link to="/contact" className={active === "contact" ? "active" : ""}>Contact</Link>
    </nav>
  );
}

function formatDate(input) {
  if (!input) return "—";
  const d = new Date(input);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
