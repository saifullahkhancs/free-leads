import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Crown,
  HelpCircle,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api/client";
import { mergePlansWithDefaults } from "../utils/plansData";
import PlanFeaturesList from "../components/PlanFeaturesList";

// Visual identity per tier (accent colour + icon). Purely presentational —
// no pricing/billing data is fabricated here.
const PLAN_META = {
  free: { icon: Zap, accent: "#4F46E5", soft: "rgba(79,70,229,0.14)", tag: "For trying it out" },
  starter: { icon: Rocket, accent: "#2563EB", soft: "rgba(37,99,235,0.14)", tag: "For solo founders" },
  growth: { icon: TrendingUp, accent: "#4F46E5", soft: "rgba(79,70,229,0.12)", tag: "For growing teams" },
  pro: { icon: Crown, accent: "#7C3AED", soft: "rgba(124,58,237,0.14)", tag: "For power users" },
};

const TRUST_ROW = [
  "Cancel anytime",
  "Secure checkout",
  "No hidden fees",
  "7-day money-back guarantee",
];

export default function PlansPage() {
  const { isAuthenticated } = useAuth();
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

  return (
    <div className="landing plans-page">
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
                const meta = PLAN_META[plan.code] || PLAN_META.starter;
                const Icon = meta.icon;

                return (
                  <div
                    key={plan.code}
                    className={`billing-plan-card${isPopular ? " popular" : ""}${
                      isCurrent ? " current" : ""
                    }`}
                  >
                    {isPopular && !isCurrent && (
                      <span className="billing-plan-tag popular-tag">
                        <Sparkles size={12} /> Most Popular
                      </span>
                    )}
                    {isCurrent && (
                      <span className="billing-plan-tag current-tag">
                        <BadgeCheck size={12} /> Current Plan
                      </span>
                    )}

                    <div className="billing-plan-head">
                      <span
                        className="billing-plan-icon"
                        style={{ background: meta.soft, color: meta.accent }}
                      >
                        <Icon size={20} />
                      </span>
                      <div>
                        <h3>{plan.name}</h3>
                        <span className="billing-plan-tagline">{meta.tag}</span>
                      </div>
                    </div>

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

            <div className="plans-trust-row">
              {TRUST_ROW.map((item) => (
                <span key={item}>
                  <ShieldCheck size={14} /> {item}
                </span>
              ))}
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
    </div>
  );
}
