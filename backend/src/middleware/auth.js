const { verifyAccessToken } = require("../utils/security");
const { getUserPermissions } = require("../services/authService");
const ApiError = require("../utils/ApiError");

/**
 * Requires a valid Bearer access token. Populates req.user with
 * { id, email, roles } decoded from the token — no DB hit on the hot path.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new ApiError(401, "Not authenticated"));
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.token_type !== "access") throw new Error("wrong token type");
    req.user = { id: payload.sub, email: payload.email, roles: payload.roles || [] };
    next();
  } catch {
    next(new ApiError(401, "Could not validate credentials"));
  }
}

/** Same as authenticate(), but never rejects — req.user is null if absent/invalid. */
function authenticateOptional(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    req.user = null;
    return next();
  }
  try {
    const payload = verifyAccessToken(token);
    if (payload.token_type !== "access") throw new Error("wrong token type");
    req.user = { id: payload.sub, email: payload.email, roles: payload.roles || [] };
  } catch {
    req.user = null;
  }
  next();
}

/** Deny-by-default role check (Section 6: "Centralize permission checks in middleware, deny-by-default"). */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, "Not authenticated"));
    const hasRole = req.user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return next(new ApiError(403, "You do not have permission to perform this action"));
    }
    next();
  };
}

/**
 * Fine-grained permission check, resolved from role_permissions in Postgres.
 * Use this over requireRole() for anything beyond a coarse admin/user split.
 */
function requirePermission(...requiredPermissions) {
  return async (req, res, next) => {
    if (!req.user) return next(new ApiError(401, "Not authenticated"));
    try {
      const permissions = await getUserPermissions(req.user.id);
      const hasAll = requiredPermissions.every((p) => permissions.includes(p));
      if (!hasAll) {
        return next(new ApiError(403, "You do not have permission to perform this action"));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { authenticate, authenticateOptional, requireRole, requirePermission };
