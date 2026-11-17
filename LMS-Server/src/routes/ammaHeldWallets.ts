import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getUserRoles } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { importAmmaHeldWallets, queueActivations, ammaWalletStatus } from '../services/ammaHeldWalletService.js';

const router = Router();

/** Changing where certificates are minted and asking AmmaWallet to spend on activation are super admin only. */
function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!getUserRoles(req.user!.userId).includes('super-admin')) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the super admin can do this.' } });
    return;
  }
  next();
}

// POST /admin/amma-wallets/import — store the Amma-held wallets from AmmaWallet's mapping file
router.post('/admin/amma-wallets/import', authenticate, requireSuperAdmin, (req: AuthRequest, res: Response, next: NextFunction): void => {
  try { res.json({ success: true, data: { results: importAmmaHeldWallets(req.user!.userId, req.body?.wallets) } }); }
  catch (err) { next(err); }
});

// GET /admin/amma-wallets/status?userIds=a,b — stored wallet and activation state per learner
router.get('/admin/amma-wallets/status', authenticate, requireSuperAdmin, (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  const ids = String(req.query.userIds ?? '').split(',').map(s => s.trim()).filter(Boolean);
  res.json({ success: true, data: ammaWalletStatus(ids) });
});

// POST /admin/amma-activations — queue one signed activation call per learner for their approved certificate
router.post('/admin/amma-activations', authenticate, requireSuperAdmin, (req: AuthRequest, res: Response, next: NextFunction): void => {
  try { res.json({ success: true, data: { results: queueActivations(req.user!.userId, req.body?.courseId, req.body?.userIds) } }); }
  catch (err) { next(err); }
});

export default router;
