import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  EyeOff,
  Globe2,
  Layers3,
  LayoutDashboard,
  LogIn,
  LogOut,
  MailCheck,
  MapPin,
  MousePointer2,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { initialsOf } from "../utils/format";

const FEATURES = [
  { icon: Search, number: "01", title: "Search with intent", text: "Find the right people fast with flexible filters for role, company, industry and more." },
  { icon: MapPin, number: "02", title: "Go local or global", text: "Pinpoint ideal prospects by city, region or country with accurate geo search." },
  { icon: ShieldCheck, number: "03", title: "Privacy built in", text: "Server-side masking keeps personal details protected until you are ready to connect." },
  { icon: Users, number: "04", title: "Built for teams", text: "Simple role-based access gives every teammate the right level of visibility." },
  { icon: Zap, number: "05", title: "Move at your speed", text: "Fast, index-backed queries and keyset pagination make every search feel instant." },
  { icon: Globe2, number: "06", title: "A world of opportunity", text: "Explore profiles across 195 countries and 150+ industries from one place." },
];

const STEPS = [
  { icon: UserPlus, title: "Create your free account", text: "No credit card. Just your email and a few seconds." },
  { icon: MailCheck, title: "Verify and unlock", text: "Confirm your email to activate your workspace." },
  { icon: Search, title: "Find your next yes", text: "Search, filter and start meaningful conversations." },
];

function LeadRow({ initials, name, role, location, color, score }) {
  return (
    <div className="lead-row">
      <span className="lead-avatar" style={{ background: color }}>{initials}</span>
      <span className="lead-info"><strong>{name}</strong><small>{role} · {location}</small></span>
      <span className="lead-score"><Activity size={12} /> {score}%</span>
      <ChevronRight size={15} className="lead-arrow" />
    </div>
  );
}

