/* Avatar palette drawn from the brand accents: indigo, blue, purple, cyan,
   pink and orange. Deterministic per name, so an avatar never changes colour
   between renders. */
const AVATAR_COLORS = ["#4F46E5", "#2563EB", "#7C3AED", "#06B6D4", "#EC4899", "#F59E0B", "#6366F1", "#0EA5E9"];

export function initialsOf(person = {}) {
  const p = person || {};
  const name = p.full_name || [p.firstName, p.lastName].filter(Boolean).join(" ");
  if (name) {
    const parts = name.trim().split(/\s+/);
    const init = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
    if (init) return init;
  }
  return "?";
}

export function avatarColor(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function locationString(lead = {}) {
  return [lead.city_name, lead.region_name, lead.country_name].filter(Boolean).join(", ");
}

export function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function roleLabel(role = "") {
  return role.replace(/_/g, " ").toUpperCase();
}

/**
 * Presentational tint for a lead category badge.
 *
 * Purely visual: it maps a category name onto one of the design-system badge
 * variants. Unknown categories fall back to the neutral indigo badge, so new
 * categories coming from the API always render correctly.
 */
const CATEGORY_BADGE_VARIANTS = [
  { match: /(design|creative|art|media|brand)/i, variant: "indigo" },
  { match: /(finance|bank|account|invest|insur)/i, variant: "green" },
  { match: /(tech|software|it|engineer|data|develop)/i, variant: "blue" },
  { match: /(marketing|advertis|growth|sales|pr\b)/i, variant: "pink" },
  { match: /(health|medical|clinic|pharma|care)/i, variant: "cyan" },
  { match: /(retail|commerce|consumer|hospitality|food)/i, variant: "orange" },
  { match: /(education|legal|nonprofit|government|real estate)/i, variant: "purple" },
];

export function categoryBadgeVariant(category = "") {
  const name = String(category || "");
  if (!name) return "indigo";
  const hit = CATEGORY_BADGE_VARIANTS.find((c) => c.match.test(name));
  return hit ? hit.variant : "indigo";
}
