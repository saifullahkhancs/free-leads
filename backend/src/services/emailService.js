const nodemailer = require("nodemailer");
const env = require("../config/env");

class EmailDeliveryError extends Error {}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false, // STARTTLS on 587
      auth: {
        user: env.SMTP_USERNAME,
        pass: env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html }) {
  // In local/dev, if no SMTP password is configured, just log instead of
  // failing the request — keeps register/login usable without Resend set up.
  if (!env.SMTP_PASSWORD) {
    // eslint-disable-next-line no-console
    console.log(`[emailService] (dev, no SMTP_PASSWORD set) would send to ${to}: ${subject}`);
    // eslint-disable-next-line no-console
    console.log(`[emailService] dev message body: ${html}`);
    return;
  }
  try {
    await getTransporter().sendMail({
      from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    throw new EmailDeliveryError(err.message);
  }
}

async function sendVerificationEmail(email, code) {
  await sendMail({
    to: email,
    subject: "Verify your email",
    html: `<p>Your verification code is:</p><h2>${code}</h2><p>This code expires in ${env.VERIFICATION_CODE_TTL_MINUTES} minutes.</p>`,
  });
}

async function sendPasswordResetEmail(email, resetLink) {
  await sendMail({
    to: email,
    subject: "Reset your password",
    html: `<p>Click the link below to reset your password. This link expires in ${env.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.</p><p><a href="${resetLink}">${resetLink}</a></p>`,
  });
}

/**
 * Notify the support inbox that a new contact-form message has been received.
 * The original submission is always persisted in the database (contact_messages)
 * so this email is purely a heads-up — failure to send it does not lose data.
 */
async function sendContactNotificationToTeam({ fullName, email, subject, message, recipient }) {
  const to = recipient || env.CONTACT_TO_EMAIL || env.SMTP_FROM_EMAIL;
  if (!to) {
    // eslint-disable-next-line no-console
    console.log("[emailService] No CONTACT_TO_EMAIL / SMTP_FROM_EMAIL configured; skipping team notification.");
    return;
  }
  const html = `
    <div style="font-family: Manrope, system-ui, sans-serif; color: #15231f; line-height: 1.55;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #1d4b3f;">New contact form submission</h2>
      <p style="margin: 0 0 4px;"><strong>From:</strong> ${escapeHtml(fullName)} &lt;${escapeHtml(email)}&gt;</p>
      <p style="margin: 0 0 4px;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <hr style="border: none; border-top: 1px solid #dce3da; margin: 14px 0;" />
      <p style="white-space: pre-wrap; margin: 0;">${escapeHtml(message)}</p>
      <p style="margin-top: 18px; font-size: 12px; color: #687671;">
        Manage this message from the Free Leads admin dashboard → Support → Contact Messages.
      </p>
    </div>
  `;
  await sendMail({
    to,
    subject: `[Contact] ${subject} — ${fullName}`,
    html,
  });
}

/** Send a reply to a contact-form submitter from the admin dashboard. */
async function sendContactReplyEmail({ to, fullName, subject, reply, originalSubject }) {
  const html = `
    <div style="font-family: Manrope, system-ui, sans-serif; color: #15231f; line-height: 1.55;">
      <p>Hi ${escapeHtml(fullName)},</p>
      <p>Thanks for reaching out. Here's a reply from the Free Leads team regarding your message
        "${escapeHtml(originalSubject)}":</p>
      <div style="border-left: 3px solid #7c9a3f; padding: 8px 14px; background: #f6f7f2; margin: 12px 0; white-space: pre-wrap;">
        ${escapeHtml(reply)}
      </div>
      <p style="margin-top: 18px;">If you have anything else to add, just reply to this email.</p>
      <p>— The Free Leads team</p>
    </div>
  `;
  await sendMail({
    to,
    subject: subject || "We received your message",
    html,
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  EmailDeliveryError,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendContactNotificationToTeam,
  sendContactReplyEmail,
};
