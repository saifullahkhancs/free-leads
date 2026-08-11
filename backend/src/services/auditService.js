const { query } = require("../config/db");

/**
 * auditService — writes to the (previously dead) audit_logs table so every
 * security-relevant action leaves a trail. Translated from the WP plugins'
 * flapp_audit_log().
 *
 * Actions we record:
 *   register_ok, login_ok, login_fail, google_login_ok, verify_email,
 *   forgot_password, reset_password, lead_export, role_changed, user_active,
 *   user_created, lead_import, quota_exceeded
 */
async function log({
  actorId = null,
  action,
  entityType = null,
  entityId = null,
  metadata = null,
  ip = null,
}) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null, ip]
    );
  } catch (err) {
    // Never let an audit write failure take down a request.
    // eslint-disable-next-line no-console
    console.warn("auditService: failed to write audit log", err.message);
  }
}

/**
 * Admin helper: read the audit trail (optionally filtered).
 */
async function getAuditLogs({ limit = 100, action, actorId } = {}) {
  const values = [];
  let where = "WHERE 1=1";
  let idx = 1;

  if (action) {
    where += ` AND al.action = $${idx++}`;
    values.push(action);
  }
  if (actorId) {
    where += ` AND al.actor_id = $${idx++}`;
    values.push(actorId);
  }
  values.push(Math.min(limit, 500));

  const { rows } = await query(
    `SELECT al.id, al.action, al.entity_type, al.entity_id, al.metadata,
            al.ip_address, al.created_at,
            u.email AS actor_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${idx}`,
    values
  );
  return rows;
}

module.exports = { log, getAuditLogs };
