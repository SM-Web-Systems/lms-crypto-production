/**
 * paymentService — Phase 11 C1a: course pricing + manual payment confirmation.
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
