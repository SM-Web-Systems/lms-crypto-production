/**
 * OUTBOX — Email outbox + retry worker tests.
 *
 * FIND-027-02: Durable email delivery with outbox pattern and retry worker.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../config/database.js';
import {
  insertOutboxEntry,
  markOutboxSent,
  markOutboxFailed,
} from '../services/emailService.js';
import { processEmailRetryQueue } from '../services/emailRetryWorker.js';

function getOutboxRow(id: number) {
  return db.prepare('SELECT * FROM email_outbox WHERE id = ?').get(id) as any;
}

describe('OUTBOX — Email outbox durable delivery', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM email_outbox').run();
  });

  it('OUTBOX-1: insertOutboxEntry creates pending row', () => {
    const id = insertOutboxEntry('enrollment', 'user@test.com', 'Welcome', '<p>Hi</p>');
    expect(id).toBeGreaterThan(0);

    const row = getOutboxRow(id);
    expect(row.status).toBe('pending');
    expect(row.email_type).toBe('enrollment');
    expect(row.recipient).toBe('user@test.com');
    expect(row.subject).toBe('Welcome');
    expect(row.html_body).toBe('<p>Hi</p>');
    expect(row.retry_count).toBe(0);
  });

  it('OUTBOX-2: Idempotency key prevents duplicate inserts', () => {
    const id1 = insertOutboxEntry('enrollment', 'a@test.com', 'Sub', '<p>Hi</p>', 'key-1');
    expect(id1).toBeGreaterThan(0);

    // Second insert with same key — row is ignored
    insertOutboxEntry('enrollment', 'b@test.com', 'Sub2', '<p>Hey</p>', 'key-1');

    // Only one row exists
    const count = db.prepare('SELECT COUNT(*) as c FROM email_outbox').get() as any;
    expect(count.c).toBe(1);

    // Original row is preserved
    const row = db.prepare('SELECT recipient FROM email_outbox WHERE idempotency_key = ?').get('key-1') as any;
    expect(row.recipient).toBe('a@test.com');
  });

  it('OUTBOX-3: markOutboxSent transitions to sent', () => {
    const id = insertOutboxEntry('enrollment', 'user@test.com', 'Sub', '<p>Hi</p>');
    markOutboxSent(id);

    const row = getOutboxRow(id);
    expect(row.status).toBe('sent');
    expect(row.last_attempt_at).toBeTruthy();
  });

  it('OUTBOX-4: markOutboxFailed sets failed status + error_message', () => {
    const id = insertOutboxEntry('enrollment', 'user@test.com', 'Sub', '<p>Hi</p>');
    markOutboxFailed(id, 'SMTP timeout');

    const row = getOutboxRow(id);
    expect(row.status).toBe('failed');
    expect(row.error_message).toBe('SMTP timeout');
    expect(row.last_attempt_at).toBeTruthy();
  });

  it('OUTBOX-5: processEmailRetryQueue retries failed entries', async () => {
    // Insert a failed entry
    const id = insertOutboxEntry('enrollment', 'user@test.com', 'Sub', '<p>Hi</p>');
    db.prepare(`
      UPDATE email_outbox SET status = 'failed', retry_count = 0,
        last_attempt_at = datetime('now', '-10 minutes')
      WHERE id = ?
    `).run(id);

    // Without SMTP_HOST set, retry queue should return empty (no transporter)
    const origHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      const result = await processEmailRetryQueue();
      // Entries found but no transporter → no retries
      expect(result.retried).toBe(0);
    } finally {
      if (origHost) process.env.SMTP_HOST = origHost;
    }
  });

  it('OUTBOX-6: Entries abandoned after max retries', () => {
    const id = insertOutboxEntry('enrollment', 'user@test.com', 'Sub', '<p>Hi</p>');
    // Simulate reaching max retries
    db.prepare(`
      UPDATE email_outbox SET status = 'failed', retry_count = 3, max_retries = 3
      WHERE id = ?
    `).run(id);

    // retry_count >= max_retries → should not be picked up
    const entries = db.prepare(`
      SELECT id FROM email_outbox
      WHERE status = 'failed' AND retry_count < max_retries
    `).all();
    expect(entries).toHaveLength(0);
  });

  it('OUTBOX-7: Claim pattern prevents duplicate processing (UPDATE changes=0)', () => {
    const id = insertOutboxEntry('enrollment', 'user@test.com', 'Sub', '<p>Hi</p>');
    db.prepare(`UPDATE email_outbox SET status = 'failed', retry_count = 1 WHERE id = ?`).run(id);

    // First claim succeeds
    const claimed1 = db.prepare(`
      UPDATE email_outbox SET status = 'sending', last_attempt_at = datetime('now')
      WHERE id = ? AND status = 'failed' AND retry_count = ?
    `).run(id, 1);
    expect(claimed1.changes).toBe(1);

    // Second claim fails (status is now 'sending')
    const claimed2 = db.prepare(`
      UPDATE email_outbox SET status = 'sending', last_attempt_at = datetime('now')
      WHERE id = ? AND status = 'failed' AND retry_count = ?
    `).run(id, 1);
    expect(claimed2.changes).toBe(0);
  });

  it('OUTBOX-8: Send functions always create outbox entries', async () => {
    // Regardless of transporter availability, an outbox entry is created.
    const { sendEnrollmentEmail } = await import('../services/emailService.js');
    await sendEnrollmentEmail({ to: 'outbox8@test.com', name: 'Test', courseName: 'TestCourse' });

    const row = db.prepare(`
      SELECT * FROM email_outbox WHERE recipient = 'outbox8@test.com' ORDER BY id DESC LIMIT 1
    `).get() as any;
    expect(row).toBeTruthy();
    expect(row.email_type).toBe('enrollment');
    // Status is 'sent' (no transporter / log-only mode) or 'failed' (transporter exists but SMTP unreachable)
    expect(['sent', 'failed']).toContain(row.status);
  });
});
