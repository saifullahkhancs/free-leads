import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Compass,
  Mail,
  Rss,
  User,
} from "lucide-react";
import * as api from "../api/client";

/** Public single blog post page. */
export default function BlogPostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);


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
                    <Link to="/app/contact" className="btn btn-outline btn-lg"><Mail size={17} /> Get in touch</Link>
                  </div>
                </footer>
              </>
            )}
          </div>
        </article>
      </main>
    </div>
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
