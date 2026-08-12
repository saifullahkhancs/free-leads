import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LayoutDashboard, MapPin } from "lucide-react";
import * as api from "../api/client";
import { useAuth } from "../context/AuthContext";
import GlobeAnimation from "../components/GlobeAnimation";

const LEAD_TYPES = [
  {
    icon: "🏢",
    title: "B2B Leads",
    text: "Connect with decision-makers across various industries.",
    available: "12.5M+",
    accent: "#4bc38c",
    soft: "rgba(75,195,140,0.14)",
  },
  {
    icon: "👥",
    title: "B2C Leads",
    text: "Reach individual consumers with verified contact data.",
    available: "28M+",
    accent: "#ff9d73",
    soft: "rgba(255,157,115,0.14)",
  },
  {
    icon: "🌐",
    title: "International",
    text: "Expand globally with leads from 50+ countries.",
    available: "15M+",
    accent: "#7fa8ff",
    soft: "rgba(127,168,255,0.14)",
  },
  {
    icon: "💻",
    title: "Technology",
    text: "Target tech companies and IT decision-makers.",
    available: "5.2M+",
    accent: "#b79bff",
    soft: "rgba(183,155,255,0.14)",
  },
  {
    icon: "🩺",
    title: "Healthcare",
    text: "Connect with healthcare professionals and clinics.",
    available: "3.8M+",
    accent: "#4bc38c",
    soft: "rgba(75,195,140,0.14)",
  },
  {
    icon: "🏛️",
    title: "Finance",
    text: "Reach banking professionals and investors.",
    available: "4.1M+",
    accent: "#d7ff63",
    soft: "rgba(215,255,99,0.14)",
  },
];

const FEATURES = [
  {
    icon: "🔍",
    num: "01",
    title: "Search with intent",
    text: "Find the right people fast with flexible filters for role, company, industry and more.",
  },
  {
    icon: "📍",
    num: "02",
    title: "Go local or global",
    text: "Pinpoint ideal prospects by city, region or country with accurate geo search.",
  },
  {
    icon: "🛡️",
    num: "03",
    title: "Privacy built in",
    text: "Server-side masking keeps personal details protected until you are ready to connect.",
  },
  {
    icon: "👥",
    num: "04",
    title: "Built for teams",
    text: "Simple role-based access gives every teammate the right level of visibility.",
  },
  {
    icon: "⚡",
    num: "05",
    title: "Move at your speed",
    text: "Fast, index-backed queries and keyset pagination make every search feel instant.",
  },
  {
    icon: "🌐",
    num: "06",
    title: "A world of opportunity",
    text: "Explore profiles across 195 countries and 150+ industries from one place.",
  },
];

const STEPS = [
  {
    num: "01",
    icon: "👤",
    title: "Create your free account",
    text: "No credit card. Just your email and a few seconds.",
  },
  {
    num: "02",
    icon: "✉️",
    title: "Verify and unlock",
    text: "Confirm your email to activate your workspace.",
  },
  {
    num: "03",
    icon: "🔍",
    title: "Find your next yes",
    text: "Search, filter and start meaningful conversations.",
  },
];

const FALLBACK_COUNTRIES = [
  { code: "US", name: "United States", count: "8.4M+", verified: "7.2M verified", cities: "312 cities", share: 100 },
  { code: "IN", name: "India", count: "6.2M+", verified: "5.1M verified", cities: "248 cities", share: 74 },
  { code: "GB", name: "United Kingdom", count: "4.2M+", verified: "3.7M verified", cities: "186 cities", share: 50 },
  { code: "CA", name: "Canada", count: "3.1M+", verified: "2.7M verified", cities: "128 cities", share: 37 },
  { code: "DE", name: "Germany", count: "2.8M+", verified: "2.4M verified", cities: "142 cities", share: 33 },
  { code: "AU", name: "Australia", count: "2.4M+", verified: "2.1M verified", cities: "96 cities", share: 29 },
  { code: "FR", name: "France", count: "2.1M+", verified: "1.8M verified", cities: "118 cities", share: 25 },
  { code: "BR", name: "Brazil", count: "1.9M+", verified: "1.5M verified", cities: "134 cities", share: 23 },
  { code: "NL", name: "Netherlands", count: "1.6M+", verified: "1.4M verified", cities: "74 cities", share: 19 },
  { code: "SG", name: "Singapore", count: "1.4M+", verified: "1.2M verified", cities: "28 cities", share: 17 },
  { code: "AE", name: "United Arab Emirates", count: "1.2M+", verified: "980K verified", cities: "34 cities", share: 14 },
  { code: "ZA", name: "South Africa", count: "980K+", verified: "810K verified", cities: "68 cities", share: 12 },
];

