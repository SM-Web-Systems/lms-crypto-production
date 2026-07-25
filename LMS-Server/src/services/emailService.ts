/**
 * Email service — powered by Stalwart SMTP (nodemailer) when SMTP_HOST is set.
 * If SMTP_HOST is absent the email is logged to stdout so the feature
 * degrades gracefully in development / unconfigured environments.
 */

import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const transporter = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,       // STARTTLS upgrade on port 587
      requireTLS: true,    // abort if server doesn't offer STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false }, // internal Docker network — cert hostname mismatch is expected
    })
  : null;

const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'LMS <onboarding@example.com>';
const LMS_NAME = process.env.LMS_NAME ?? 'SM Web Systems LMS';
const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');

function log(subject: string, to: string, body: string): void {
  console.log(`[emailService] Would send → ${to}\nSubject: ${subject}\n${body}\n`);
}

export async function sendEnrollmentEmail(opts: {
  to: string;
  name: string;
  courseName: string;
}): Promise<void> {
  const { to, name, courseName } = opts;
  const subject = `You've been enrolled in ${courseName}`;
  const html = `
    <p>Hi ${name},</p>
    <p>You have been enrolled in <strong>${courseName}</strong> on <strong>${LMS_NAME}</strong>.</p>
    <p><a href="${FRONTEND_URL}/login" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Sign in to access your course</a></p>
    <p>If you have questions, contact your administrator.</p>
  `.trim();

  if (!transporter) {
    log(subject, to, `Enrolled in: ${courseName}. Login at ${FRONTEND_URL}/login`);
    return;
  }
  await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<void> {
  const { to, name, resetUrl } = opts;
  const subject = `Reset your ${LMS_NAME} password`;
  const html = `
    <p>Hi ${name},</p>
    <p>We received a request to reset the password for your <strong>${LMS_NAME}</strong> account.</p>
    <p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Reset password</a></p>
    <p>Or copy this link into your browser:</p>
    <p><code style="word-break:break-all;">${resetUrl}</code></p>
    <p>This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
  `.trim();

  if (!transporter) {
    log(subject, to, `Password reset URL (stdout fallback — set SMTP_HOST to send real emails):\n  ${resetUrl}`);
    return;
  }
  await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
}

export async function sendCourseInviteEmail(opts: {
  to: string;
  courseName: string;
  inviteToken: string;
}): Promise<void> {
  const { to, courseName, inviteToken } = opts;
  const signupUrl = `${FRONTEND_URL}/sign-up?invite=${inviteToken}`;
  const subject = `You've been invited to ${courseName}`;
  const html = `
    <p>Hi,</p>
    <p>You have been invited to join <strong>${courseName}</strong> on <strong>${LMS_NAME}</strong>.</p>
    <p>Click the button below to create your account and access the course immediately:</p>
    <p><a href="${signupUrl}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Accept invitation &amp; sign up</a></p>
    <p>Or copy this link: <code>${signupUrl}</code></p>
    <p>This invitation link can be used once.</p>
  `.trim();

  if (!transporter) {
    log(subject, to, `Invite for: ${courseName}. Signup URL: ${signupUrl}`);
    return;
  }
  await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
}
