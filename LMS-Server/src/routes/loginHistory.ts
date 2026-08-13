import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query } from '../config/database.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// GET /login-history — own login history
router.get('/login-history', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const history = query<{ login_at: string; ip_address: string; user_agent: string; auth_method: string }>(
    'SELECT login_at, ip_address, user_agent, auth_method FROM login_history WHERE user_id = ? ORDER BY login_at DESC LIMIT 50',
    [userId],
  );
  res.json({ success: true, data: { history } });
});

// GET /admin/users/:id/login-history — any user (admin+)
router.get(
  '/admin/users/:id/login-history',
  authenticate,
  requirePermission('student.login_history'),
  (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const history = query<{ login_at: string; ip_address: string; user_agent: string; auth_method: string }>(
      'SELECT login_at, ip_address, user_agent, auth_method FROM login_history WHERE user_id = ? ORDER BY login_at DESC LIMIT 50',
      [id],
    );
    res.json({ success: true, data: { history } });
  },
);

export default router;
