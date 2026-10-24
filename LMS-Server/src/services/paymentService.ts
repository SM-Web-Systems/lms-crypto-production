/**
 * paymentService — Phase 11 C1a: course pricing + manual payment confirmation.
 * Phase 12 C1: Paystack + Stellar payment automation.
 */

import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import type { CoursePricing, Payment } from '../types/index.js';

// ─── Pricing ─────────────────────────────────────────────────────────────────

export function getCoursePricing(courseId: string): CoursePricing | null {
  return queryOne<CoursePricing>(
    'SELECT * FROM course_pricing WHERE course_id = ? AND is_active = 1',
    [courseId],
  );
}

export function setCoursePricing(courseId: string, priceCents: number): CoursePricing {
  const existing = queryOne<{ id: string }>('SELECT id FROM course_pricing WHERE course_id = ?', [courseId]);
  const now = new Date().toISOString();

  if (existing) {
    execute(
      'UPDATE course_pricing SET price_cents = ?, updated_at = ? WHERE id = ?',
      [priceCents, now, existing.id],
    );
    return queryOne<CoursePricing>('SELECT * FROM course_pricing WHERE id = ?', [existing.id])!;
  }

  const id = uuidv4();
  execute(
    `INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'USD', 1, ?, ?)`,
    [id, courseId, priceCents, now, now],
  );
  return queryOne<CoursePricing>('SELECT * FROM course_pricing WHERE id = ?', [id])!;
}

// ─── Payments ────────────────────────────────────────────────────────────────

export function createPayment(
  userId: string,
  courseId: string,
  applicationId: string,
  amountCents: number,
): Payment {
  const id = uuidv4();
  execute(
    `INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'USD', 'manual', 'pending', datetime('now'), datetime('now'))`,
    [id, userId, courseId, applicationId, amountCents],
  );
  return queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [id])!;
}

export function confirmPayment(paymentId: string, confirmedBy: string, notes?: string): Payment | null {
  const payment = queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
  if (!payment) return null;

  // Idempotent: already confirmed
  if (payment.status === 'confirmed') return payment;

  execute(
    `UPDATE payments SET status = 'confirmed', confirmed_by = ?, confirmed_at = datetime('now'),
     notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?`,
    [confirmedBy, notes ?? null, paymentId],
  );

  // Link payment to application
  if (payment.application_id) {
    execute(
      'UPDATE course_nft_applications SET payment_id = ? WHERE id = ?',
      [paymentId, payment.application_id],
    );
  }

  return queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
}

export function waivePayment(paymentId: string, confirmedBy: string, notes: string): Payment | null {
  const payment = queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
  if (!payment) return null;

  if (payment.status === 'waived') return payment;

  execute(
    `UPDATE payments SET status = 'waived', payment_method = 'waived', confirmed_by = ?,
     confirmed_at = datetime('now'), notes = ?, updated_at = datetime('now') WHERE id = ?`,
    [confirmedBy, notes, paymentId],
  );

  if (payment.application_id) {
    execute(
      'UPDATE course_nft_applications SET payment_id = ? WHERE id = ?',
      [paymentId, payment.application_id],
    );
  }

  return queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
}

export function getPaymentForApplication(applicationId: string): Payment | null {
  return queryOne<Payment>(
    'SELECT * FROM payments WHERE application_id = ? ORDER BY created_at DESC',
    [applicationId],
  );
}

export function isPaymentSatisfied(applicationId: string): boolean {
  const payment = getPaymentForApplication(applicationId);
  if (!payment) return false;
  return payment.status === 'confirmed' || payment.status === 'waived';
}

export interface PaymentWithDetails extends Payment {
  user_name: string | null;
  user_email: string | null;
  course_name: string | null;
  confirmed_by_name: string | null;
}

