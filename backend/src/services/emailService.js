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

module.exports = {
  EmailDeliveryError,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
