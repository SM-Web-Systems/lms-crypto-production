/**
 * employer.ts — Phase B: Employer-scoped endpoints.
 *
 * Team management via user_groups (group_type = 'team') and billing.
 */

import { Router, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { ErrorCodes } from '../types/index.js';
import { execute, query, queryOne } from '../config/database.js';

const router = Router();

// GET /employer/dashboard — team stats
router.get(
  '/employer/dashboard',
  authenticate,
  requirePermission('cohort.view_own'),
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;

    const teams = query<{
      id: string;
      name: string;
      member_count: number;
    }>(
      `SELECT ug.id, ug.name,
              (SELECT COUNT(*) FROM user_group_members ugm WHERE ugm.group_id = ug.id) AS member_count
       FROM user_groups ug
       WHERE ug.owner_user_id = ? AND ug.group_type = 'team'`,
      [userId],
    );

    const totalTeams = teams.length;
    const totalMembers = teams.reduce((sum, t) => sum + t.member_count, 0);

    res.json({
      success: true,
      data: {
        totalTeams,
        totalMembers,
        teams,
      },
    });
  },
);

// GET /employer/teams — list own teams
router.get(
  '/employer/teams',
  authenticate,
  requirePermission('group.manage'),
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;

    const teams = query<{
      id: string;
      name: string;
      group_type: string;
      created_at: string;
      member_count: number;
    }>(
      `SELECT ug.id, ug.name, ug.group_type, ug.created_at,
              (SELECT COUNT(*) FROM user_group_members ugm WHERE ugm.group_id = ug.id) AS member_count
       FROM user_groups ug
       WHERE ug.owner_user_id = ? AND ug.group_type = 'team'
       ORDER BY ug.created_at DESC`,
      [userId],
    );

    res.json({
      success: true,
      data: { teams, total: teams.length },
    });
  },
);

// POST /employer/teams — create team
router.post(
  '/employer/teams',
  authenticate,
  requirePermission('group.create'),
  (req: AuthRequest, res: Response): void => {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'name is required' },
      });
      return;
    }

    const id = uuidv4();
    execute(
      `INSERT INTO user_groups (id, name, group_type, owner_user_id)
       VALUES (?, ?, 'team', ?)`,
      [id, name.trim(), req.user!.userId],
    );

    res.status(201).json({
      success: true,
      data: { id, name: name.trim(), group_type: 'team', owner_user_id: req.user!.userId },
    });
  },
);

// DELETE /employer/teams/:id — delete own team
router.delete(
  '/employer/teams/:id',
  authenticate,
  requirePermission('group.manage'),
  (req: AuthRequest, res: Response): void => {
    const team = queryOne<{ id: string; owner_user_id: string }>(
      `SELECT id, owner_user_id FROM user_groups WHERE id = ? AND group_type = 'team'`,
      [req.params.id],
    );

    if (!team) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Team not found' },
      });
      return;
    }

    if (team.owner_user_id !== req.user!.userId) {
      res.status(403).json({
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: 'Not your team' },
      });
      return;
    }

    execute('DELETE FROM user_groups WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { deleted: true } });
  },
);

// POST /employer/teams/:id/members — add member
router.post(
  '/employer/teams/:id/members',
  authenticate,
  requirePermission('group.manage'),
  (req: AuthRequest, res: Response): void => {
    const { userId } = req.body;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'userId is required' },
      });
      return;
    }

    const team = queryOne<{ id: string; owner_user_id: string }>(
      `SELECT id, owner_user_id FROM user_groups WHERE id = ? AND group_type = 'team'`,
      [req.params.id],
    );

    if (!team) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Team not found' },
      });
      return;
    }

    if (team.owner_user_id !== req.user!.userId) {
      res.status(403).json({
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: 'Not your team' },
      });
      return;
    }

    // Check user exists
    const user = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'User not found' },
      });
      return;
    }

    execute(
      'INSERT OR IGNORE INTO user_group_members (group_id, user_id) VALUES (?, ?)',
      [req.params.id, userId],
    );

    res.status(201).json({
      success: true,
      data: { group_id: req.params.id, user_id: userId },
    });
  },
);

// DELETE /employer/teams/:id/members/:userId — remove member
router.delete(
  '/employer/teams/:id/members/:userId',
  authenticate,
  requirePermission('group.manage'),
  (req: AuthRequest, res: Response): void => {
    const team = queryOne<{ id: string; owner_user_id: string }>(
      `SELECT id, owner_user_id FROM user_groups WHERE id = ? AND group_type = 'team'`,
      [req.params.id],
    );

    if (!team) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Team not found' },
      });
      return;
    }

    if (team.owner_user_id !== req.user!.userId) {
      res.status(403).json({
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: 'Not your team' },
      });
      return;
    }

    const changes = execute(
      'DELETE FROM user_group_members WHERE group_id = ? AND user_id = ?',
      [req.params.id, req.params.userId],
    );

    if (changes === 0) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Member not found in team' },
      });
      return;
    }

    res.json({ success: true, data: { removed: true } });
  },
);

// GET /employer/billing — own payment history
router.get(
  '/employer/billing',
  authenticate,
  requirePermission('billing.view_own'),
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;

    const payments = query<{
      id: string;
      course_id: string;
      amount_cents: number;
      currency: string;
      payment_method: string;
      status: string;
      created_at: string;
    }>(
      `SELECT id, course_id, amount_cents, currency, payment_method, status, created_at
       FROM payments
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId],
    );

    res.json({
      success: true,
      data: { payments, total: payments.length },
    });
  },
);

export default router;
