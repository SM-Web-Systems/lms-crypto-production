import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query, queryOne, execute, db } from '../config/database.js';
import { AuthRequest } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// POST /disputes — create dispute (admin+, not sponsor)
router.post(
  '/disputes',
  authenticate,
  requirePermission('billing.waive'),
  (req: AuthRequest, res: Response) => {
    const { paymentId, reason } = req.body;
    if (!paymentId || !reason) {
      res.status(400).json({ success: false, error: { message: 'paymentId and reason required' } });
      return;
    }

    const payment = queryOne<{ id: string; status: string }>('SELECT id, status FROM payments WHERE id = ?', [paymentId]);
    if (!payment) {
      res.status(404).json({ success: false, error: { message: 'Payment not found' } });
      return;
    }

    const disputeId = uuidv4();
    execute(
      'INSERT INTO disputes (id, payment_id, reason, created_by) VALUES (?, ?, ?, ?)',
      [disputeId, paymentId, reason, req.user!.userId],
    );

    const dispute = queryOne<Record<string, unknown>>('SELECT * FROM disputes WHERE id = ?', [disputeId]);
    res.status(201).json({ success: true, data: { dispute } });
  },
);

// GET /disputes — list disputes (admin+, not sponsor)
router.get(
  '/disputes',
  authenticate,
  requirePermission('billing.waive'),
  (req: AuthRequest, res: Response) => {
    const status = req.query.status as string | undefined;
    let disputes;
    if (status) {
      disputes = query<Record<string, unknown>>('SELECT * FROM disputes WHERE status = ? ORDER BY created_at DESC', [status]);
    } else {
      disputes = query<Record<string, unknown>>('SELECT * FROM disputes ORDER BY created_at DESC');
    }
    res.json({ success: true, data: { disputes } });
  },
);

// GET /disputes/:id — view dispute (admin+, not sponsor)
router.get(
  '/disputes/:id',
  authenticate,
  requirePermission('billing.waive'),
  (req: AuthRequest, res: Response) => {
    const dispute = queryOne<Record<string, unknown>>('SELECT * FROM disputes WHERE id = ?', [req.params.id]);
    if (!dispute) {
      res.status(404).json({ success: false, error: { message: 'Dispute not found' } });
      return;
    }
    res.json({ success: true, data: { dispute } });
  },
);

// POST /disputes/:id/resolve — resolve dispute, trigger atomic refund (admin-2+ ONLY)
router.post(
  '/disputes/:id/resolve',
  authenticate,
  requirePermission('billing.refund'),
  (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { resolutionNote } = req.body;

    const dispute = queryOne<{ id: string; status: string; payment_id: string }>(
      'SELECT id, status, payment_id FROM disputes WHERE id = ?',
      [id],
    );
    if (!dispute) {
      res.status(404).json({ success: false, error: { message: 'Dispute not found' } });
      return;
    }

    if (dispute.status !== 'open' && dispute.status !== 'under_review') {
      res.status(400).json({ success: false, error: { message: 'Dispute already resolved or rejected' } });
      return;
    }

    // Check payment is confirmed (refundable)
    const payment = queryOne<{ status: string }>('SELECT status FROM payments WHERE id = ?', [dispute.payment_id]);
    if (!payment || payment.status !== 'confirmed') {
      res.status(400).json({ success: false, error: { message: 'Only confirmed payments can be refunded' } });
      return;
    }

    // Atomic: wrap both updates in a transaction
    const txn = db.transaction(() => {
      execute(
        "UPDATE disputes SET status = 'resolved', resolved_by = ?, resolution_note = ?, resolved_at = datetime('now') WHERE id = ?",
        [req.user!.userId, resolutionNote ?? null, id],
      );
      execute(
        "UPDATE payments SET status = 'refunded', updated_at = datetime('now') WHERE id = ?",
        [dispute.payment_id],
      );
    });
    txn();

    const updated = queryOne<Record<string, unknown>>('SELECT * FROM disputes WHERE id = ?', [id]);
    res.json({ success: true, data: { dispute: updated } });
  },
);

// POST /disputes/:id/reject — reject dispute without refund (admin-2+ ONLY)
router.post(
  '/disputes/:id/reject',
  authenticate,
  requirePermission('billing.refund'),
  (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { resolutionNote } = req.body;

    const dispute = queryOne<{ id: string; status: string }>('SELECT id, status FROM disputes WHERE id = ?', [id]);
    if (!dispute) {
      res.status(404).json({ success: false, error: { message: 'Dispute not found' } });
      return;
    }
    if (dispute.status !== 'open' && dispute.status !== 'under_review') {
      res.status(400).json({ success: false, error: { message: 'Dispute already resolved or rejected' } });
      return;
    }

    execute(
      "UPDATE disputes SET status = 'rejected', resolved_by = ?, resolution_note = ?, resolved_at = datetime('now') WHERE id = ?",
      [req.user!.userId, resolutionNote ?? null, id],
    );

    const updated = queryOne<Record<string, unknown>>('SELECT * FROM disputes WHERE id = ?', [id]);
    res.json({ success: true, data: { dispute: updated } });
  },
);

export default router;
