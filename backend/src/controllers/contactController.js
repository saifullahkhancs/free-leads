const { query } = require("../config/db");
const auditService = require("../services/auditService");
const { sendContactNotificationToTeam, sendContactReplyEmail, EmailDeliveryError } = require("../services/emailService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

// ----------------------------------------------------------------------
// Public — submit a contact form message
// ----------------------------------------------------------------------
const submitContact = asyncHandler(async (req, res) => {
  const { fullName, email, subject, message } = req.body;

  const { rows } = await query(
    `INSERT INTO contact_messages
       (full_name, email, subject, message, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [
      fullName,
      email,
      subject,
      message,
      req.ip || null,
      (req.headers["user-agent"] || "").slice(0, 2000) || null,
    ]
  );

  // Best-effort notification to the support team. The DB row is the source
  // of truth; if email fails we still respond 201 to the visitor.
  try {
    await sendContactNotificationToTeam({ fullName, email, subject, message });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[contact] team notification email failed:", err.message);
  }

  await auditService.log({
    actorId: req.user?.id || null,
    action: "contact_submit",
    entityType: "contact_message",
    entityId: rows[0].id,
    metadata: { email, subject },
    ip: req.ip,
  });

  res.status(201).json({
    status: "success",
    data: {
      id: rows[0].id,
      created_at: rows[0].created_at,
      message: "Your message has been received. We'll get back to you soon.",
    },
  });
});

// ----------------------------------------------------------------------
// Admin — list messages (with optional status filter + pagination)
// ----------------------------------------------------------------------
const listMessages = asyncHandler(async (req, res) => {
  const { status, limit, offset } = req.query;
  const params = [];
  const where = [];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows: messages } = await query(
    `SELECT id, full_name, email, subject, message, status,
            admin_reply, replied_at, replied_by,
            ip_address, created_at, updated_at
     FROM contact_messages
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const countParams = [];
  const countWhere = [];
  if (status) {
    countParams.push(status);
    countWhere.push(`status = $${countParams.length}`);
  }
  const countSql = countWhere.length ? `WHERE ${countWhere.join(" AND ")}` : "";
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM contact_messages ${countSql}`,
    countParams
  );

  res.status(200).json({
    status: "success",
    data: {
      messages,
      total: countRows[0].total,
      limit,
      offset,
    },
  });
});

// ----------------------------------------------------------------------
// Admin — get a single message (also marks it as 'read')
// ----------------------------------------------------------------------
const getMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT id, full_name, email, subject, message, status,
            admin_reply, replied_at, replied_by,
            ip_address, user_agent, created_at, updated_at
     FROM contact_messages WHERE id = $1`,
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Message not found");

  // Auto-mark as 'read' when first opened (only if it's still 'new')
  if (rows[0].status === "new") {
    await query(
      `UPDATE contact_messages SET status = 'read', updated_at = now() WHERE id = $1 AND status = 'new'`,
      [id]
    );
    rows[0].status = "read";
  }

  res.status(200).json({ status: "success", data: rows[0] });
});

// ----------------------------------------------------------------------
// Admin — update a message (status and/or send a reply)
// ----------------------------------------------------------------------
const updateMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, admin_reply } = req.body;

  const { rows: existingRows } = await query(
    `SELECT id, full_name, email, subject, status FROM contact_messages WHERE id = $1`,
    [id]
  );
  if (!existingRows[0]) throw new ApiError(404, "Message not found");
  const existing = existingRows[0];

  // If a reply is being sent, deliver the email and stamp the message.
  let replySentAt = null;
  if (admin_reply && admin_reply.trim().length > 0) {
    try {
      await sendContactReplyEmail({
        to: existing.email,
        fullName: existing.full_name,
        subject: `Re: ${existing.subject}`,
        originalSubject: existing.subject,
        reply: admin_reply,
      });
      replySentAt = new Date();
    } catch (err) {
      if (err instanceof EmailDeliveryError) {
        throw new ApiError(503, "Reply could not be sent via email. Please try again.");
      }
      throw err;
    }
  }

  const newStatus = status || (replySentAt ? "replied" : existing.status);

  const { rows } = await query(
    `UPDATE contact_messages
       SET status = $1,
           admin_reply = COALESCE($2, admin_reply),
           replied_at = COALESCE($3, replied_at),
           replied_by = COALESCE($4, replied_by),
           updated_at = now()
     WHERE id = $5
     RETURNING *`,
    [newStatus, admin_reply || null, replySentAt, req.user.id, id]
  );

  await auditService.log({
    actorId: req.user.id,
    action: replySentAt ? "contact_reply" : "contact_status_update",
    entityType: "contact_message",
    entityId: id,
    metadata: { status: newStatus, replied: Boolean(replySentAt) },
    ip: req.ip,
  });

  res.status(200).json({ status: "success", data: rows[0] });
});

// ----------------------------------------------------------------------
// Admin — quick stats for the dashboard tile
// ----------------------------------------------------------------------
const getStats = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
       COUNT(*) FILTER (WHERE status = 'read')::int AS read_count,
       COUNT(*) FILTER (WHERE status = 'replied')::int AS replied_count,
       COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS last_7_days
     FROM contact_messages`
  );
  res.status(200).json({ status: "success", data: rows[0] });
});

module.exports = {
  submitContact,
  listMessages,
  getMessage,
  updateMessage,
  getStats,
};
