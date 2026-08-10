const AVATAR_COLORS = ["#3fae8a", "#4667d8", "#d96b4d", "#b18b40", "#8b5ec7", "#2d9db8", "#c2546b", "#5a8a3f"];

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
