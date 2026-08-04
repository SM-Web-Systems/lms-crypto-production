/**
 * Notification routes — Phase 7 C2.
 * Mounted at /api/v1 (full paths: /api/v1/notifications/...).
 *
 * GET  /notifications          — recent notifications for authenticated user
 * PUT  /notifications/:id/read — mark a notification as read (idempotent)
 */

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';

const router = Router();

// ─── GET /notifications ─────────────────────────────────────────────────────
router.get(
  '/notifications',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;

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

    const rows = query<NotifRow>(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [userId]
    );

    const countRow = queryOne<{ cnt: number }>(
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
        unreadCount: countRow?.cnt ?? 0,
      },
    });
  }
);

// ─── PUT /notifications/:id/read ────────────────────────────────────────────
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

    // Idempotent — UPDATE even if already read
    execute('UPDATE notifications SET read = 1 WHERE id = ?', [id]);

    res.json({ success: true });
  }
);

export default router;
