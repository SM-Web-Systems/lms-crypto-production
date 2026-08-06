/**
 * Notification routes — Phase 23 C3: Notifications v2.
 * Mounted at /api/v1 (full paths: /api/v1/notifications/...).
 *
 * GET  /notifications              — paginated + filterable notifications
 * PUT  /notifications/read-all     — mark all unread as read
 * GET  /notifications/preferences  — get user preference overrides
 * PUT  /notifications/preferences  — update preferences (rejects admin_broadcast)
 * PUT  /notifications/:id/read     — mark single notification as read (idempotent)
 * POST /admin/notifications/broadcast — admin broadcast
 */

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { getPreferences, updatePreferences, createBroadcast, CONFIGURABLE_TYPES } from '../services/notificationService.js';

const router = Router();

type NotifRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read: number;
  link: string | null;
  created_at: string;
};

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get paginated notifications
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated notifications with unread count }
 */
router.get(
  '/notifications',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const typeFilter = req.query.type as string | undefined;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (typeFilter) {
      whereClause += ' AND type = ?';
      params.push(typeFilter);
    }

    const countRow = queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM notifications ${whereClause}`,
      params
    );
    const total = countRow?.cnt ?? 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = query<NotifRow>(
      `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const unreadRow = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read = 0',
      [userId]
    );

    const notifications = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      read: r.read === 1,
      link: r.link,
      createdAt: r.created_at,
    }));

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount: unreadRow?.cnt ?? 0,
        page,
        totalPages,
        total,
      },
    });
  }
);

/**
 * @openapi
 * /notifications/read-all:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All notifications marked read }
 */
router.put(
  '/notifications/read-all',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;
    const countBefore = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read = 0',
      [userId]
    );
    execute('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId]);
    res.json({ success: true, data: { updated: countBefore?.cnt ?? 0 } });
  }
);

/**
 * @openapi
 * /notifications/preferences:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notification preferences
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User notification preferences }
 */
router.get(
  '/notifications/preferences',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const prefs = getPreferences(req.user!.userId);
    res.json({ success: true, data: { preferences: prefs } });
  }
);

/**
 * @openapi
 * /notifications/preferences:
 *   put:
 *     tags: [Notifications]
 *     summary: Update notification preferences
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preferences:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string }
 *                     enabled: { type: boolean }
 *     responses:
 *       200: { description: Preferences updated }
 *       400: { description: Cannot configure admin_broadcast }
 */
router.put(
  '/notifications/preferences',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const { preferences } = req.body;

    if (!Array.isArray(preferences)) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'preferences array is required' },
      });
      return;
    }

    if (preferences.some((p: any) => p.type === 'admin_broadcast')) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Cannot configure admin_broadcast preferences' },
      });
      return;
    }

    updatePreferences(req.user!.userId, preferences);
    res.json({ success: true });
  }
);

/**
 * @openapi
 * /notifications/{id}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark notification as read
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Notification marked read }
 *       404: { description: Notification not found }
 */
router.put(
  '/notifications/:id/read',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;
    const { id } = req.params;

    const notif = queryOne<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM notifications WHERE id = ?',
      [id]
    );

    if (!notif) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Notification not found' },
      });
      return;
    }

    if (notif.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: 'Cannot mark another user\'s notification' },
      });
      return;
    }

    execute('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
    res.json({ success: true });
  }
);

/**
 * @openapi
 * /admin/notifications/broadcast:
 *   post:
 *     tags: [Notifications]
 *     summary: Broadcast notification to users
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body, target]
 *             properties:
 *               title: { type: string }
 *               body: { type: string }
 *               target: { type: string, enum: [all, student, lecturer, sponsor] }
 *               link: { type: string }
 *     responses:
 *       200: { description: Broadcast sent }
 *       400: { description: Validation error }
 */
router.post(
  '/admin/notifications/broadcast',
  authenticate,
  requirePermission('notification.broadcast'),
  (req: AuthRequest, res: Response): void => {
    const { title, body, target, link } = req.body;

    if (!title || typeof title !== 'string' || title.length > 200) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'title is required (max 200 chars)' },
      });
      return;
    }

    if (!body || typeof body !== 'string' || body.length > 1000) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'body is required (max 1000 chars)' },
      });
      return;
    }

    const validTargets = ['all', 'student', 'lecturer', 'sponsor'];
    if (!target || !validTargets.includes(target)) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'target must be one of: all, student, lecturer, sponsor' },
      });
      return;
    }

    const sent = createBroadcast({ title, body, target, link });
    res.json({ success: true, data: { sent } });
  }
);

export default router;
