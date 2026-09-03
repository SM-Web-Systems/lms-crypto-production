/**
 * Email retry worker — processes failed outbox entries with exponential backoff.
 *
 * FIND-027-02: Durable email delivery for the LMS. Failed emails are retried
 * up to max_retries times (default 3) with a 5-minute cool-down between attempts.
 * After exhausting retries the entry is marked 'abandoned'.
 */

import logger from '../utils/logger.js';

export interface RetryResult {
  retried: number;
  succeeded: number;
  abandoned: number;
}

interface OutboxEntry {
  id: number;
  email_type: string;
  recipient: string;
  subject: string;
  html_body: string;
  retry_count: number;
  max_retries: number;
}

let timer: ReturnType<typeof setInterval> | null = null;

export async function processEmailRetryQueue(): Promise<RetryResult> {
  // Lazy import to avoid circular init at module load
  const { db } = await import('../config/database.js');
  const result: RetryResult = { retried: 0, succeeded: 0, abandoned: 0 };

  const entries = db.prepare(`
    SELECT id, email_type, recipient, subject, html_body, retry_count, max_retries
    FROM email_outbox
    WHERE status = 'failed'
      AND retry_count < max_retries
      AND (last_attempt_at IS NULL OR last_attempt_at < datetime('now', '-5 minutes'))
  `).all() as OutboxEntry[];

  if (entries.length === 0) return result;

  // Lazy import nodemailer transporter check
  const nodemailer = await import('nodemailer');
  const SMTP_HOST = process.env.SMTP_HOST;
  if (!SMTP_HOST) {
    // No transporter — nothing to retry
    return result;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: false,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { servername: 'mail.smwebsystems.com' },
  });

  const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'LMS <onboarding@example.com>';

  for (const entry of entries) {
    // Claim: optimistic lock to prevent duplicate processing
    const claimed = db.prepare(`
      UPDATE email_outbox
      SET status = 'sending', last_attempt_at = datetime('now')
      WHERE id = ? AND status = 'failed' AND retry_count = ?
    `).run(entry.id, entry.retry_count);

    if (claimed.changes === 0) continue;

    result.retried++;

    try {
      await transporter.sendMail({
        from: FROM_ADDRESS,
        to: entry.recipient,
        subject: entry.subject,
        html: entry.html_body,
      });

      db.prepare(`
        UPDATE email_outbox
        SET status = 'sent', retry_count = retry_count + 1, last_attempt_at = datetime('now')
        WHERE id = ?
      `).run(entry.id);
      result.succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const newRetryCount = entry.retry_count + 1;

      if (newRetryCount >= entry.max_retries) {
        db.prepare(`
          UPDATE email_outbox
          SET status = 'abandoned', retry_count = ?, last_attempt_at = datetime('now'),
              abandoned_at = datetime('now'), error_message = ?
          WHERE id = ?
        `).run(newRetryCount, message, entry.id);
        result.abandoned++;
      } else {
        db.prepare(`
          UPDATE email_outbox
          SET status = 'failed', retry_count = ?, last_attempt_at = datetime('now'), error_message = ?
          WHERE id = ?
        `).run(newRetryCount, message, entry.id);
      }
    }
  }

  return result;
}

export function startEmailRetryWorker(intervalMs: number = 300_000): void {
  if (timer) return;
  logger.info({ module: 'emailRetryWorker', intervalSec: intervalMs / 1000 }, 'Email retry worker started');

  timer = setInterval(async () => {
    try {
      const result = await processEmailRetryQueue();
      if (result.retried > 0) {
        logger.info(
          { module: 'emailRetryWorker', ...result },
          `Processed ${result.retried} emails: ${result.succeeded} succeeded, ${result.abandoned} abandoned`,
        );
      }
    } catch (err) {
      logger.error({ module: 'emailRetryWorker', err }, 'Email retry worker error');
    }
  }, intervalMs);
  timer.unref();
}

export function stopEmailRetryWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info({ module: 'emailRetryWorker' }, 'Email retry worker stopped');
  }
}
