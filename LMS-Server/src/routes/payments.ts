/**
 * Payment routes — Phase 11 C1a: pricing CRUD + manual payment confirmation.
 * Phase 11 C2: tier config + badge endpoints.
 * Phase 12 C1: Paystack checkout + Stellar payment automation.
 * Phase 16 C1: Invoice/receipt PDF generation.
 */

import { Router, type Response, type Request, type NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { queryOne, execute } from '../config/database.js';
import { ErrorCodes, type AuthRequest } from '../types/index.js';
import {
  getCoursePricing,
  setCoursePricing,
  setCourseStellarPricing,
  confirmPayment,
  waivePayment,
  listPayments,
  getPaymentForApplication,
  getPaymentByReference,
  createPaystackPayment,
  createStellarPayment,
  failPayment,
  refundPayment,
  getStudentPayments,
  recordWebhookEvent,
} from '../services/paymentService.js';
import { getTiersEnabled, getBadge } from '../services/badgeService.js';
import {
  initializeTransaction,
  verifyWebhookSignature,
  createRefund as paystackCreateRefund,
} from '../services/paystackService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── GET /courses/:courseId/pricing — any authenticated user ─────────────────

router.get(
  '/courses/:courseId/pricing',
  (req: AuthRequest, res: Response): void => {
    const { courseId } = req.params;

    const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' } });
      return;
    }

    const pricing = getCoursePricing(courseId);
    const priceCents = pricing?.price_cents ?? 0;
    const isFree = !pricing || priceCents === 0;

    // Build available payment methods
    const paymentMethods: string[] = [];
    if (!isFree) {
      paymentMethods.push('manual');
      if (process.env.PAYSTACK_SECRET_KEY) paymentMethods.push('paystack');
      if (pricing?.stellar_price_xlm) paymentMethods.push('stellar_xlm');
      if (pricing?.stellar_price_usdc) paymentMethods.push('stellar_usdc');
    }

    res.json({
      success: true,
      data: {
        courseId,
        priceCents,
        currency: pricing?.currency ?? 'USD',
        isFree,
        stellarPriceXlm: pricing?.stellar_price_xlm ?? null,
        stellarPriceUsdc: pricing?.stellar_price_usdc ?? null,
        paymentMethods,
      },
    });
  },
);

// ─── Admin-only routes below ─────────────────────────────────────────────────

// ─── PUT /admin/courses/:courseId/pricing ─────────────────────────────────────

router.put(
  '/admin/courses/:courseId/pricing',
  requirePermission('billing.confirm'),
  (req: AuthRequest, res: Response): void => {
    const { courseId } = req.params;
    const { priceCents, tiersEnabled, stellarPriceXlm, stellarPriceUsdc } = req.body;

    if (typeof priceCents !== 'number' || priceCents < 0 || !Number.isInteger(priceCents)) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'priceCents must be a non-negative integer' },
      });
      return;
    }

    if (tiersEnabled !== undefined && !['free_only', 'paid_only', 'both'].includes(tiersEnabled)) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: "tiersEnabled must be 'free_only', 'paid_only', or 'both'" },
      });
      return;
    }

    const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' } });
      return;
    }

    const pricing = setCoursePricing(courseId, priceCents);

    // Phase 11 C2: Update tiers_enabled if provided
    if (tiersEnabled) {
      execute(
        'UPDATE course_pricing SET tiers_enabled = ? WHERE id = ?',
        [tiersEnabled, pricing.id],
      );
    }

    // Phase 12 C1: Update Stellar prices if provided
    if (stellarPriceXlm !== undefined || stellarPriceUsdc !== undefined) {
      setCourseStellarPricing(
        courseId,
        stellarPriceXlm ?? pricing.stellar_price_xlm ?? null,
        stellarPriceUsdc ?? pricing.stellar_price_usdc ?? null,
      );
    }

    const updatedTiers = getTiersEnabled(courseId);
    const updatedPricing = getCoursePricing(courseId);

    res.json({
      success: true,
      data: {
        courseId,
        priceCents: updatedPricing?.price_cents ?? priceCents,
        currency: updatedPricing?.currency ?? 'USD',
        isFree: priceCents === 0,
        tiersEnabled: updatedTiers,
        stellarPriceXlm: updatedPricing?.stellar_price_xlm ?? null,
        stellarPriceUsdc: updatedPricing?.stellar_price_usdc ?? null,
      },
    });
  },
);

