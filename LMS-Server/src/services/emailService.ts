/**
 * Email service — powered by Stalwart SMTP (nodemailer) when SMTP_HOST is set.
 * If SMTP_HOST is absent the email is logged to stdout so the feature
 * degrades gracefully in development / unconfigured environments.
 *
 * Phase 22 C3: templates are now loaded from the email_templates table via
 * renderTemplate(). Inline HTML is kept as a fallback if the template row
 * is missing (safety net for fresh installs before seed runs).
 */

import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import { renderTemplate } from './emailTemplateService.js';
import { db } from '../config/database.js';

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
      tls: { servername: 'mail.smwebsystems.com' }, // FIND-027-01: proper TLS validation (CRM pattern)
    })
  : null;

/** Escape HTML special characters to prevent injection in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Outbox helpers (durable email delivery — FIND-027-02) ────────────

/** Insert an email into the outbox. Returns the row id (0 if duplicate idempotency key). */
export function insertOutboxEntry(
  emailType: string,
  recipient: string,
  subject: string,
  htmlBody: string,
  idempotencyKey?: string,
): number {
  const database = db;
  const stmt = idempotencyKey
    ? database.prepare(`
        INSERT OR IGNORE INTO email_outbox (email_type, recipient, subject, html_body, idempotency_key)
        VALUES (?, ?, ?, ?, ?)
      `)
    : database.prepare(`
        INSERT INTO email_outbox (email_type, recipient, subject, html_body)
        VALUES (?, ?, ?, ?)
      `);
  const args = idempotencyKey
    ? [emailType, recipient, subject, htmlBody, idempotencyKey]
    : [emailType, recipient, subject, htmlBody];
  const result = stmt.run(...args);
  return Number(result.lastInsertRowid);
}

export function markOutboxSent(id: number): void {
  const database = db;
  database.prepare(`
    UPDATE email_outbox SET status = 'sent', last_attempt_at = datetime('now') WHERE id = ?
  `).run(id);
}

export function markOutboxFailed(id: number, error: string): void {
  const database = db;
  database.prepare(`
    UPDATE email_outbox SET status = 'failed', error_message = ?, last_attempt_at = datetime('now') WHERE id = ?
  `).run(error, id);
}

const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'LMS <onboarding@example.com>';
const LMS_NAME = process.env.LMS_NAME ?? 'SM Web Systems LMS';
const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');

function log(subject: string, to: string, body: string): void {
  logger.info({ module: 'emailService', to, subject }, `Would send email → ${to}`);
}

