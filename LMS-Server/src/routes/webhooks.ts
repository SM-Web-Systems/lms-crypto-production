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

const router = Router();

// Parse body as raw buffer for webhook signature verification
router.use(express.raw({ type: 'application/json' }));

interface PaystackWebhookPayload {
  event: string;
  data: {
    reference: string;
    status: string;
    amount: number;
    currency: string;
    paid_at?: string;
    metadata?: Record<string, unknown>;
  };
}

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

    const { event, data } = payload;

    // Idempotency check — use reference as event_id
    const isNew = recordWebhookEvent(data.reference, event, 'paystack', rawBody.toString());
    if (!isNew) {
      // Already processed — return 200 to stop Paystack retries
      res.json({ success: true, message: 'Already processed' });
      return;
    }

    // Process event
    switch (event) {
      case 'charge.success': {
        const payment = getPaymentByReference(data.reference);
        if (!payment) {
          console.warn(`Paystack webhook: no payment found for reference ${data.reference}`);
          res.json({ success: true, message: 'No matching payment' });
          return;
        }

        // Verify amount matches
        if (data.amount !== payment.amount_cents) {
          console.warn(
            `Paystack webhook: amount mismatch for ${data.reference}: ` +
            `expected ${payment.amount_cents}, got ${data.amount}`
          );
          res.json({ success: true, message: 'Amount mismatch logged' });
          return;
        }

        confirmPayment(payment.id, payment.user_id, `Auto-confirmed via Paystack webhook`);
        res.json({ success: true, message: 'Payment confirmed' });
        return;
      }

      case 'charge.failed': {
        const payment = getPaymentByReference(data.reference);
        if (payment && payment.status === 'pending') {
          failPayment(payment.id);
        }
        res.json({ success: true, message: 'Failure recorded' });
        return;
      }

      case 'refund.processed': {
        const payment = getPaymentByReference(data.reference);
        if (payment && payment.status === 'confirmed') {
          refundPayment(payment.id, 'Refund processed via Paystack');
        }
        res.json({ success: true, message: 'Refund recorded' });
        return;
      }

      default:
        res.json({ success: true, message: `Event ${event} acknowledged` });
    }
  },
);

export default router;