export default function LandingPage() {
  const { isAuthenticated, user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link to="/" className="brand"><span className="brand-badge"><Target size={18} /></span><span className="brand-name">free<span>leads</span></span></Link>
          <nav className="landing-nav">
            <Link to="/app">Search Leads</Link>
            <Link to="/plans">Pricing &amp; Plans</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/contact">Contact Us</Link>
          </nav>
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
        <section className="landing-hero">
          <div className="hero-grid-bg" />
          <div className="landing-container landing-hero-grid">
            <div className="landing-hero-copy">
              <span className="hero-badge"><span className="pulse-dot" /> The smarter way to prospect</span>
              <h1>Turn <span className="accent">curiosity</span><br />into connection.</h1>
              <p className="hero-sub">A beautiful, searchable directory for discovering the people and companies that move your business forward.</p>
              <div className="hero-ctas">
                {!isAuthenticated ? (
                  <>
                    <Link to="/signup" className="btn btn-primary btn-lg">Explore the directory <ArrowRight size={18} /></Link>
                    <Link to="/plans" className="btn btn-outline btn-lg">View Plans</Link>
                  </>
                ) : (
                  <>
                    <Link to="/admin" className="btn btn-primary btn-lg"><LayoutDashboard size={17} /> Open Dashboard <ArrowRight size={18} /></Link>
                    <Link to="/app" className="btn btn-outline btn-lg">Open App</Link>
                    <Link to="/plans" className="btn btn-outline btn-lg">Plans</Link>
                  </>
                )}
              </div>
              <div className="hero-proof"><div className="proof-avatars"><span>AR</span><span>DK</span><span>MS</span><span>+5k</span></div><span>Trusted by the next generation of growth teams</span></div>
            </div>

            <div className="hero-visual" aria-label="Animated preview of the Free Leads directory">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="float-chip chip-top"><Sparkles size={14} /> New match found</div>
              <div className="float-chip chip-bottom"><span className="mini-green-dot" /> 2,481 live results</div>
              <div className="directory-card">
                <div className="directory-top"><div><span className="eyebrow">DISCOVER</span><h3>Find your next lead</h3></div><span className="window-dots"><i /><i /><i /></span></div>
                <div className="directory-search"><Search size={16} /><span>Search people, companies...</span><kbd>⌘ K</kbd></div>
                <div className="filter-row"><span className="filter active">All leads</span><span className="filter"><MapPin size={12} /> Near me</span><span className="filter">SaaS</span><span className="filter">Growth</span></div>
                <div className="results-label"><span>TOP MATCHES</span><span>View all <ArrowRight size={12} /></span></div>
                <LeadRow initials="AR" name="Amelia Rhodes" role="Head of Growth · SaaS" location="London, UK" color="#d96b4d" score="98" />
                <LeadRow initials="DK" name="Daniel Kim" role="Founder · FinTech" location="Seoul, KR" color="#4667d8" score="94" />
                <LeadRow initials="MS" name="Maria Santos" role="Marketing Director" location="São Paulo, BR" color="#b18b40" score="91" />
                <div className="directory-footer"><span><CheckCircle2 size={13} /> Contacts protected by default</span><span className="footer-arrow"><ArrowRight size={14} /></span></div>
              </div>
              <span className="cursor"><MousePointer2 size={19} fill="currentColor" /></span>
            </div>
          </div>
          <div className="landing-container stat-strip"><div><strong>5M<span>+</span></strong><small>lead records target</small></div><div><strong>195</strong><small>countries covered</small></div><div><strong>150<span>+</span></strong><small>industries to explore</small></div><div className="stat-note"><Layers3 size={19} /><span>One calm place<br />for better outreach.</span></div></div>
        </section>

        <section id="features" className="landing-section features-section"><div className="landing-container"><div className="section-heading left"><span className="section-kicker">THE PLATFORM</span><h2>Everything clicks<br /><em>into place.</em></h2><p>Less time hunting. More time building relationships that matter.</p></div><div className="features-grid">{FEATURES.map(({ icon: Icon, title, text, number }) => <article className="feature-card" key={title}><div className="feature-card-top"><span className="feature-icon"><Icon size={19} /></span><span className="feature-number">{number}</span></div><h3>{title}</h3><p>{text}</p><span className="feature-line" /></article>)}</div></div></section>

        <section id="how-it-works" className="landing-section landing-section-alt"><div className="landing-container"><div className="section-heading"><span className="section-kicker">A SIMPLE START</span><h2>From zero to<br /><em>your next lead.</em></h2><p>Everything you need to start a conversation, without the busywork.</p></div><div className="steps-grid">{STEPS.map(({ icon: Icon, title, text }, index) => <div className="step-card" key={title}><div className="step-number">0{index + 1}</div><span className="step-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p>{index < 2 && <span className="step-connector"><ArrowRight size={16} /></span>}</div>)}</div></div></section>

        <section id="security" className="landing-section security-section"><div className="landing-container security-band"><span className="security-icon"><ShieldCheck size={25} /></span><div><span className="section-kicker">TRUST, ALWAYS</span><h3>Enterprise-grade security, quietly working in the background.</h3><p>Argon2id password hashing · JWT access + httpOnly refresh cookies · deny-by-default RBAC · Redis rate limiting · server-side PII masking.</p></div><Check size={22} className="security-check" /></div></section>
        <section className="landing-cta"><div className="landing-container landing-cta-inner"><span className="section-kicker">YOUR NEXT CHAPTER</span><h2>Good leads are<br /><em>closer than you think.</em></h2><p>Join the directory built to make prospecting feel human again.</p><div className="hero-ctas center">{isAuthenticated ? <><Link to="/admin" className="btn btn-light btn-lg">Open Dashboard <ArrowRight size={18} /></Link><Link to="/app" className="btn btn-outline-light btn-lg">Open App</Link></> : <><Link to="/signup" className="btn btn-light btn-lg">Start exploring free <ArrowRight size={18} /></Link><Link to="/login" className="btn btn-outline-light btn-lg">Log in</Link></>}</div></div></section>
      </main>
      <footer className="landing-footer"><div className="landing-container landing-footer-inner"><span className="brand"><span className="brand-badge"><Target size={14} /></span><span className="brand-name">free<span>leads</span></span></span><div className="footer-links"><Link to="/app">Search Leads</Link><Link to="/plans">Pricing &amp; Plans</Link><Link to="/blog">Blog</Link><Link to="/contact">Contact Us</Link></div><p>© {new Date().getFullYear()} Free Leads · Find better. Connect sooner.</p></div></footer>
    </div>
  );
}