function flag(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "🌐";
  return String.fromCodePoint(...[...normalized].map((c) => 127397 + c.charCodeAt(0)));
}

function compactCount(value) {
  const count = Number(value) || 0;
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1).replace(".0", "")}M+`;
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 100000 ? 0 : 1).replace(".0", "")}K+`;
  return new Intl.NumberFormat("en-US").format(count);
}

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.roles?.some((r) => ["admin", "super_admin"].includes(r));
  const [countries, setCountries] = useState(FALLBACK_COUNTRIES);

  // Track mouse over lead-type cards for the moving radial highlight.
  const handleTypeCardMove = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${px}%`);
    el.style.setProperty("--my", `${py}%`);
  };

  useEffect(() => {
    let cancelled = false;
    api.getLandingLeadStats()
      .then((response) => {
        const top = response?.data?.top_countries;
        if (!cancelled && Array.isArray(top) && top.length > 0) {
          const maxLeads = Number(top[0]?.lead_count) || 1;
          const mapped = top.slice(0, 12).map((c) => ({
            code: c.code || c.id || "US",
            name: c.name,
            count: compactCount(c.lead_count),
            verified: c.verified_count ? `${compactCount(c.verified_count)} verified` : "Verified leads",
            cities: c.city_count ? `${c.city_count} cities` : "Nationwide",
            share: Math.max(10, Math.round(((Number(c.lead_count) || 0) / maxLeads) * 100)),
          }));
          setCountries(mapped);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="wrap">
      {/* HERO */}
      <section className="hero">
        <div>
          <span className="badge"><span className="pd" />The smarter way to prospect</span>
          <h1 className="hero-h1">Turn <em>curiosity</em><br />into connection.</h1>
          <p className="hero-sub">A beautiful, searchable directory for discovering the people and companies that move your business forward.</p>
          <div className="hero-ctas">
            {!isAuthenticated ? (
              <>
                <Link className="btn-primary" to="/signup">Explore the directory →</Link>
                <Link className="btn-outline" to="/app/plans">View plans</Link>
              </>
            ) : (
              <>
                {isAdmin && (
                  <Link className="btn-primary" to="/admin">
                    <LayoutDashboard size={17} /> Open Dashboard →
                  </Link>
                )}
                <Link className={isAdmin ? "btn-outline" : "btn-primary"} to="/app/search">
                  Explore the directory →
                </Link>
                <Link className="btn-outline" to="/app/plans">View plans</Link>
              </>
            )}
          </div>
          <div className="hero-proof">
            <div className="proof-avatars">
              <span>AR</span>
              <span>DK</span>
              <span>MS</span>
              <span>+5k</span>
            </div>
            <span>Trusted by the next generation of growth teams</span>
          </div>
        </div>

        <div className="hero-visual hero-globe-visual">
          <GlobeAnimation />
        </div>
      </section>

      {/* STAT STRIP */}
      <div className="stats">
        <div className="stat bold-stat stat-highlight"><b>5 million</b><span>Verified lead records</span></div>
        <div className="stat bold-stat stat-highlight"><b>196</b><span>Countries around the world</span></div>
        <div className="stat"><b>150+</b><span>Industries to explore</span></div>
        <div className="stat"><b>Free</b><span>A calm place for better outreach</span></div>
      </div>

      {/* COVERAGE / COUNTRIES */}
      <section className="block" id="coverage">
        <div className="section-head">
          <span className="kicker">Global coverage</span>
          <h2>Your next customer<br /><em>could be anywhere.</em></h2>
          <p>Explore the 12 countries with the most available leads in our global directory.</p>
        </div>
        <div className="country-grid">
          {countries.map((c, i) => (
            <div className="country-card" key={c.code || c.name}>
              <div className="country-top">
                <span className="country-flag">{flag(c.code)}</span>
                <span className="country-rank">#{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h4>{c.name}</h4>
              <div className="cnt"><b>{c.count}</b> available leads</div>
              <div className="vol-bar"><span style={{ width: `${c.share}%` }} /></div>
              <div className="country-meta">
                <span>{c.cities}</span>
                <span>{c.verified}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="footnote">
          <span><span className="live-pulse" />Ranked by available lead volume</span>
          <Link to={isAuthenticated ? "/app/search" : "/signup"}>Explore global leads →</Link>
        </div>
      </section>

      {/* LEAD TYPES */}
      <section className="block" id="types">
        <div className="section-head">
          <span className="kicker">Leads for every goal</span>
          <h2>One directory.<br /><em>Endless possibilities.</em></h2>
          <p>Choose the audience that fits your strategy, then turn accurate data into your next conversation.</p>
        </div>
        <div className="types-grid">
          {LEAD_TYPES.map((type, idx) => (
            <div
              key={type.title}
              className="type-card"
              style={{ "--accent": type.accent, "--soft": type.soft }}
              onMouseMove={handleTypeCardMove}
            >
              <div className="type-head">
                <span className="type-ic">{type.icon}</span>
                <span className="type-idx">0{idx + 1}</span>
              </div>
              <h3>{type.title}</h3>
              <p>{type.text}</p>
              <div className="type-avail">
                <b>{type.available}</b>
                <span>Available</span>
                <span className="arr">→</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="block" id="features">
        <div className="section-head left">
          <span className="kicker">The platform</span>
          <h2>Everything clicks<br /><em>into place.</em></h2>
          <p>Less time hunting. More time building relationships that matter.</p>
        </div>
        <div className="feat-grid">
          {FEATURES.map((f) => (
            <div className="feat-card" key={f.title}>
              <div className="feat-top">
                <span className="feat-ic">{f.icon}</span>
                <span className="feat-num">{f.num}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="block" id="how-it-works">
        <div className="section-head">
          <span className="kicker">A simple start</span>
          <h2>From zero to<br /><em>your next lead.</em></h2>
          <p>Everything you need to start a conversation, without the busywork.</p>
        </div>
        <div className="steps-row">
          {STEPS.map((s, index) => (
            <div className="step-card" key={s.title}>
              <div className="step-num">{s.num}</div>
              <span className="step-ic">{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              {index < 2 && <span className="step-connector">→</span>}
            </div>
          ))}
        </div>
      </section>

      {/* SECURITY */}
      <section className="block" id="security" style={{ paddingTop: 0 }}>
        <div className="security-band">
          <span className="sec-ic">🛡️</span>
          <div>
            <span className="kicker" style={{ marginBottom: "6px" }}>Trust, always</span>
            <h3>Enterprise-grade security, quietly working in the background.</h3>
            <p>Argon2id password hashing · JWT access + httpOnly refresh cookies · deny-by-default RBAC · Redis rate limiting · server-side PII masking.</p>
          </div>
          <span className="sec-check">✓</span>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <span className="kicker">Your next chapter</span>
        <h2>Good leads are<br /><em>closer than you think.</em></h2>
        <p>Join the directory built to make prospecting feel human again.</p>
        <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <Link className="btn-cta-light" to="/admin">
                  <LayoutDashboard size={17} /> Open Dashboard →
                </Link>
              )}
              <Link className={isAdmin ? "btn-outline" : "btn-cta-light"} to="/app/search">
                Start exploring free →
              </Link>
            </>
          ) : (
            <>
              <Link className="btn-cta-light" to="/signup">Start exploring free →</Link>
              <Link className="btn-outline" to="/login">Log in</Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
