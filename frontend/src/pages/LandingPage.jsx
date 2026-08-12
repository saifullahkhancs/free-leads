import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Globe2,
  HeartPulse,
  Landmark,
  Layers3,
  LayoutDashboard,
  MapPin,
  MousePointer2,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import * as api from "../api/client";
import { useAuth } from "../context/AuthContext";

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
  { icon: Search, title: "Verify and unlock", text: "Confirm your email to activate your workspace." },
  { icon: Search, title: "Find your next yes", text: "Search, filter and start meaningful conversations." },
];

const LEAD_TYPES = [
  {
    icon: Building2,
    title: "B2B Leads",
    text: "Connect with decision-makers across various industries.",
    available: "12.5M+",
    accent: "#6f9540",
    soft: "#eaf4d5",
  },
  {
    icon: Users,
    title: "B2C Leads",
    text: "Reach individual consumers with verified contact data.",
    available: "28M+",
    accent: "#cf704f",
    soft: "#fbe7df",
  },
  {
    icon: Globe2,
    title: "International",
    text: "Expand globally with leads from 50+ countries.",
    available: "15M+",
    accent: "#3f70c9",
    soft: "#e3ecfb",
  },
  {
    icon: Cpu,
    title: "Technology",
    text: "Target tech companies and IT decision-makers.",
    available: "5.2M+",
    accent: "#7558bd",
    soft: "#eee8fa",
  },
  {
    icon: HeartPulse,
    title: "Healthcare",
    text: "Connect with healthcare professionals and clinics.",
    available: "3.8M+",
    accent: "#298d78",
    soft: "#dff3ee",
  },
  {
    icon: Landmark,
    title: "Finance",
    text: "Reach banking professionals and investors.",
    available: "4.1M+",
    accent: "#b0802e",
    soft: "#f7edcf",
  },
];

// The public API replaces this snapshot with live database aggregates. Keeping
// a complete fallback means the marketing page still has useful coverage cards
// while a local API/database is starting or temporarily unavailable.
const FALLBACK_COUNTRIES = [
  { id: "US", name: "United States", code: "US", lead_count: 8400000, verified_count: 7200000, city_count: 312 },
  { id: "IN", name: "India", code: "IN", lead_count: 6200000, verified_count: 5100000, city_count: 248 },
  { id: "GB", name: "United Kingdom", code: "GB", lead_count: 4200000, verified_count: 3700000, city_count: 186 },
  { id: "CA", name: "Canada", code: "CA", lead_count: 3100000, verified_count: 2700000, city_count: 128 },
  { id: "DE", name: "Germany", code: "DE", lead_count: 2800000, verified_count: 2400000, city_count: 142 },
  { id: "AU", name: "Australia", code: "AU", lead_count: 2400000, verified_count: 2100000, city_count: 96 },
  { id: "FR", name: "France", code: "FR", lead_count: 2100000, verified_count: 1800000, city_count: 118 },
  { id: "BR", name: "Brazil", code: "BR", lead_count: 1900000, verified_count: 1500000, city_count: 134 },
  { id: "NL", name: "Netherlands", code: "NL", lead_count: 1600000, verified_count: 1400000, city_count: 74 },
  { id: "SG", name: "Singapore", code: "SG", lead_count: 1400000, verified_count: 1200000, city_count: 28 },
  { id: "AE", name: "United Arab Emirates", code: "AE", lead_count: 1200000, verified_count: 980000, city_count: 34 },
  { id: "ZA", name: "South Africa", code: "ZA", lead_count: 980000, verified_count: 810000, city_count: 68 },
];

const FALLBACK_TOTAL = FALLBACK_COUNTRIES.reduce((sum, country) => sum + country.lead_count, 0);

function compactCount(value) {
  const count = Number(value) || 0;
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1).replace(".0", "")}M+`;
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 100000 ? 0 : 1).replace(".0", "")}K+`;
  return new Intl.NumberFormat("en-US").format(count);
}

function countryFlag(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "🌐";
  return String.fromCodePoint(...[...normalized].map((char) => 127397 + char.charCodeAt(0)));
}