// ─── POST /admin/payments/:paymentId/confirm ─────────────────────────────────

router.post(
  '/admin/payments/:paymentId/confirm',
  requirePermission('billing.confirm'),
  (req: AuthRequest, res: Response): void => {
    const { paymentId } = req.params;
    const { notes } = req.body ?? {};

    const payment = confirmPayment(paymentId, req.user!.userId, notes);
    if (!payment) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Payment not found' } });
      return;
    }

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        status: payment.status,
        confirmedBy: payment.confirmed_by,
        confirmedAt: payment.confirmed_at,
      },
    });
  },
);

// ─── POST /admin/payments/:paymentId/waive ───────────────────────────────────

router.post(
  '/admin/payments/:paymentId/waive',
  requirePermission('billing.waive'),
  (req: AuthRequest, res: Response): void => {
    const { paymentId } = req.params;
    const { notes } = req.body ?? {};

    if (!notes || typeof notes !== 'string' || notes.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Notes are required when waiving payment' },
      });
      return;
    }

    const payment = waivePayment(paymentId, req.user!.userId, notes.trim());
    if (!payment) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Payment not found' } });
      return;
    }

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        status: payment.status,
        confirmedBy: payment.confirmed_by,
        confirmedAt: payment.confirmed_at,
        notes: payment.notes,
      },
    });
  },
);

// ─── GET /admin/payments ─────────────────────────────────────────────────────

router.get(
  '/admin/payments',
  requirePermission('billing.view_all'),
  (req: AuthRequest, res: Response): void => {
    const { status, courseId } = req.query as { status?: string; courseId?: string };
    const payments = listPayments({ status, courseId });

    res.json({
      success: true,
      data: {
        payments: payments.map((p) => ({
          paymentId: p.id,
          userId: p.user_id,
          userName: p.user_name,
          userEmail: p.user_email,
          courseId: p.course_id,
          courseName: p.course_name,
          applicationId: p.application_id,
          amountCents: p.amount_cents,
          currency: p.currency,
          paymentMethod: p.payment_method,
          status: p.status,
          confirmedBy: p.confirmed_by,
          confirmedByName: p.confirmed_by_name,
          confirmedAt: p.confirmed_at,
          notes: p.notes,
          createdAt: p.created_at,
        })),
      },
    });
  },
);

// ─── Phase 12 C1: Paystack Checkout ──────────────────────────────────────────

// POST /payments/checkout/paystack — create Paystack checkout session
router.post(
  '/payments/checkout/paystack',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { applicationId } = req.body;
    if (!applicationId) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'applicationId is required' },
      });
      return;
    }

    // Fetch application
    const application = queryOne<{ id: string; user_id: string; course_id: string; status: string }>(
      'SELECT id, user_id, course_id, status FROM course_nft_applications WHERE id = ?',
      [applicationId],
    );
    if (!application) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Application not found' } });
      return;
    }

    // Must be own application
    if (application.user_id !== req.user!.userId) {
      res.status(403).json({ success: false, error: { code: ErrorCodes.FORBIDDEN, message: 'Not your application' } });
      return;
    }

    // Check pricing
    const pricing = getCoursePricing(application.course_id);
    if (!pricing || pricing.price_cents === 0) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Course is free, no payment required' },
      });
      return;
    }

    // Check existing payment
    const existingPayment = getPaymentForApplication(applicationId);
    if (existingPayment) {
      if (existingPayment.status === 'confirmed' || existingPayment.status === 'waived') {
        res.status(409).json({
          success: false,
          error: { code: ErrorCodes.DUPLICATE_ENTRY, message: 'Payment already completed' },
        });
        return;
      }
      // If pending paystack payment exists, return same checkout info
      if (existingPayment.payment_method === 'paystack' && existingPayment.status === 'pending' && existingPayment.paystack_reference) {
        res.json({
          success: true,
          data: {
            paymentId: existingPayment.id,
            checkoutUrl: null, // Re-init needed — Paystack URLs expire
            reference: existingPayment.paystack_reference,
            message: 'Existing pending payment found. Re-initializing checkout.',
          },
        });
        // Fall through to re-initialize with same reference... actually let's just create new
      }
    }

    // Create Paystack transaction
    const reference = `lms-pay-${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const callbackUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback`;

    const user = queryOne<{ email: string }>('SELECT email FROM users WHERE id = ?', [req.user!.userId]);

    try {
      const paystackData = await initializeTransaction(
        user?.email || req.user!.email,
        pricing.price_cents,
        reference,
        callbackUrl,
        { applicationId, courseId: application.course_id, userId: req.user!.userId },
      );

      // Create payment record
      const payment = createPaystackPayment(
        req.user!.userId,
        application.course_id,
        applicationId,
        pricing.price_cents,
        reference,
        paystackData.access_code,
      );

      res.status(201).json({
        success: true,
        data: {
          paymentId: payment.id,
          checkoutUrl: paystackData.authorization_url,
          reference: paystackData.reference,
          accessCode: paystackData.access_code,
        },
      });
    } catch (err) {
      console.error('Paystack checkout error:', err);
      res.status(502).json({
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Payment gateway error' },
      });
    }
  },
);

