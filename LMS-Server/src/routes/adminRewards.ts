/**
 * adminRewards.ts — Admin reward management routes.
 *
 * GET  /admin/rewards/refund-attempts          — List blocked refund attempts
 * POST /admin/rewards/refund-attempts/:id/retry   — Retry a blocked refund
 * POST /admin/rewards/refund-attempts/:id/resolve — Resolve (waive/escalate) a blocked refund
 * POST /admin/rewards/process-outbox              — Manually trigger outbox processing
 */
import { Router, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { db } from '../config/database.js';
import { refundAllocation } from '../services/rewards/rewardService.js';
import { processOutboxRetries } from '../services/rewards/rewardOutboxWorker.js';
import logger from '../utils/logger.js';

const router = Router();

// ──── GET /admin/rewards/refund-attempts ────

router.get(
  '/refund-attempts',
  authenticate,
  requirePermission('reward.refund_review'),
  (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    let sql = `SELECT id, reward_id, allocation_id, attempted_by_user_id,
                      attempted_amount_stroops, currency_code, status, resolution,
                      resolved_at, resolved_by_user_id, created_at
               FROM reward_refund_attempts WHERE 1=1`;
    const params: unknown[] = [];

    if (status && ['blocked', 'resolved'].includes(status)) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (from) {
      sql += ' AND created_at >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND created_at <= ?';
      params.push(to);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const attempts = db.prepare(sql).all(...params);

    // Count total
    let countSql = 'SELECT COUNT(*) as total FROM reward_refund_attempts WHERE 1=1';
    const countParams: unknown[] = [];
    if (status && ['blocked', 'resolved'].includes(status)) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    if (from) {
      countSql += ' AND created_at >= ?';
      countParams.push(from);
    }
    if (to) {
      countSql += ' AND created_at <= ?';
      countParams.push(to);
    }
    const { total } = db.prepare(countSql).get(...countParams) as { total: number };

    res.json({
      success: true,
      data: attempts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }
);

// ──── POST /admin/rewards/refund-attempts/:id/retry ────

router.post(
  '/refund-attempts/:id/retry',
  authenticate,
  requirePermission('reward.refund'),
  (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { idempotencyKey } = req.body;
    const actorId = req.user!.userId;

    if (!idempotencyKey) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: 'idempotencyKey is required' } });
      return;
    }

    const attempt = db.prepare('SELECT * FROM reward_refund_attempts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!attempt) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Refund attempt not found' } });
      return;
    }

    if (attempt.status === 'resolved') {
      res.status(409).json({ success: false, error: { code: 'ALREADY_RESOLVED', message: 'Attempt is already resolved' } });
      return;
    }

    // Try the refund again using the original actor (who has scope access)
    const result = refundAllocation(
      attempt.allocation_id as string,
      attempt.attempted_by_user_id as string,
      idempotencyKey,
    );

    if ('blocked' in result && result.blocked) {
      // Still blocked
      res.status(409).json({
        success: false,
        error: { code: 'STILL_BLOCKED', message: 'Recipient balance still insufficient' },
      });
      return;
    }

    // Success — update the attempt
    db.prepare(
      `UPDATE reward_refund_attempts
       SET status = 'resolved', resolution = 'retried_success',
           resolved_at = datetime('now'), resolved_by_user_id = ?
       WHERE id = ?`
    ).run(actorId, id);

    // Create audit log
    db.prepare(
      `INSERT INTO reward_refund_audit_log
       (id, attempt_id, reward_id, allocation_id, actor_user_id, action,
        resolution_type, amount_stroops, reason)
       VALUES (?, ?, ?, ?, ?, 'retry', 'retried_success', ?, 'Admin retry succeeded')`
    ).run(
      uuidv4(), id, attempt.reward_id, attempt.allocation_id,
      actorId, attempt.attempted_amount_stroops
    );

    logger.info({ module: 'admin-rewards', attemptId: id, actor: actorId }, 'Refund retry succeeded');

    const updated = db.prepare('SELECT * FROM reward_refund_attempts WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  }
);

// ──── POST /admin/rewards/refund-attempts/:id/resolve ────

router.post(
  '/refund-attempts/:id/resolve',
  authenticate,
  (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { action, reason, idempotencyKey } = req.body;
    const actorId = req.user!.userId;

    if (!action || !reason || !idempotencyKey) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELD', message: 'action, reason, and idempotencyKey are required' },
      });
      return;
    }

    if (!['waive', 'escalate'].includes(action)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACTION', message: 'action must be waive or escalate' },
      });
      return;
    }

    // Permission check: waive requires refund_resolve, escalate requires refund_review
    const requiredPermission = action === 'waive' ? 'reward.refund_resolve' : 'reward.refund_review';

    // Check permission manually since we have dynamic requirements
    const userPerms = db.prepare(
      `SELECT DISTINCT p.name FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`
    ).all(actorId) as Array<{ name: string }>;

    const permNames = userPerms.map(p => p.name);
    if (!permNames.includes(requiredPermission)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: `Requires ${requiredPermission} permission` },
      });
      return;
    }

    const attempt = db.prepare('SELECT * FROM reward_refund_attempts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!attempt) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Refund attempt not found' } });
      return;
    }

    if (attempt.status === 'resolved') {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_RESOLVED', message: 'Attempt is already resolved' },
      });
      return;
    }

    const resolution = action === 'waive' ? 'waived' : 'escalated';

    // Resolve the attempt — NO ledger entry for waive or escalate
    db.prepare(
      `UPDATE reward_refund_attempts
       SET status = 'resolved', resolution = ?,
           resolved_at = datetime('now'), resolved_by_user_id = ?
       WHERE id = ?`
    ).run(resolution, actorId, id);

    // Create immutable audit record
    db.prepare(
      `INSERT INTO reward_refund_audit_log
       (id, attempt_id, reward_id, allocation_id, actor_user_id, action,
        resolution_type, amount_stroops, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuidv4(), id, attempt.reward_id, attempt.allocation_id,
      actorId, action, resolution, attempt.attempted_amount_stroops, reason
    );

    logger.info({
      module: 'admin-rewards', attemptId: id, action, actor: actorId, reason,
    }, `Refund attempt ${action}d`);

    const updated = db.prepare('SELECT * FROM reward_refund_attempts WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  }
);

// ──── POST /admin/rewards/process-outbox ────

router.post(
  '/process-outbox',
  authenticate,
  requirePermission('reward.manage'),
  (_req: AuthRequest, res: Response) => {
    const result = processOutboxRetries();
    res.json({ success: true, data: result });
  }
);

export default router;
