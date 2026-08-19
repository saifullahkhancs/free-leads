const FULL_ACCESS_ROLES = new Set(["admin", "super_admin"]);

function hasFullLeadAccess(user) {
  return Boolean(user && (user.roles || []).some((role) => FULL_ACCESS_ROLES.has(role)));
}

function getPrivilegedLeadVisibility(user) {
  if (!hasFullLeadAccess(user)) return null;
  return {
    show_email: true,
    show_phone: true,
    show_linkedin: true,
    show_twitter: true,
    show_website: true,
    show_about: true,
    can_view_contact: true,
    is_paid: true,
    has_full_access: true,
  };
}

module.exports = { hasFullLeadAccess, getPrivilegedLeadVisibility };