function ThreeDCard({ children, className = "", index = 0, style }) {
  const cardRef = useRef(null);

  const handlePointerMove = (event) => {
    if (event.pointerType === "touch" || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    cardRef.current.style.setProperty("--tilt-x", `${(0.5 - y) * 9}deg`);
    cardRef.current.style.setProperty("--tilt-y", `${(x - 0.5) * 11}deg`);
    cardRef.current.style.setProperty("--glow-x", `${x * 100}%`);
    cardRef.current.style.setProperty("--glow-y", `${y * 100}%`);
  };

  const resetTilt = () => {
    if (!cardRef.current) return;
    cardRef.current.style.setProperty("--tilt-x", "0deg");
    cardRef.current.style.setProperty("--tilt-y", "0deg");
    cardRef.current.style.setProperty("--glow-x", "50%");
    cardRef.current.style.setProperty("--glow-y", "50%");
  };

  return (
    <div
      ref={cardRef}
      className={`lead-card-scene ${className}`}
      style={{ "--card-index": index, ...style }}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      <div className="lead-card-float">{children}</div>
    </div>
  );
}

function CountryCard({ country, index, total, maxLeads }) {
  const leads = Number(country.lead_count) || 0;
  const verified = Number(country.verified_count) || 0;
  const share = total ? Math.max(1, Math.round((leads / total) * 100)) : 0;
  const barWidth = maxLeads ? Math.max(10, Math.round((leads / maxLeads) * 100)) : 10;

  return (
    <ThreeDCard className="country-card-scene" index={index}>
      <article className="lead-3d-card country-card">
        <span className="card-glow" aria-hidden="true" />
        <div className="country-card-top">
          <span className="country-flag" aria-hidden="true">{countryFlag(country.code)}</span>
          <span className="country-rank">#{String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className="country-card-copy">
          <h3>{country.name}</h3>
          <p><strong>{compactCount(leads)}</strong><span>available leads</span></p>
        </div>
        <div className="country-volume" aria-label={`${share}% of all available leads`}>
          <span style={{ width: `${barWidth}%` }} />
        </div>
        <div className="country-card-meta">
          <span><MapPin size={12} /> {country.city_count ? `${country.city_count} cities` : "Nationwide"}</span>
          <span><CheckCircle2 size={12} /> {verified ? `${compactCount(verified)} verified` : `${share}% of network`}</span>
        </div>
      </article>
    </ThreeDCard>
  );
}

function LeadTypeCard({ item, index }) {
  const Icon = item.icon;
  return (
    <ThreeDCard
      className="type-card-scene"
      index={index}
      style={{ "--card-accent": item.accent, "--card-soft": item.soft }}
    >
      <article className="lead-3d-card type-card">
        <span className="card-glow" aria-hidden="true" />
        <div className="type-card-head">
          <span className="type-card-icon"><Icon size={22} /></span>
          <span className="type-card-index">0{index + 1}</span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.text}</p>
        <div className="type-card-available">
          <strong>{item.available}</strong>
          <span>Available</span>
          <ArrowRight size={18} />
        </div>
      </article>
    </ThreeDCard>
  );
}

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
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.roles?.some((r) => ["admin", "super_admin"].includes(r));
  const [countryCoverage, setCountryCoverage] = useState({
    total_leads: FALLBACK_TOTAL,
    top_countries: FALLBACK_COUNTRIES,
  });

  useEffect(() => {
    let cancelled = false;

    api.getLandingLeadStats()
      .then((response) => {
        const countries = response?.data?.top_countries;
        if (!cancelled && Array.isArray(countries) && countries.length > 0) {
          setCountryCoverage({
            total_leads: Number(response.data.total_leads) || countries.reduce(
              (sum, country) => sum + (Number(country.lead_count) || 0),
              0
            ),
            top_countries: countries.slice(0, 12),
          });
        }
      })
      .catch(() => {
        // The bundled snapshot is already visible, so API downtime never leaves
        // a blank marketing section.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landing">
      <main>
        <section className="landing-hero" style={{ paddingTop: "40px" }}>
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
                    <Link to="/app/plans" className="btn btn-outline btn-lg">View Plans</Link>
                  </>
                ) : (
                  <>
                    {isAdmin && (
                      <Link to="/admin" className="btn btn-primary btn-lg">
                        <LayoutDashboard size={17} /> Open Dashboard <ArrowRight size={18} />
                      </Link>
                    )}
                    <Link to="/app/search" className="btn btn-outline btn-lg">Search Leads</Link>
                    <Link to="/app/plans" className="btn btn-outline btn-lg">Plans</Link>
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

        <section className="landing-section coverage-section" aria-labelledby="coverage-heading">
          <div className="coverage-orb coverage-orb-one" aria-hidden="true" />
          <div className="coverage-orb coverage-orb-two" aria-hidden="true" />
          <div className="landing-container coverage-container">
            <div className="section-heading coverage-heading">
              <span className="section-kicker">GLOBAL COVERAGE</span>
              <h2 id="coverage-heading">Your next customer<br /><em>could be anywhere.</em></h2>
              <p>Explore the 12 countries with the most available leads in our global directory.</p>
            </div>
            <div className="country-leads-grid">
              {countryCoverage.top_countries.slice(0, 12).map((country, index) => (
                <CountryCard
                  key={country.id || country.code || country.name}
                  country={country}
                  index={index}
                  total={countryCoverage.total_leads}
                  maxLeads={Number(countryCoverage.top_countries[0]?.lead_count) || 0}
                />
              ))}
            </div>
            <div className="coverage-footnote">
              <span><span className="live-pulse" /> Ranked by available lead volume</span>
              <Link to={isAuthenticated ? "/app/search" : "/signup"}>
                Explore global leads <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-section lead-types-section" aria-labelledby="lead-types-heading">
          <div className="landing-container">
            <div className="section-heading lead-types-heading">
              <span className="section-kicker">LEADS FOR EVERY GOAL</span>
              <h2 id="lead-types-heading">One directory.<br /><em>Endless possibilities.</em></h2>
              <p>Choose the audience that fits your strategy, then turn accurate data into your next conversation.</p>
            </div>
            <div className="lead-types-grid">
              {LEAD_TYPES.map((item, index) => (
                <LeadTypeCard key={item.title} item={item} index={index} />
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="landing-section features-section"><div className="landing-container"><div className="section-heading left"><span className="section-kicker">THE PLATFORM</span><h2>Everything clicks<br /><em>into place.</em></h2><p>Less time hunting. More time building relationships that matter.</p></div><div className="features-grid">{FEATURES.map(({ icon: Icon, title, text, number }) => <article className="feature-card" key={title}><div className="feature-card-top"><span className="feature-icon"><Icon size={19} /></span><span className="feature-number">{number}</span></div><h3>{title}</h3><p>{text}</p><span className="feature-line" /></article>)}</div></div></section>

        <section id="how-it-works" className="landing-section landing-section-alt"><div className="landing-container"><div className="section-heading"><span className="section-kicker">A SIMPLE START</span><h2>From zero to<br /><em>your next lead.</em></h2><p>Everything you need to start a conversation, without the busywork.</p></div><div className="steps-grid">{STEPS.map(({ icon: Icon, title, text }, index) => <div className="step-card" key={title}><div className="step-number">0{index + 1}</div><span className="step-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p>{index < 2 && <span className="step-connector"><ArrowRight size={16} /></span>}</div>)}</div></div></section>

        <section id="security" className="landing-section security-section"><div className="landing-container security-band"><span className="security-icon"><ShieldCheck size={25} /></span><div><span className="section-kicker">TRUST, ALWAYS</span><h3>Enterprise-grade security, quietly working in the background.</h3><p>Argon2id password hashing · JWT access + httpOnly refresh cookies · deny-by-default RBAC · Redis rate limiting · server-side PII masking.</p></div><Check size={22} className="security-check" /></div></section>
        <section className="landing-cta"><div className="landing-container landing-cta-inner"><span className="section-kicker">YOUR NEXT CHAPTER</span><h2>Good leads are<br /><em>closer than you think.</em></h2><p>Join the directory built to make prospecting feel human again.</p><div className="hero-ctas center">{isAuthenticated ? <>{isAdmin && <Link to="/admin" className="btn btn-light btn-lg">Open Dashboard <ArrowRight size={18} /></Link>}<Link to="/app/search" className="btn btn-outline-light btn-lg">Search Leads</Link></> : <><Link to="/signup" className="btn btn-light btn-lg">Start exploring free <ArrowRight size={18} /></Link><Link to="/login" className="btn btn-outline-light btn-lg">Log in</Link></>}</div></div></section>
      </main>
    </div>
  );
}
