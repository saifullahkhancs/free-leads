import { Link } from "react-router-dom";
import {
  Target,
  Search,
  MapPin,
  ShieldCheck,
  Users,
  EyeOff,
  Zap,
  ArrowRight,
  MailCheck,
  UserPlus,
  LogIn,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const FEATURES = [
  {
    icon: Search,
    title: "Powerful search & filters",
    text: "Full-text and fuzzy search over names, companies and headlines, backed by GIN indexes so results stay instant at scale.",
  },
  {
    icon: MapPin,
    title: "Near-me geo search",
    text: "Find leads around you with radius-based geospatial search across a standardized country, region and city hierarchy.",
  },
  {
    icon: ShieldCheck,
    title: "Security first",
    text: "JWT access tokens with httpOnly refresh cookies, Argon2id password hashing and Redis-backed rate limiting.",
  },
  {
    icon: Users,
    title: "Role-based access",
    text: "Deny-by-default RBAC decides exactly what each account tier can see and do — from free users to admins.",
  },
  {
    icon: EyeOff,
    title: "Privacy-aware data",
    text: "Contact details are masked server-side on the free tier, so sensitive data is only ever exposed to unlocked accounts.",
  },
  {
    icon: Zap,
    title: "Built for 5M+ records",
    text: "Keyset pagination, index-backed queries and worker-driven imports keep the directory fast as it grows.",
  },
];

const STEPS = [
  {
    icon: UserPlus,
    step: "Step 1",
    title: "Create your free account",
    text: "Sign up with your email in seconds — no credit card required.",
  },
  {
    icon: MailCheck,
    step: "Step 2",
    title: "Verify your email",
    text: "Enter the 5-digit code we send you to activate your account.",
  },
  {
    icon: Search,
    step: "Step 3",
    title: "Search the directory",
    text: "Browse, filter and open lead profiles across industries and locations.",
  },
];

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="landing">
      {/* ---------------- Header ---------------- */}
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link to="/" className="brand">
            <span className="brand-badge">
              <Target size={18} />
            </span>
            <span className="brand-name">Free Leads</span>
          </Link>

          <nav className="landing-nav">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#security">Security</a>
          </nav>

          <div className="landing-auth-actions">
            {isAuthenticated ? (
              <>
                <span className="landing-user-email">{user?.email}</span>
                <Link
                  to={user?.roles?.some((r) => ["admin", "super_admin"].includes(r)) ? "/admin" : "/app"}
                  className="btn btn-primary"
                >
                  Open dashboard <ArrowRight size={16} />
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost">
                  <LogIn size={16} /> Log in
                </Link>
                <Link to="/signup" className="btn btn-primary">
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="landing-hero">
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="hero-badge">
              <CheckCircle2 size={14} /> Free tier — no credit card required
            </span>
            <h1>
              Discover your next customer in a directory of{" "}
              <span className="accent">millions of leads</span>
            </h1>
            <p className="hero-sub">
              Free Leads is a searchable directory of professional contact
              records — profiles, companies, industries and locations. Sign up
              free, verify your email and start searching in under a minute.
            </p>
            <div className="hero-ctas">
              {!isAuthenticated && (
                <Link to="/signup" className="btn btn-primary btn-lg">
                  Get started — it's free <ArrowRight size={18} />
                </Link>
              )}
              <Link
                to={isAuthenticated ? "/app" : "/login"}
                className="btn btn-outline btn-lg"
              >
                {isAuthenticated ? "Go to my dashboard" : "Log in"}
              </Link>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <strong>5M+</strong>
                <span>lead records target</span>
              </div>
              <div className="hero-stat">
                <strong>195</strong>
                <span>countries covered</span>
              </div>
              <div className="hero-stat">
                <strong>150+</strong>
                <span>industries</span>
              </div>
            </div>
          </div>

          {/* Mock product preview */}
          <div className="hero-preview" aria-hidden="true">
            <div className="preview-search">
              <Search size={16} />
              <span>Search leads by name, company or industry…</span>
            </div>

            {[
              {
                initials: "AR",
                color: "#4f46e5",
                name: "Amelia Rhodes",
                meta: "Head of Growth · SaaS · London, UK",
                masked: "a••••@growthco.io",
              },
              {
                initials: "DK",
                color: "#0ea5e9",
                name: "Daniel Kim",
                meta: "Founder · FinTech · Seoul, KR",
                masked: "d••••@payflow.app",
              },
              {
                initials: "MS",
                color: "#f59e0b",
                name: "Maria Santos",
                meta: "Marketing Director · Retail · São Paulo, BR",
                masked: "m••••@retailhub.com",
              },
            ].map((lead) => (
              <div className="preview-row" key={lead.name}>
                <span className="preview-avatar" style={{ background: lead.color }}>
                  {lead.initials}
                </span>
                <div className="preview-meta">
                  <strong>{lead.name}</strong>
                  <span>{lead.meta}</span>
                </div>
                <span className="preview-masked">
                  <EyeOff size={13} /> {lead.masked}
                </span>
              </div>
            ))}

            <div className="preview-footer">
              <span className="preview-count">2,481 results</span>
              <span className="preview-unlock">Unlock full contact info</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="landing-section">
        <div className="landing-container">
          <div className="section-heading">
            <h2>Everything you need to source leads</h2>
            <p>
              A production-grade directory platform — search, geo, security and
              access control included from day one.
            </p>
          </div>
          <div className="features-grid">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div className="feature-card" key={title}>
                <span className="feature-icon">
                  <Icon size={20} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how-it-works" className="landing-section landing-section-alt">
        <div className="landing-container">
          <div className="section-heading">
            <h2>Up and running in three steps</h2>
            <p>From sign-up to your first lead search in under a minute.</p>
          </div>
          <div className="steps-grid">
            {STEPS.map(({ icon: Icon, step, title, text }) => (
              <div className="step-card" key={title}>
                <span className="step-icon">
                  <Icon size={22} />
                </span>
                <span className="step-label">{step}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Security strip ---------------- */}
      <section id="security" className="landing-section">
        <div className="landing-container security-band">
          <span className="security-icon">
            <ShieldCheck size={26} />
          </span>
          <div>
            <h3>Enterprise-grade security on every tier</h3>
            <p>
              Argon2id password hashing · JWT access + httpOnly refresh cookies ·
              deny-by-default RBAC · Redis rate limiting · server-side PII masking.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Final CTA ---------------- */}
      <section className="landing-cta">
        <div className="landing-container landing-cta-inner">
          <h2>Ready to meet your next lead?</h2>
          <p>Create a free account and start searching the directory today.</p>
          <div className="hero-ctas center">
            {!isAuthenticated ? (
              <>
                <Link to="/signup" className="btn btn-light btn-lg">
                  Sign up free <ArrowRight size={18} />
                </Link>
                <Link to="/login" className="btn btn-outline-light btn-lg">
                  Log in
                </Link>
              </>
            ) : (
              <Link to="/app" className="btn btn-light btn-lg">
                Open dashboard <ArrowRight size={18} />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <span className="brand">
            <span className="brand-badge">
              <Target size={14} />
            </span>
            <span className="brand-name">Free Leads</span>
          </span>
          <p>© {new Date().getFullYear()} Free Leads. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
