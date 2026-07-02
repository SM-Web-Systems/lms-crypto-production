/**
 * Email service — powered by Resend when RESEND_API_KEY is set.
 * If the key is absent the email is logged to stdout so the feature
 * degrades gracefully in development / unconfigured environments.
 */

import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'LMS <onboarding@resend.dev>';
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

  if (!resend) {
    log(subject, to, `Enrolled in: ${courseName}. Login at ${FRONTEND_URL}/login`);
    return;
  }
  await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
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

  if (!resend) {
    log(subject, to, `Invite for: ${courseName}. Signup URL: ${signupUrl}`);
    return;
  }
  await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
}