// POST /payments/checkout/stellar — generate Stellar payment instructions
router.post(
  '/payments/checkout/stellar',
  (req: AuthRequest, res: Response): void => {
    const { applicationId, currency } = req.body;
    if (!applicationId) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'applicationId is required' },
      });
      return;
    }

    const paymentCurrency = currency === 'usdc' ? 'stellar_usdc' : 'stellar_xlm';

    // Fetch application
    const application = queryOne<{ id: string; user_id: string; course_id: string }>(
      'SELECT id, user_id, course_id FROM course_nft_applications WHERE id = ?',
      [applicationId],
    );
    if (!application) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Application not found' } });
      return;
    }

    if (application.user_id !== req.user!.userId) {
      res.status(403).json({ success: false, error: { code: ErrorCodes.FORBIDDEN, message: 'Not your application' } });
      return;
    }

    const pricing = getCoursePricing(application.course_id);
    if (!pricing || pricing.price_cents === 0) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Course is free, no payment required' },
      });
      return;
    }

    const stellarAmount = paymentCurrency === 'stellar_xlm'
      ? pricing.stellar_price_xlm
      : pricing.stellar_price_usdc;

    if (!stellarAmount) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: `No ${paymentCurrency === 'stellar_xlm' ? 'XLM' : 'USDC'} price configured for this course` },
      });
      return;
    }

    // Check existing confirmed payment
    const existingPayment = getPaymentForApplication(applicationId);
    if (existingPayment && (existingPayment.status === 'confirmed' || existingPayment.status === 'waived')) {
      res.status(409).json({
        success: false,
        error: { code: ErrorCodes.DUPLICATE_ENTRY, message: 'Payment already completed' },
      });
      return;
    }

    // Generate memo (28-char max for Stellar text memo)
    const memo = uuidv4().replace(/-/g, '').slice(0, 28);
    const receivingWallet = process.env.PAYMENT_RECEIVING_WALLET || '';

    // Create payment record
    const payment = createStellarPayment(
      req.user!.userId,
      application.course_id,
      applicationId,
      pricing.price_cents,
      memo,
      paymentCurrency as 'stellar_xlm' | 'stellar_usdc',
    );

    res.status(201).json({
      success: true,
      data: {
        paymentId: payment.id,
        destinationAddress: receivingWallet,
        memo,
        amount: stellarAmount,
        currency: paymentCurrency === 'stellar_xlm' ? 'XLM' : 'USDC',
        message: 'Send the exact amount with this memo to the destination address',
      },
    });
  },
);

// GET /payments/:paymentId/status — payment status (owner or admin)
router.get(
  '/payments/:paymentId/status',
  (req: AuthRequest, res: Response): void => {
    const payment = queryOne<{ id: string; user_id: string; status: string; payment_method: string; amount_cents: number; currency: string; created_at: string; confirmed_at: string | null }>(
      'SELECT id, user_id, status, payment_method, amount_cents, currency, created_at, confirmed_at FROM payments WHERE id = ?',
      [req.params.paymentId],
    );

    if (!payment) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Payment not found' } });
      return;
    }

    if (payment.user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: { code: ErrorCodes.FORBIDDEN, message: 'Not authorized' } });
      return;
    }

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        status: payment.status,
        paymentMethod: payment.payment_method,
        amountCents: payment.amount_cents,
        currency: payment.currency,
        createdAt: payment.created_at,
        confirmedAt: payment.confirmed_at,
      },
    });
  },
);

