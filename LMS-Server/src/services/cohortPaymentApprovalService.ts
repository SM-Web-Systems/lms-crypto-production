/**
 * Sponsor cohort payment requests with administrator approval.
 *
 * A sponsor's Create Payment (bulkPay) records one pending manual payment for the cohort
 * (sponsor_cohorts.payment_id). That pending payment is the request. An administrator approves it,
 * which confirms the cohort payment and settles each learner it covers through the same
 * createPayment + confirmPayment path that settles a single learner's certificate payment, or
 * declines it with a reason. Nothing here moves money or calls a payment provider.
 */
import { db, query, queryOne, execute } from '../config/database.js';
import { confirmPayment, createPayment, isPaymentSatisfied } from './paymentService.js';
import { createNotification } from './notificationService.js';

export type CohortPaymentStatus = 'pending' | 'approved' | 'declined';

export interface CohortPaymentRequest {
  paymentId: string;
  cohortId: string;
  cohortName: string;
  courseName: string | null;
  sponsorUserId: string;
  sponsorName: string | null;
  sponsorEmail: string | null;
  amountCents: number;
  currency: string;
  learnerCount: number;
  status: CohortPaymentStatus;
  paymentStatus: string;
  declineReason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export class CohortPaymentError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Learners a request covers: cohort members whose application existed when the sponsor asked. */
const COVERED_APPLICATIONS = `
  SELECT a.id AS application_id, a.user_id
  FROM cohort_members cm JOIN course_nft_applications a ON a.id = cm.application_id
  WHERE cm.cohort_id = ? AND a.applied_at <= ?`;

interface RequestRow {
  payment_id: string; cohort_id: string; cohort_name: string; course_id: string; course_name: string | null;
  sponsor_user_id: string; sponsor_name: string | null; sponsor_email: string | null;
  amount_cents: number; currency: string; status: string; decline_reason: string | null;
  confirmed_at: string | null; declined_at: string | null; decided_by_name: string | null;
  created_at: string; learner_count: number;
}

const REQUEST_SELECT = `
  SELECT p.id AS payment_id, sc.id AS cohort_id, sc.name AS cohort_name, sc.course_id, c.title AS course_name,
         sc.sponsor_user_id, su.name AS sponsor_name, su.email AS sponsor_email,
         p.amount_cents, p.currency, p.status, p.decline_reason, p.confirmed_at, p.declined_at, p.created_at,
         CASE WHEN p.status = 'failed' THEN dby.name ELSE cby.name END AS decided_by_name,
         (SELECT COUNT(*) FROM cohort_members cm JOIN course_nft_applications a ON a.id = cm.application_id
          WHERE cm.cohort_id = sc.id AND a.applied_at <= p.created_at) AS learner_count
  FROM sponsor_cohorts sc
  JOIN payments p ON p.id = sc.payment_id
  LEFT JOIN courses c ON c.id = sc.course_id
  LEFT JOIN users su ON su.id = sc.sponsor_user_id
  LEFT JOIN users cby ON cby.id = p.confirmed_by
  LEFT JOIN users dby ON dby.id = p.declined_by`;

function requestStatus(paymentStatus: string): CohortPaymentStatus {
  if (paymentStatus === 'pending') return 'pending';
  if (paymentStatus === 'failed') return 'declined';
  return 'approved';
}

function toRequest(r: RequestRow): CohortPaymentRequest {
  const status = requestStatus(r.status);
  return {
    paymentId: r.payment_id, cohortId: r.cohort_id, cohortName: r.cohort_name, courseName: r.course_name,
    sponsorUserId: r.sponsor_user_id, sponsorName: r.sponsor_name, sponsorEmail: r.sponsor_email,
    amountCents: r.amount_cents, currency: r.currency, learnerCount: r.learner_count,
    status, paymentStatus: r.status, declineReason: r.decline_reason,
    decidedByName: status === 'pending' ? null : r.decided_by_name,
    decidedAt: status === 'declined' ? r.declined_at : status === 'approved' ? r.confirmed_at : null,
    createdAt: r.created_at,
  };
}

export function listCohortPaymentRequests(status?: CohortPaymentStatus): CohortPaymentRequest[] {
  const where = status === 'pending' ? " WHERE p.status = 'pending'"
    : status === 'declined' ? " WHERE p.status = 'failed'"
    : status === 'approved' ? " WHERE p.status IN ('confirmed', 'waived', 'refunded')"
    : '';
  return query<RequestRow>(`${REQUEST_SELECT}${where} ORDER BY p.created_at DESC, p.id`).map(toRequest);
}

/** True when the payment is a sponsor's cohort payment request. */
export function isCohortPayment(paymentId: string): boolean {
  return !!queryOne('SELECT 1 FROM sponsor_cohorts WHERE payment_id = ?', [paymentId]);
}

function loadForDecision(paymentId: string, adminUserId: string): RequestRow {
  const row = queryOne<RequestRow>(`${REQUEST_SELECT} WHERE p.id = ?`, [paymentId]);
  if (!row) throw new CohortPaymentError(404, 'NOT_FOUND', 'Cohort payment request not found');
  // Two-person rule: an administrator cannot decide a request for a cohort they sponsor.
  if (row.sponsor_user_id === adminUserId) {
    throw new CohortPaymentError(403, 'FORBIDDEN', 'You cannot decide a payment request for your own cohort');
  }
  return row;
}

/**
 * Approve: confirm the cohort payment (recording who and when) and settle every covered learner.
 * Idempotent: a replay confirms nothing new, settles only learners still unsettled, and notifies once.
 */
export function approveCohortPayment(paymentId: string, adminUserId: string): { request: CohortPaymentRequest; learnersSettled: number } {
  const row = loadForDecision(paymentId, adminUserId);
  if (row.status === 'failed') throw new CohortPaymentError(409, 'ALREADY_DECLINED', 'This payment request was declined');
  if (row.status === 'refunded') throw new CohortPaymentError(409, 'ALREADY_REFUNDED', 'This payment was refunded');

  const firstApproval = row.status === 'pending';
  const settle = db.transaction((): number => {
    if (firstApproval) confirmPayment(paymentId, adminUserId, 'Cohort payment request approved');
    let settled = 0;
    for (const learner of query<{ application_id: string; user_id: string }>(COVERED_APPLICATIONS, [row.cohort_id, row.created_at])) {
      if (isPaymentSatisfied(learner.application_id)) continue;
      // The sponsor's cohort payment carries the amount; each learner's record is a zero-amount
      // confirmation so revenue is not counted twice.
      const learnerPayment = createPayment(learner.user_id, row.course_id, learner.application_id, 0, row.currency);
      confirmPayment(learnerPayment.id, adminUserId, `Covered by cohort payment ${paymentId}`);
      settled++;
    }
    return settled;
  });
  const learnersSettled = settle();

  if (firstApproval) {
    try {
      createNotification({
        userId: row.sponsor_user_id,
        type: 'payment_confirmed',
        title: 'Cohort payment approved',
        body: `Your payment for "${row.cohort_name}" (${row.learner_count} learner${row.learner_count === 1 ? '' : 's'}) was approved. The learners can now receive their certificates.`,
        link: '/sponsor/billing',
      });
    } catch { /* best-effort */ }
  }
  const request = toRequest(queryOne<RequestRow>(`${REQUEST_SELECT} WHERE p.id = ?`, [paymentId])!);
  return { request, learnersSettled };
}

/** Decline with a reason. Only a pending request can be declined; the sponsor may then send a new one. */
export function declineCohortPayment(paymentId: string, adminUserId: string, reason: string): CohortPaymentRequest {
  const row = loadForDecision(paymentId, adminUserId);
  if (row.status !== 'pending') throw new CohortPaymentError(409, 'NOT_PENDING', 'Only a pending payment request can be declined');
  const changed = execute(
    `UPDATE payments SET status = 'failed', decline_reason = ?, declined_by = ?, declined_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND status = 'pending'`,
    [reason, adminUserId, paymentId],
  );
  if (changed === 0) throw new CohortPaymentError(409, 'NOT_PENDING', 'Only a pending payment request can be declined');
  try {
    createNotification({
      userId: row.sponsor_user_id,
      type: 'payment_failed',
      title: 'Cohort payment declined',
      body: `Your payment request for "${row.cohort_name}" was declined: ${reason}`,
      link: '/sponsor/billing',
    });
  } catch { /* best-effort */ }
  return toRequest(queryOne<RequestRow>(`${REQUEST_SELECT} WHERE p.id = ?`, [paymentId])!);
}