export function listPayments(filters?: { status?: string; courseId?: string }): PaymentWithDetails[] {
  let sql = `
    SELECT p.*, u.name AS user_name, u.email AS user_email,
           c.title AS course_name, cb.name AS confirmed_by_name
    FROM payments p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN courses c ON c.id = p.course_id
    LEFT JOIN users cb ON cb.id = p.confirmed_by
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (filters?.status) {
    sql += ' AND p.status = ?';
    params.push(filters.status);
  }
  if (filters?.courseId) {
    sql += ' AND p.course_id = ?';
    params.push(filters.courseId);
  }

  sql += ' ORDER BY p.created_at DESC';
  return query<PaymentWithDetails>(sql, params);
}

// ─── Phase 12 C1: Paystack + Stellar extensions ─────────────────────────────

export function createPaystackPayment(
  userId: string,
  courseId: string,
  applicationId: string,
  amountCents: number,
  reference: string,
  accessCode: string,
): Payment {
  const id = uuidv4();
  execute(
    `INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency,
     payment_method, status, paystack_reference, paystack_access_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'USD', 'paystack', 'pending', ?, ?, datetime('now'), datetime('now'))`,
    [id, userId, courseId, applicationId, amountCents, reference, accessCode],
  );
  return queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [id])!;
}

export function createStellarPayment(
  userId: string,
  courseId: string,
  applicationId: string,
  amountCents: number,
  memo: string,
  method: 'stellar_xlm' | 'stellar_usdc' = 'stellar_xlm',
  stellarExpectedAmount?: number,
): Payment {
  const id = uuidv4();
  execute(
    `INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency,
     payment_method, status, stellar_memo, stellar_expected_amount, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'USD', ?, 'pending', ?, ?, datetime('now'), datetime('now'))`,
    [id, userId, courseId, applicationId, amountCents, method, memo, stellarExpectedAmount ?? null],
  );
  return queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [id])!;
}

export function failPayment(paymentId: string): Payment | null {
  const payment = queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
  if (!payment) return null;
  if (payment.status !== 'pending') return payment;

  execute(
    "UPDATE payments SET status = 'failed', updated_at = datetime('now') WHERE id = ?",
    [paymentId],
  );
  return queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
}

export function refundPayment(paymentId: string, notes?: string): Payment | null {
  const payment = queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
  if (!payment) return null;

  execute(
    "UPDATE payments SET status = 'refunded', notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?",
    [notes ?? null, paymentId],
  );
  return queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
}

export function getPaymentByReference(reference: string): Payment | null {
  return queryOne<Payment>(
    'SELECT * FROM payments WHERE paystack_reference = ?',
    [reference],
  );
}

export function getPaymentByStellarMemo(memo: string): Payment | null {
  return queryOne<Payment>(
    'SELECT * FROM payments WHERE stellar_memo = ?',
    [memo],
  );
}

export function getStudentPayments(userId: string): (Payment & { course_name: string | null })[] {
  return query<Payment & { course_name: string | null }>(
    'SELECT p.*, c.title AS course_name FROM payments p LEFT JOIN courses c ON c.id = p.course_id WHERE p.user_id = ? ORDER BY p.created_at DESC',
    [userId],
  );
}

export function setCourseStellarPricing(
  courseId: string,
  stellarPriceXlm: number | null,
  stellarPriceUsdc: number | null,
): void {
  const existing = queryOne<{ id: string }>('SELECT id FROM course_pricing WHERE course_id = ?', [courseId]);
  if (existing) {
    execute(
      'UPDATE course_pricing SET stellar_price_xlm = ?, stellar_price_usdc = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [stellarPriceXlm, stellarPriceUsdc, existing.id],
    );
  }
}

/** Record a webhook event for idempotency. Returns false if already processed. */
export function recordWebhookEvent(
  eventId: string,
  eventType: string,
  provider: string,
  payload: string,
): boolean {
  // Only an actual event_id conflict is a duplicate. Storage failures propagate.
  return execute(
    `INSERT INTO webhook_events (id, event_id, event_type, provider, payload)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING`,
    [uuidv4(), eventId, eventType, provider, payload],
  ) === 1;
}

// ─── AUTH-02: Cohort-scoped sponsor billing access ──────────────────────────

/**
 * Check if a payment is visible to a sponsor.
 * Returns true if:
 *   (a) The payment belongs to a student who is in one of the sponsor's cohorts
 *       AND the payment's course matches the cohort's course, OR
 *   (b) The payment is the sponsor's own bulk cohort payment (sponsor_cohorts.payment_id).
 */
export function isSponsorScopedPayment(sponsorUserId: string, paymentId: string): boolean {
  const memberMatch = queryOne<{ id: string }>(
    `SELECT p.id
     FROM payments p
     JOIN cohort_members cm ON cm.user_id = p.user_id
     JOIN sponsor_cohorts sc ON sc.id = cm.cohort_id
                             AND sc.course_id = p.course_id
     WHERE p.id = ?
       AND sc.sponsor_user_id = ?
     LIMIT 1`,
    [paymentId, sponsorUserId],
  );
  if (memberMatch) return true;

  const bulkMatch = queryOne<{ id: string }>(
    `SELECT sc.id
     FROM sponsor_cohorts sc
     WHERE sc.payment_id = ?
       AND sc.sponsor_user_id = ?
     LIMIT 1`,
    [paymentId, sponsorUserId],
  );
  return !!bulkMatch;
}

/**
 * Filtered variant of listPayments for sponsor users.
 * Returns only payments belonging to the sponsor's cohort members
 * (same course context) plus the sponsor's own bulk cohort payments.
 */
export function listPaymentsForSponsor(
  sponsorUserId: string,
  filters?: { status?: string; courseId?: string },
): PaymentWithDetails[] {
  let sql = `
    SELECT DISTINCT p.*, u.name AS user_name, u.email AS user_email,
           c.title AS course_name, cb.name AS confirmed_by_name
    FROM payments p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN courses c ON c.id = p.course_id
    LEFT JOIN users cb ON cb.id = p.confirmed_by
    WHERE (
      EXISTS (
        SELECT 1 FROM cohort_members cm
        JOIN sponsor_cohorts sc ON sc.id = cm.cohort_id
                                AND sc.course_id = p.course_id
        WHERE cm.user_id = p.user_id
          AND sc.sponsor_user_id = ?
      )
      OR EXISTS (
        SELECT 1 FROM sponsor_cohorts sc2
        WHERE sc2.payment_id = p.id
          AND sc2.sponsor_user_id = ?
      )
    )
  `;
  const params: unknown[] = [sponsorUserId, sponsorUserId];

  if (filters?.status) {
    sql += ' AND p.status = ?';
    params.push(filters.status);
  }
  if (filters?.courseId) {
    sql += ' AND p.course_id = ?';
    params.push(filters.courseId);
  }

  sql += ' ORDER BY p.created_at DESC';
  return query<PaymentWithDetails>(sql, params);
}

/**
 * Check if a badge is visible to a sponsor.
 * Returns true if the badge's user is a member of one of the sponsor's cohorts
 * AND the badge's course matches the cohort's course.
 */
export function isSponsorScopedBadge(sponsorUserId: string, badgeId: string): boolean {
  const match = queryOne<{ id: string }>(
    `SELECT cb.id
     FROM certificate_badges cb
     JOIN cohort_members cm ON cm.user_id = cb.user_id
     JOIN sponsor_cohorts sc ON sc.id = cm.cohort_id
                             AND sc.course_id = cb.course_id
     WHERE cb.id = ?
       AND sc.sponsor_user_id = ?
     LIMIT 1`,
    [badgeId, sponsorUserId],
  );
  return !!match;
}
