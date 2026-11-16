import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import {
  requestableRolesFor, createRoleRequest, myRoleRequests, cancelRoleRequest, listRoleRequests, decideRoleRequest,
} from '../services/roleRequestService.js';

const router = Router();

// GET /role-requests/mine — the roles I can ask for, and my requests
router.get('/role-requests/mine', authenticate, (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: { roles: requestableRolesFor(req.user!.userId), requests: myRoleRequests(req.user!.userId) } });
});

// POST /role-requests — ask for a parent, teacher, employer or sponsor role
router.post('/role-requests', authenticate, (req: AuthRequest, res: Response, next: NextFunction): void => {
  try { res.status(201).json({ success: true, data: createRoleRequest(req.user!.userId, req.body?.roleId, req.body?.reason) }); }
  catch (err) { next(err); }
});

// DELETE /role-requests/:id — withdraw my pending request
router.delete('/role-requests/:id', authenticate, (req: AuthRequest, res: Response): void => {
  if (!cancelRoleRequest(req.user!.userId, req.params.id)) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Request not found or already answered' } });
    return;
  }
  res.json({ success: true });
});

// GET /admin/role-requests?status=pending — the review queue
router.get('/admin/role-requests', authenticate, requirePermission('user.assign_role'), (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: { requests: listRoleRequests(String(req.query.status ?? 'pending')) } });
});

for (const action of ['approve', 'decline'] as const) {
  router.post(`/admin/role-requests/:id/${action}`, authenticate, requirePermission('user.assign_role'), (req: AuthRequest, res: Response, next: NextFunction): void => {
    try { res.json({ success: true, data: decideRoleRequest(req.user!.userId, req.params.id, action === 'approve', req.body?.note) }); }
    catch (err) { next(err); }
  });
}

export default router;
