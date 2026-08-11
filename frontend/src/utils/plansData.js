export const DEFAULT_PLANS = [
  {
    code: "free",
    name: "Free",
    price_cents: 0,
    billing_cycle: "monthly",
    daily_search_quota: 3,
    daily_export_quota: 500,
    max_export_per_req: 500,
    allowed_formats: ["excel"],
    can_view_contact: false,
    show_email: false,
    show_phone: false,
    show_linkedin: false,
    show_twitter: false,
    show_website: false,
    show_about: false,
    is_default: true,
    is_popular: false,
    description: "Get started with basic access – perfect for trying out the platform.",
    cta_text: "Start Free",
    cta_url: "https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?flapp_plan=free",
  },
  {
    code: "starter",
    name: "Starter",
    price_cents: 2900,
    billing_cycle: "monthly",
    daily_search_quota: 10,
    daily_export_quota: 4500,
    max_export_per_req: 500,
    allowed_formats: ["csv", "excel"],
    can_view_contact: true,
    show_email: true,
    show_phone: true,
    show_linkedin: true,
    show_twitter: true,
    show_website: true,
    show_about: true,
    is_default: false,
    is_popular: false,
    description: "Perfect for solo founders & small agencies getting started.",
    cta_text: "Select Plan",
    cta_url: "https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?redirect_to=https://peachpuff-kingfisher-714348.hostingersite.com/membership-levels/",
  },
  {
    code: "growth",
    name: "Growth",
    price_cents: 4900,
    billing_cycle: "monthly",
    daily_search_quota: 50,
    daily_export_quota: 10000,
    max_export_per_req: 1000,
    allowed_formats: ["csv", "excel", "pdf"],
    can_view_contact: true,
    show_email: true,
    show_phone: true,
    show_linkedin: true,
    show_twitter: true,
    show_website: true,
    show_about: true,
    is_default: false,
    is_popular: true,
    description: "For growing teams that need volume, speed & flexibility.",
    cta_text: "Select Plan",
    cta_url: "https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?redirect_to=https://peachpuff-kingfisher-714348.hostingersite.com/membership-levels/",
  },
  {
    code: "pro",
    name: "Pro",
    price_cents: 19900,
    billing_cycle: "monthly",
    daily_search_quota: 100,
    daily_export_quota: 40000,
    max_export_per_req: 5000,
    allowed_formats: ["csv", "excel", "pdf", "json"],
    can_view_contact: true,
    show_email: true,
    show_phone: true,
    show_linkedin: true,
    show_twitter: true,
    show_website: true,
    show_about: true,
    is_default: false,
    is_popular: false,
    description: "For power users who want zero limits and full access.",
    cta_text: "Select Plan",
    cta_url: "https://peachpuff-kingfisher-714348.hostingersite.com/u-wU5yHgnUXt/?redirect_to=https://peachpuff-kingfisher-714348.hostingersite.com/membership-levels/",
  },
];

export function mergePlansWithDefaults(apiPlans) {
  if (!apiPlans || !Array.isArray(apiPlans) || apiPlans.length === 0) {
    return DEFAULT_PLANS;
  }

  const defaultByCode = new Map(DEFAULT_PLANS.map((p) => [p.code, p]));

  // Build merged array ensuring existing order + any new admin-created custom plans
  const orderedCodes = ["free", "starter", "growth", "pro"];
  const apiByCode = new Map(apiPlans.map((p) => [p.code, p]));

  const merged = orderedCodes.map((code) => {
    const apiPlan = apiByCode.get(code);
    const defPlan = defaultByCode.get(code) || DEFAULT_PLANS[0];

    if (!apiPlan) return defPlan;

    return {
      ...defPlan,
      ...apiPlan,
      description: apiPlan.description || defPlan.description,
      cta_text: apiPlan.cta_text || defPlan.cta_text,
      cta_url: apiPlan.cta_url || defPlan.cta_url,
      is_popular: apiPlan.is_popular !== undefined ? Boolean(apiPlan.is_popular) : defPlan.is_popular,
      allowed_formats:
        apiPlan.allowed_formats && apiPlan.allowed_formats.length > 0
          ? apiPlan.allowed_formats
          : defPlan.allowed_formats,
      show_email: apiPlan.show_email !== undefined ? Boolean(apiPlan.show_email) : Boolean(defPlan.show_email),
      show_phone: apiPlan.show_phone !== undefined ? Boolean(apiPlan.show_phone) : Boolean(defPlan.show_phone),
      show_linkedin:
        apiPlan.show_linkedin !== undefined
          ? Boolean(apiPlan.show_linkedin)
          : Boolean(defPlan.show_linkedin),
      show_twitter:
        apiPlan.show_twitter !== undefined ? Boolean(apiPlan.show_twitter) : Boolean(defPlan.show_twitter),
      show_website:
        apiPlan.show_website !== undefined ? Boolean(apiPlan.show_website) : Boolean(defPlan.show_website),
      show_about:
        apiPlan.show_about !== undefined ? Boolean(apiPlan.show_about) : Boolean(defPlan.show_about),
    };
  });

  // Include any extra custom plans created by admin that aren't in the default 4
  apiPlans.forEach((p) => {
    if (!orderedCodes.includes(p.code)) {
      merged.push({
        ...p,
        description: p.description || "Custom membership tier",
        cta_text: p.cta_text || "Select Plan",
        cta_url: p.cta_url || "",
        allowed_formats: p.allowed_formats || ["excel"],
        show_email: p.show_email !== undefined ? Boolean(p.show_email) : Boolean(p.can_view_contact),
        show_phone: p.show_phone !== undefined ? Boolean(p.show_phone) : Boolean(p.can_view_contact),
        show_linkedin: p.show_linkedin !== undefined ? Boolean(p.show_linkedin) : Boolean(p.can_view_contact),
        show_twitter: p.show_twitter !== undefined ? Boolean(p.show_twitter) : Boolean(p.can_view_contact),
        show_website: p.show_website !== undefined ? Boolean(p.show_website) : Boolean(p.can_view_contact),
        show_about: p.show_about !== undefined ? Boolean(p.show_about) : Boolean(p.can_view_contact),
      });
    }
  });

  return merged;
}