export async function sendEnrollmentEmail(opts: {
  to: string;
  name: string;
  courseName: string;
}): Promise<void> {
  const { to, name, courseName } = opts;

  // Try database template first
  const rendered = renderTemplate('enrollment', {
    studentName: name,
    courseName,
    lmsName: LMS_NAME,
    loginUrl: `${FRONTEND_URL}/login`,
  });

  const subject = rendered?.subject ?? `You've been enrolled in ${courseName}`;
  const html = rendered?.html ?? `
    <p>Hi ${escapeHtml(name)},</p>
    <p>You have been enrolled in <strong>${escapeHtml(courseName)}</strong> on <strong>${escapeHtml(LMS_NAME)}</strong>.</p>
    <p><a href="${FRONTEND_URL}/login" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Sign in to access your course</a></p>
    <p>If you have questions, contact your administrator.</p>
  `.trim();

  const outboxId = insertOutboxEntry('enrollment', to, subject, html);
  if (!transporter) {
    markOutboxSent(outboxId);
    log(subject, to, `Enrolled in: ${courseName}. Login at ${FRONTEND_URL}/login`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
    markOutboxSent(outboxId);
  } catch (err) {
    markOutboxFailed(outboxId, err instanceof Error ? err.message : 'Unknown error');
    logger.error({ module: 'emailService', err, to, subject }, 'Failed to send enrollment email');
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<void> {
  const { to, name, resetUrl } = opts;

  const rendered = renderTemplate('password-reset', {
    userName: name,
    lmsName: LMS_NAME,
    resetUrl,
  });

  const subject = rendered?.subject ?? `Reset your ${LMS_NAME} password`;
  const html = rendered?.html ?? `
    <p>Hi ${escapeHtml(name)},</p>
    <p>We received a request to reset the password for your <strong>${escapeHtml(LMS_NAME)}</strong> account.</p>
    <p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Reset password</a></p>
    <p>Or copy this link into your browser:</p>
    <p><code style="word-break:break-all;">${resetUrl}</code></p>
    <p>This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
  `.trim();

  const outboxId = insertOutboxEntry('password-reset', to, subject, html);
  if (!transporter) {
    markOutboxSent(outboxId);
    log(subject, to, `Password reset URL (stdout fallback — set SMTP_HOST to send real emails):\n  ${resetUrl}`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
    markOutboxSent(outboxId);
  } catch (err) {
    markOutboxFailed(outboxId, err instanceof Error ? err.message : 'Unknown error');
    logger.error({ module: 'emailService', err, to, subject }, 'Failed to send password reset email');
  }
}

export async function sendCourseInviteEmail(opts: {
  to: string;
  courseName: string;
  inviteToken: string;
}): Promise<void> {
  const { to, courseName, inviteToken } = opts;
  const signupUrl = `${FRONTEND_URL}/sign-up?invite=${inviteToken}`;

  const rendered = renderTemplate('course-invitation', {
    courseName,
    lmsName: LMS_NAME,
    signupUrl,
  });

  const subject = rendered?.subject ?? `You've been invited to ${courseName}`;
  const html = rendered?.html ?? `
    <p>Hi,</p>
    <p>You have been invited to join <strong>${escapeHtml(courseName)}</strong> on <strong>${escapeHtml(LMS_NAME)}</strong>.</p>
    <p>Click the button below to create your account and access the course immediately:</p>
    <p><a href="${signupUrl}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Accept invitation &amp; sign up</a></p>
    <p>Or copy this link: <code>${signupUrl}</code></p>
    <p>This invitation link can be used once.</p>
  `.trim();

  const outboxId = insertOutboxEntry('course-invitation', to, subject, html);
  if (!transporter) {
    markOutboxSent(outboxId);
    log(subject, to, `Invite for: ${courseName}. Signup URL: ${signupUrl}`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
    markOutboxSent(outboxId);
  } catch (err) {
    markOutboxFailed(outboxId, err instanceof Error ? err.message : 'Unknown error');
    logger.error({ module: 'emailService', err, to, subject }, 'Failed to send course invite email');
  }
}

export async function sendPaymentReminderEmail(opts: {
  to: string;
  studentName: string;
  courseName: string;
  cohortName: string;
}): Promise<void> {
  const { to, studentName, courseName, cohortName } = opts;

  const rendered = renderTemplate('cohort-payment-reminder', {
    studentName,
    courseName,
    cohortName,
    lmsName: LMS_NAME,
    loginUrl: `${FRONTEND_URL}/login`,
  });

  const subject = rendered?.subject ?? `Payment reminder for ${courseName}`;
  const html = rendered?.html ?? `
    <p>Hi ${escapeHtml(studentName)},</p>
    <p>This is a reminder that payment is pending for <strong>${escapeHtml(courseName)}</strong> (cohort: ${escapeHtml(cohortName)}) on <strong>${escapeHtml(LMS_NAME)}</strong>.</p>
    <p><a href="${FRONTEND_URL}/login" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Sign in to complete payment</a></p>
    <p>If you have questions, contact your administrator.</p>
  `.trim();

  const outboxId = insertOutboxEntry('cohort-payment-reminder', to, subject, html);
  if (!transporter) {
    markOutboxSent(outboxId);
    log(subject, to, `Payment reminder for: ${courseName} (${cohortName})`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
    markOutboxSent(outboxId);
  } catch (err) {
    markOutboxFailed(outboxId, err instanceof Error ? err.message : 'Unknown error');
    logger.error({ module: 'emailService', err, to, subject }, 'Failed to send payment reminder email');
  }
}

export async function sendCertificateMintedEmail(opts: {
  to: string;
  name: string;
  courseName: string;
  credentialId: string;
  txHash: string;
  userId: string;
}): Promise<void> {
  const { to, name, courseName, credentialId, txHash, userId } = opts;

  // Respect notification preferences (nft_minted opt-out)
  const pref = db.prepare(
    'SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = ?'
  ).get(userId, 'nft_minted') as { enabled: number } | undefined;
  if (pref && pref.enabled === 0) return;

  const verifyUrl = `${FRONTEND_URL}/verify/${credentialId}`;
  const explorerUrl = `https://stellar.expert/explorer/public/tx/${txHash}`;

  const rendered = renderTemplate('certificate-minted', {
    studentName: name,
    courseName,
    verifyUrl,
    explorerUrl,
    lmsName: LMS_NAME,
  });

  const subject = rendered?.subject ?? `Your NFT Certificate for "${courseName}" Has Been Minted!`;
  const html = rendered?.html ?? `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Congratulations! Your NFT certificate for <strong>${escapeHtml(courseName)}</strong> has been minted on the Stellar blockchain.</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">View &amp; Verify Certificate</a></p>
    <p><a href="${explorerUrl}" style="display:inline-block;padding:10px 20px;background:#2d5a6b;color:#fff;border-radius:6px;text-decoration:none;margin-top:8px;">View on Blockchain Explorer</a></p>
    <p>Your certificate is permanently recorded on the blockchain and can be independently verified by anyone.</p>
    <p>— ${escapeHtml(LMS_NAME)}</p>
  `.trim();

  const outboxId = insertOutboxEntry('certificate-minted', to, subject, html);
  if (!transporter) {
    markOutboxSent(outboxId);
    log(subject, to, `Certificate minted for: ${courseName}. Verify: ${verifyUrl}`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
    markOutboxSent(outboxId);
  } catch (err) {
    markOutboxFailed(outboxId, err instanceof Error ? err.message : 'Unknown error');
    logger.error({ module: 'emailService', err, to, subject }, 'Failed to send certificate minted email');
  }
}
