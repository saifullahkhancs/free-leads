import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  LayoutDashboard,
  LogIn,
  LogOut,
  Sparkles,
  Target,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api/client";
import { initialsOf } from "../utils/format";
import { mergePlansWithDefaults } from "../utils/plansData";
import PlanFeaturesList from "../components/PlanFeaturesList";

export default function PlansPage() {
  const { isAuthenticated, user, logout } = useAuth();
  const [plans, setPlans] = useState(() => mergePlansWithDefaults([]));
  const [activePlanCode, setActivePlanCode] = useState("free");

  useEffect(() => {
    async function loadPlans() {
      try {
        const res = await api.getPlans();
        const merged = mergePlansWithDefaults(res?.data || []);
        setPlans(merged);
      } catch {
        // Fallback to default plans already in state
      }

      if (isAuthenticated) {
        try {
          const billingRes = await api.getMyBilling();
          const currentCode =
            billingRes?.data?.subscription?.plan_code ||
            billingRes?.data?.quota?.plan?.code ||
            "free";
          setActivePlanCode(currentCode);
        } catch {
          setActivePlanCode("free");
        }
      }
    }
    loadPlans();
  }, [isAuthenticated]);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  return (
    <div className="landing plans-page">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link to="/" className="brand">
            <span className="brand-badge">
              <Target size={18} />
            </span>
            <span className="brand-name">
              free<span>leads</span>
            </span>
          </Link>
          <nav className="landing-nav">
            <Link to="/#features">Platform</Link>
            <Link to="/#how-it-works">How it works</Link>
            <Link to="/#security">Security</Link>
            <Link to="/plans" className="active">
              Plans
            </Link>
          </nav>
          <div className="landing-auth-actions">
            {isAuthenticated ? (
              <>
                <div className="landing-user">
                  <span className="landing-avatar">{initialsOf(user)}</span>
                  <span className="landing-user-meta">
                    <strong>
                      {[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User"}
                    </strong>
                    <small>{user?.email}</small>
                  </span>
                </div>
                <Link to="/admin" className="btn btn-outline">
                  <LayoutDashboard size={15} /> <span className="btn-text">Dashboard</span>
                </Link>
                <Link to="/app" className="btn btn-primary">
                  <span className="btn-text">App</span> <ArrowRight size={15} />
                </Link>
                <button
                  onClick={handleLogout}
                  className="btn btn-logout"
                  title="Log out"
                >
                  <LogOut size={15} /> <span className="logout-text">Log out</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost">
                  <LogIn size={15} /> Log in
                </Link>
                <Link to="/signup" className="btn btn-primary">
                  Start for free <ArrowRight size={15} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero plans-hero-section">
          <div className="hero-grid-bg" />
          <div className="landing-container">
            <div className="section-heading center">
              <span className="hero-badge">
                <span className="pulse-dot" /> Transparent pricing
              </span>
              <h1>
                Plans built for <br />
                <span className="accent">every prospecting scale.</span>
              </h1>
              <p className="hero-sub" style={{ margin: "16px auto 0", maxWidth: 640 }}>
                Choose a plan that fits how many leads you search and export each day.
                Upgrade, downgrade, or cancel anytime.
              </p>
            </div>

            <div className="plans-grid-container">
              {plans.map((plan) => {
                const isCurrent = isAuthenticated && plan.code === activePlanCode;
                const isPopular = Boolean(plan.is_popular || plan.code === "growth");

                return (
                  <div
                    key={plan.code}
                    className={`billing-plan-card${isPopular ? " popular" : ""}${
                      isCurrent ? " current" : ""
                    }`}
                  >
                    {isPopular && !isCurrent && (
                      <span className="billing-plan-tag popular-tag">
                        <Sparkles size={12} style={{ display: "inline", marginRight: 4 }} />
                        Most Popular
                      </span>
                    )}
                    {isCurrent && (
                      <span className="billing-plan-tag current-tag">Current Plan</span>
                    )}
                    <h3>{plan.name}</h3>
                    <div className="billing-price">
                      ${(plan.price_cents / 100).toFixed(0)}
                      <span>/month</span>
                    </div>
                    <p className="billing-plan-desc">{plan.description}</p>

                    <PlanFeaturesList plan={plan} />

                    <div className="plan-card-actions">
                      <a
                        href={plan.cta_url}
                        className={`billing-btn ${
                          isPopular || plan.code === "free"
                            ? "billing-btn-primary"
                            : "billing-btn-outline"
                        }`}
                      >
                        {plan.cta_text}
                      </a>
                      {isAuthenticated && (
                        <Link to="/app/billing" className="plan-in-app-link">
                          {isCurrent ? "✓ Active plan in workspace" : "Manage in workspace →"}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-section landing-section-alt plans-faq-section">
          <div className="landing-container">
            <div className="section-heading center">
              <span className="section-kicker">QUESTIONS & ANSWERS</span>
              <h2>Everything you need to know</h2>
              <p>Simple answers to common billing and format questions.</p>
            </div>
            <div className="faq-grid">
              <div className="faq-item">
                <h3><HelpCircle size={17} /> Can I switch plans anytime?</h3>
                <p>Yes. You can upgrade or cancel your plan at any time. When upgrading, your new search and export quotas activate immediately.</p>
              </div>
              <div className="faq-item">
                <h3><HelpCircle size={17} /> Which export formats are included?</h3>
                <p>Free members can download spreadsheets in EXCEL format. Starter unlocks CSV and EXCEL. Growth adds PDF reports, and Pro includes CSV, EXCEL, PDF, and JSON.</p>
              </div>
              <div className="faq-item">
                <h3><HelpCircle size={17} /> How do daily quotas work?</h3>
                <p>Your search and export counts reset every 24 hours. The Pro tier provides unlimited daily searches and exports.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-container landing-cta-inner">
            <span className="section-kicker">GET STARTED TODAY</span>
            <h2>
              Ready to find <br />
              <em>better leads?</em>
            </h2>
            <p>Join Free Leads and start exploring profiles across 195 countries.</p>
            <div className="hero-ctas center">
              {isAuthenticated ? (
                <>
                  <Link to="/app" className="btn btn-light btn-lg">
                    Open Directory <ArrowRight size={18} />
                  </Link>
                  <Link to="/app/billing" className="btn btn-outline-light btn-lg">
                    My Billing
                  </Link>
                </>
              ) : (
                <>
                  <a
                    href="https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?flapp_plan=free"
                    className="btn btn-light btn-lg"
                  >
                    Start Free <ArrowRight size={18} />
                  </a>
                  <Link to="/login" className="btn btn-outline-light btn-lg">
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <Link to="/" className="brand">
            <span className="brand-badge">
              <Target size={14} />
            </span>
            <span className="brand-name">
              free<span>leads</span>
            </span>
          </Link>
          <div className="footer-links">
            <Link to="/#features">Platform</Link>
            <Link to="/#how-it-works">How it works</Link>
            <Link to="/#security">Security</Link>
            <Link to="/plans">Plans</Link>
          </div>
          <p>© {new Date().getFullYear()} Free Leads · Find better. Connect sooner.</p>
        </div>
      </footer>
    </div>
  );
}
