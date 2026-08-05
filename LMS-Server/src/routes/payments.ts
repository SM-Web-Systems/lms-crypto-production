/**
 * Payment routes — Phase 11 C1a: pricing CRUD + manual payment confirmation.
 * Phase 11 C2: tier config + badge endpoints.
 */

import { Router, type Response, type NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { queryOne, execute } from '../config/database.js';
import { ErrorCodes, type AuthRequest } from '../types/index.js';
import {
  getCoursePricing,
  setCoursePricing,
  confirmPayment,
  waivePayment,
  listPayments,
} from '../services/paymentService.js';
import { getTiersEnabled, getBadge } from '../services/badgeService.js';

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
    res.json({
      success: true,
      data: {
        courseId,
        priceCents: pricing?.price_cents ?? 0,
        currency: pricing?.currency ?? 'USD',
        isFree: !pricing || pricing.price_cents === 0,
      },
    });
  },
);

// ─── Admin-only routes below ─────────────────────────────────────────────────

// ─── PUT /admin/courses/:courseId/pricing ─────────────────────────────────────

router.put(
  '/admin/courses/:courseId/pricing',
  authorize('admin'),
  (req: AuthRequest, res: Response): void => {
    const { courseId } = req.params;
    const { priceCents, tiersEnabled } = req.body;

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

    const updatedTiers = getTiersEnabled(courseId);

    res.json({
      success: true,
      data: {
        courseId,
        priceCents: pricing.price_cents,
        currency: pricing.currency,
        isFree: pricing.price_cents === 0,
        tiersEnabled: updatedTiers,
      },
    });
  },
);

// ─── POST /admin/payments/:paymentId/confirm ─────────────────────────────────

router.post(
  '/admin/payments/:paymentId/confirm',
  authorize('admin'),
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
  authorize('admin'),
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
  authorize('admin'),
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