// GET /payments/mine — student's own payment history
router.get(
  '/payments/mine',
  (req: AuthRequest, res: Response): void => {
    const payments = getStudentPayments(req.user!.userId);
    res.json({
      success: true,
      data: payments.map((p) => ({
        paymentId: p.id,
        courseId: p.course_id,
        courseName: p.course_name ?? null,
        amountCents: p.amount_cents,
        currency: p.currency,
        paymentMethod: p.payment_method,
        status: p.status,
        createdAt: p.created_at,
        confirmedAt: p.confirmed_at,
      })),
    });
  },
);

// GET /payments/:paymentId/receipt — download PDF receipt (owner or admin)
router.get(
  '/payments/:paymentId/receipt',
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { getReceiptData, generateReceiptPdf } = await import('../services/invoiceService.js');

      const data = getReceiptData(req.params.paymentId);
      if (!data) {
        res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Payment not found' } });
        return;
      }

      // Owner or admin only
      const paymentOwner = queryOne<{ user_id: string }>(
        'SELECT user_id FROM payments WHERE id = ?',
        [req.params.paymentId],
      );
      if (paymentOwner!.user_id !== req.user!.userId && req.user!.role !== 'admin') {
        res.status(403).json({ success: false, error: { code: ErrorCodes.FORBIDDEN, message: 'Not authorized' } });
        return;
      }

      // Only confirmed or waived payments get receipts
      if (data.status !== 'confirmed' && data.status !== 'waived') {
        res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Receipt only available for confirmed or waived payments' } });
        return;
      }

      const pdfBuffer = await generateReceiptPdf(data);
      const filename = `receipt-${data.paymentId.slice(0, 8)}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  },
);

// POST /admin/payments/:paymentId/refund — trigger Paystack refund
router.post(
  '/admin/payments/:paymentId/refund',
  requirePermission('billing.confirm'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const payment = queryOne<{ id: string; status: string; payment_method: string; paystack_reference: string | null }>(
      'SELECT id, status, payment_method, paystack_reference FROM payments WHERE id = ?',
      [req.params.paymentId],
    );

    if (!payment) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Payment not found' } });
      return;
    }

    if (payment.status !== 'confirmed') {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Can only refund confirmed payments' },
      });
      return;
    }

    if (payment.payment_method !== 'paystack') {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Refunds only available for Paystack payments' },
      });
      return;
    }

    const { notes } = req.body ?? {};

    try {
      await paystackCreateRefund(payment.paystack_reference!, notes);
      refundPayment(payment.id, notes || 'Refunded via admin');
      res.json({ success: true, message: 'Refund initiated' });
    } catch (err) {
      console.error('Paystack refund error:', err);
      res.status(502).json({
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Refund gateway error' },
      });
    }
  },
);

// ─── GET /courses/:courseId/tiers — tier config for a course ─────────────────

router.get(
  '/courses/:courseId/tiers',
  (req: AuthRequest, res: Response): void => {
    const { courseId } = req.params;

    const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' } });
      return;
    }

    const tiersEnabled = getTiersEnabled(courseId);
    const pricing = getCoursePricing(courseId);

    res.json({
      success: true,
      data: {
        tiersEnabled,
        priceCents: pricing?.price_cents ?? 0,
        currency: pricing?.currency ?? 'USD',
        isFree: !pricing || pricing.price_cents === 0,
      },
    });
  },
);

// ─── GET /badges/:badgeId — badge data (owner or admin) ─────────────────────

router.get(
  '/badges/:badgeId',
  (req: AuthRequest, res: Response): void => {
    const { badgeId } = req.params;
    const badge = getBadge(badgeId);

    if (!badge) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Badge not found' } });
      return;
    }

    // Owner or admin only
    if (badge.user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: { code: ErrorCodes.FORBIDDEN, message: 'Not authorized' } });
      return;
    }

    res.json({
      success: true,
      data: {
        badgeId: badge.id,
        userId: badge.user_id,
        courseId: badge.course_id,
        applicationId: badge.application_id,
        badgeSvg: badge.badge_svg,
        badgeHash: badge.badge_hash,
        createdAt: badge.created_at,
      },
    });
  },
);

// ─── GET /badges/:badgeId/download — SVG file download ──────────────────────

router.get(
  '/badges/:badgeId/download',
  (req: AuthRequest, res: Response): void => {
    const { badgeId } = req.params;
    const badge = getBadge(badgeId);

    if (!badge) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Badge not found' } });
      return;
    }

    if (badge.user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: { code: ErrorCodes.FORBIDDEN, message: 'Not authorized' } });
      return;
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${badgeId.slice(0, 8)}.svg"`);
    res.send(badge.badge_svg);
  },
);

export default router;
