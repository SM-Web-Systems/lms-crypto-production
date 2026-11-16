import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import {
  inviteChild, listParentInvitations, cancelParentInvitation, myPendingParentInvitations, respondToParentInvitation,
} from '../services/parentInvitationService.js';

const router = Router();

// POST /parent/children/invite — invite a learner who already has an account. They are linked only after accepting.
// The answer never says whether the email belongs to an account, so the endpoint can't be used to find users.
router.post('/parent/children/invite', authenticate, requirePermission('student.view_assigned'), (req: AuthRequest, res: Response): void => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email || email.length > 254 || !email.includes('@')) {
    res.status(400).json({ success: false, error: 'A learner email is required' });
    return;
  }
  inviteChild(req.user!.userId, email);
  res.status(202).json({ success: true, message: 'If a learner account exists for that email, an invitation has been sent. You are linked when they accept it.' });
});

// GET /parent/children/invitations — invitations this parent has sent
router.get('/parent/children/invitations', authenticate, requirePermission('student.view_assigned'), (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: { invitations: listParentInvitations(req.user!.userId) } });
});

// DELETE /parent/children/invitations/:id — withdraw a pending invitation
router.delete('/parent/children/invitations/:id', authenticate, requirePermission('student.view_assigned'), (req: AuthRequest, res: Response): void => {
  if (!cancelParentInvitation(req.user!.userId, req.params.id)) {
    res.status(404).json({ success: false, error: 'Invitation not found' });
    return;
  }
  res.json({ success: true });
});

// GET /students/me/parent-invitations — parents who asked to link to me and are waiting for an answer
router.get('/students/me/parent-invitations', authenticate, (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: { invitations: myPendingParentInvitations(req.user!.userId) } });
});

for (const action of ['accept', 'decline'] as const) {
  router.post(`/students/me/parent-invitations/:id/${action}`, authenticate, (req: AuthRequest, res: Response): void => {
    res.setHeader('Cache-Control', 'no-store');
    if (!respondToParentInvitation(req.user!.userId, req.params.id, action === 'accept')) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invitation not found or already answered.' } });
      return;
    }
    res.json({ success: true, data: { status: action === 'accept' ? 'accepted' : 'declined' } });
  });
}

export default router;
