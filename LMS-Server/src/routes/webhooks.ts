import { db, queryOne } from '../config/database.js';
/**
 * Webhook routes — Phase 12 C1: Paystack webhook handler.
 *
 * This router must be mounted BEFORE express.json() middleware
 * or with express.raw() to preserve raw body for HMAC verification.
 */

import { Router, type Request, type Response } from 'express';
import express from 'express';
import {
  getPaymentByReference,
  confirmPayment,
  failPayment,
  refundPayment,
  recordWebhookEvent,
} from '../services/paymentService.js';
import { verifyWebhookSignature } from '../services/paystackService.js';
import logger from '../utils/logger.js';

const router = Router();

// Parse body as raw buffer for webhook signature verification
router.use(express.raw({ type: 'application/json' }));

interface PaystackWebhookPayload {
  event: string;
  data: Record<string, unknown>;
}

/**
 * @openapi
 * /webhooks/paystack:
 *   post:
 *     tags: [Webhooks]
 *     summary: Paystack webhook handler
 *     description: Handles charge.success, charge.failed, refund.processed events. HMAC signature verification required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event: { type: string }
 *               data:
 *                 type: object
 *                 properties:
 *                   reference: { type: string }
 *                   status: { type: string }
 *                   amount: { type: integer }
 *     responses:
 *       200: { description: Webhook processed }
 *       401: { description: Invalid signature }
 */
// POST /webhooks/paystack — handle Paystack events
router.post(
  '/paystack',
  (req: Request, res: Response): void => {
    const signature = req.headers['x-paystack-signature'] as string;
    if (!signature) {
      res.status(401).json({ success: false, message: 'Missing signature' });
      return;
    }

    // Get raw body — express.raw() gives us a Buffer
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({success:false,message:'JSON raw body required'}); return;
    }
    if (!verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ success: false, message: 'Invalid signature' });
      return;
    }

    let payload: PaystackWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString()) as PaystackWebhookPayload;
    } catch {
      res.status(400).json({ success: false, message: 'Invalid JSON' });
      return;
    }

    if (!payload || typeof payload !== 'object' || typeof payload.event !== 'string' ||
        !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
      res.status(400).json({success:false,message:'Invalid event payload'}); return;
    }
    const { event, data } = payload;
    if (!['charge.success','charge.failed','refund.processed'].includes(event)) {
      res.json({success:true,message:`Event ${event} acknowledged`}); return;
    }
    // Paystack refund notifications use transaction_reference and may encode
    // amount as a decimal string; charges use reference and a numeric amount.
    // https://paystack.com/docs/payments/refunds/#listen-to-notifications
    const reference = event === 'refund.processed' ? data.transaction_reference : data.reference;
    const amount = event === 'refund.processed' && typeof data.amount === 'string' && /^[0-9]+$/.test(data.amount)
      ? Number(data.amount) : data.amount;
    const refundReference = data.refund_reference;
    if (typeof reference !== 'string' || !Number.isSafeInteger(amount) || (amount as number) <= 0 ||
        typeof data.currency !== 'string' || (event === 'refund.processed' &&
          (data.status !== 'processed' || (refundReference != null && typeof refundReference !== 'string')))) {
      res.status(400).json({success:false,message:'Invalid event payment evidence'}); return;
    }
    const result = db.transaction(() => {
      const payment = getPaymentByReference(reference);
      if (!payment) return {status:200,message:'No matching payment'};
      // A mismatch must not consume the idempotency key for a later valid retry.
      if (payment.payment_method !== 'paystack' || (event === 'refund.processed' ? (amount as number) > payment.amount_cents : amount !== payment.amount_cents) || data.currency !== payment.currency) {
        logger.warn({module:'paystack-webhook',paymentId:payment.id}, 'Payment amount/currency/method mismatch');
        return {status:200,message:amount !== payment.amount_cents ? 'Amount mismatch logged' : 'Currency or payment method mismatch logged'};
      }
      // Retain historical reference-only records without suppressing later types.
      const historical = queryOne('SELECT 1 FROM webhook_events WHERE event_id = ? AND event_type = ? AND provider = ?',
        [reference,event,'paystack']);
      const needsMutation = event === 'charge.success' ? ['pending','failed'].includes(payment.status)
        : event === 'charge.failed' ? payment.status === 'pending'
          : payment.status === 'confirmed' && amount === payment.amount_cents;
      // Legacy markers were not atomic: permit a valid retry when the old write
      // failed or consumed a mismatched event before applying the payment.
      if (historical && !needsMutation) return {status:200,message:'Already processed'};
      if (event === 'refund.processed' && !['confirmed','refunded'].includes(payment.status)) {
        return {status:409,message:'Confirmation not yet recorded; retry refund'};
      }
      // Refund deduplication: prefer refund_reference, then Paystack event ID
      // (data.id), then fall through to reconciliation mode that always records
      // but flags for manual review.
      const eventPaystackId = data.id;
      const refundKey = refundReference
        ?? (eventPaystackId != null && (typeof eventPaystackId === 'number' || (typeof eventPaystackId === 'string' && eventPaystackId.length > 0))
          ? `_event_${eventPaystackId}`
          : `_reconcile_${Date.now()}_${amount}`);
      if (refundKey.startsWith('_reconcile_')) {
        logger.warn({module:'paystack-webhook',paymentId:payment.id,reference,amount}, 'Refund event missing both refund_reference and provider event ID; recorded with reconciliation marker');
      }
      const eventId = JSON.stringify(event === 'refund.processed'
        ? ['paystack', event, reference, refundKey]
        : ['paystack', event, reference]);
      if (!recordWebhookEvent(eventId,event,'paystack',rawBody.toString())) return {status:200,message:'Already processed'};
      switch (event) {
        case 'charge.success':
          if (['pending','failed'].includes(payment.status)) confirmPayment(payment.id,payment.user_id,'Auto-confirmed via Paystack webhook');
          return {status:200,message:payment.status === 'refunded' || payment.status === 'waived' ? 'Final payment state retained' : 'Payment confirmed'};
        case 'charge.failed':
          if (payment.status === 'pending') failPayment(payment.id);
          return {status:200,message:'Failure recorded'};
        default:
          if ((amount as number) < payment.amount_cents) {
            logger.warn({module:'paystack-webhook',paymentId:payment.id}, 'Partial refund recorded; manual reconciliation required');
            return {status:200,message:'Partial refund recorded; manual reconciliation required'};
          }
          if (payment.status === 'confirmed') refundPayment(payment.id,'Refund processed via Paystack');
          return {status:200,message:'Refund recorded'};
      }
    }).immediate();
    res.status(result.status).json({success:result.status === 200,message:result.message});
  },
);

export default router;
