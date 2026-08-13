import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

/**
 * @openapi
 * /sessions:
 *   get:
 *     tags: [Sessions]
 *     summary: List own active sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active sessions for the authenticated user
 *       401:
 *         description: Unauthorized
 */
router.get('/sessions', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const sessions = query<{
    id: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
    last_active: string;
    expires_at: string;
  }>(
    "SELECT id, ip_address, user_agent, created_at, last_active, expires_at FROM active_sessions WHERE user_id = ? AND expires_at > datetime('now') AND revoked_at IS NULL ORDER BY last_active DESC",
    [userId],
  );
  res.json({ success: true, data: { sessions } });
});

/**
 * @openapi
 * /sessions/{id}:
 *   delete:
 *     tags: [Sessions]
 *     summary: Revoke own session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session revoked
 *       404:
 *         description: Session not found
 */
router.delete('/sessions/:id', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  const session = queryOne<{ id: string }>(
    'SELECT id FROM active_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    [id, userId],
  );
  if (!session) {
    res.status(404).json({ success: false, error: { message: 'Session not found' } });
    return;
  }
  // Hard-delete own session — user is voluntarily logging out of this device
  execute('DELETE FROM active_sessions WHERE id = ?', [id]);
  res.json({ success: true, data: { message: 'Session revoked' } });
});

/**
 * @openapi
 * /admin/sessions/{userId}:
 *   get:
 *     tags: [Sessions]
 *     summary: List any user's active sessions (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of active sessions for the specified user
 *       403:
 *         description: Forbidden
 */
router.get(
  '/admin/sessions/:userId',
  authenticate,
  requirePermission('user.manage'),
  (req: AuthRequest, res: Response) => {
    const { userId } = req.params;
    const sessions = query<{
      id: string;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
      last_active: string;
      expires_at: string;
    }>(
      "SELECT id, ip_address, user_agent, created_at, last_active, expires_at FROM active_sessions WHERE user_id = ? AND expires_at > datetime('now') AND revoked_at IS NULL ORDER BY last_active DESC",
      [userId],
    );
    res.json({ success: true, data: { sessions } });
  },
);

/**
 * @openapi
 * /admin/sessions/{userId}/{id}:
 *   delete:
 *     tags: [Sessions]
 *     summary: Force-logout a user's session (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session force-revoked
 *       404:
 *         description: Session not found
 */
router.delete(
  '/admin/sessions/:userId/:id',
  authenticate,
  requirePermission('user.manage'),
  (req: AuthRequest, res: Response) => {
    const { userId, id } = req.params;
    const session = queryOne<{ id: string }>(
      'SELECT id FROM active_sessions WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    if (!session) {
      res.status(404).json({ success: false, error: { message: 'Session not found' } });
      return;
    }
    // Soft-revoke: set revoked_at so authenticate() can detect the revocation
    // (hard DELETE would make the token look like a pre-F2/test token and slip through)
    execute("UPDATE active_sessions SET revoked_at = datetime('now') WHERE id = ?", [id]);
    res.json({ success: true, data: { message: 'Session force-revoked' } });
  },
);

export default router;
