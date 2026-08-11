import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Compass,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Rss,
  Target,
  User,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api/client";
import { initialsOf } from "../utils/format";

/** Public single blog post page. */
export default function BlogPostPage() {
  const { slug } = useParams();
  const { isAuthenticated, user, logout } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleLogout = async () => {
    await logout();
    window.location.href = `/blog/${slug}`;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getPublishedPostBySlug(slug)
      .then((res) => {
        if (cancelled) return;
        setPost(res?.data || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.status === 404 ? "This post is no longer available." : (err?.message || "Couldn't load this post."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="landing blog-post-page">
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
        <article className="blog-article">
          <div className="landing-container blog-article-inner">
            <Link to="/app/blog" className="blog-back-link">
              <ArrowLeft size={14} /> Back to blog
            </Link>

            {loading ? (
              <div className="blog-article-skel">
                <div className="shimmer shimmer-line thin" />
                <div className="shimmer shimmer-line" />
                <div className="shimmer shimmer-line" />
                <div className="shimmer shimmer-line short" />
              </div>
            ) : error ? (
              <div className="app-empty-state">
                <h3>{error}</h3>
                <Link to="/app/blog" className="btn btn-primary">Back to blog</Link>
              </div>
            ) : !post ? (
              <div className="app-empty-state">
                <h3>Post not found</h3>
                <Link to="/app/blog" className="btn btn-primary">Back to blog</Link>
              </div>
            ) : (
              <>
                <header className="blog-article-head">
                  <span className="blog-article-kicker"><Rss size={13} /> Free Leads blog</span>
                  <h1>{post.title}</h1>
                  {post.excerpt && <p className="blog-article-excerpt">{post.excerpt}</p>}
                  <div className="blog-meta">
                    <span><Calendar size={12} /> {formatDate(post.published_at || post.created_at)}</span>
                    {post.reading_time_minutes ? (
                      <span><Clock size={12} /> {post.reading_time_minutes} min read</span>
                    ) : null}
                    {(post.first_name || post.last_name) && (
                      <span><User size={12} /> {[post.first_name, post.last_name].filter(Boolean).join(" ")}</span>
                    )}
                  </div>
                </header>

                {post.cover_image_url && (
                  <div
                    className="blog-article-cover"
                    style={{ backgroundImage: `url(${post.cover_image_url})` }}
                  />
                )}

                <div className="blog-article-body">
                  {renderBody(post.body)}
                </div>

                <footer className="blog-article-foot">
                  <h3>Found this useful?</h3>
                  <p>Spin up a free account and try the directory for yourself.</p>
                  <div className="hero-ctas center">
                    <Link to="/app" className="btn btn-primary btn-lg"><Compass size={17} /> Open directory <ArrowRight size={18} /></Link>
                    <Link to="/contact" className="btn btn-outline btn-lg"><Mail size={17} /> Get in touch</Link>
                  </div>
                </footer>
              </>
            )}
          </div>
        </article>
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
            <Link to="/app/plans">Pricing &amp; Plans</Link>
            <Link to="/app/blog">Blog</Link>
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
      <Link to="/app/plans" className={active === "plans" ? "active" : ""}>Pricing &amp; Plans</Link>
      <Link to="/app/blog" className={active === "blog" ? "active" : ""}>Blog</Link>
      <Link to="/app/contact" className={active === "contact" ? "active" : ""}>Contact</Link>
    </nav>
  );
}

function formatDate(input) {
  if (!input) return "—";
  const d = new Date(input);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Renders the post body. Supports plain paragraphs separated by blank lines
 * and simple `## heading` markers. No full markdown parser to keep the
 * surface area small — extend this when richer formatting is needed.
 */
function renderBody(body) {
  if (!body) return null;
  const blocks = String(body).split(/\n\s*\n/);
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("## ")) {
      return <h2 key={i}>{trimmed.slice(3)}</h2>;
    }
    if (trimmed.startsWith("### ")) {
      return <h3 key={i}>{trimmed.slice(4)}</h3>;
    }
    if (trimmed.startsWith("> ")) {
      return <blockquote key={i}>{trimmed.slice(2)}</blockquote>;
    }
    // Preserve single newlines inside a paragraph as <br>.
    return (
      <p key={i}>
        {trimmed.split("\n").map((line, j, arr) => (
          <span key={j}>
            {line}
            {j < arr.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}
