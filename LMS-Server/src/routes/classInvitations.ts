import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import { myPendingInvitations, respondToInvitation } from '../services/classInvitationService.js';

const router = Router();

// GET /students/me/class-invitations — classes I have been invited to and not yet answered
router.get('/students/me/class-invitations', authenticate, (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: { invitations: myPendingInvitations(req.user!.userId) } });
});

for (const action of ['accept', 'decline'] as const) {
  router.post(`/students/me/class-invitations/:id/${action}`, authenticate, (req: AuthRequest, res: Response): void => {
    res.setHeader('Cache-Control', 'no-store');
    if (!respondToInvitation(req.user!.userId, req.params.id, action === 'accept')) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invitation not found or already answered.' } });
      return;
    }
    res.json({ success: true, data: { status: action === 'accept' ? 'accepted' : 'declined' } });
  });
}

export default router;
