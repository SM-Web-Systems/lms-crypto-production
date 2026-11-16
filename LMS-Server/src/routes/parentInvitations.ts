import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import {
  inviteChild, listParentInvitations, cancelParentInvitation, myPendingParentInvitations, respondToParentInvitation,
} from '../services/parentInvitationService.js';
import { deliverInvitationEmail, listEmailInvitations, cancelEmailInvitation, claimEmailInvitation } from '../services/emailInvitationService.js';

const router = Router();

// POST /parent/children/invite — invite a learner who already has an account. They are linked only after accepting.
// The answer never says whether the email belongs to an account, so the endpoint can't be used to find users.
router.post('/parent/children/invite', authenticate, requirePermission('student.view_assigned'), (req: AuthRequest, res: Response): void => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email || email.length > 254 || !email.includes('@')) {
    res.status(400).json({ success: false, error: 'A learner email is required' });
    return;
  }
  const outcome = inviteChild(req.user!.userId, email);
  deliverInvitationEmail({ kind: 'parent', targetId: req.user!.userId, inviterId: req.user!.userId, email }, outcome);
  res.status(202).json({ success: true, message: 'If a learner account exists for that email, an invitation has been sent. You are linked when they accept it.' });
});

// GET /parent/children/invitations — invitations this parent has sent
router.get('/parent/children/invitations', authenticate, requirePermission('student.view_assigned'), (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: { invitations: listParentInvitations(req.user!.userId), emailed: listEmailInvitations('parent', req.user!.userId, req.user!.userId) } });
});

// DELETE /parent/children/invitations/:id — withdraw a pending invitation
router.delete('/parent/children/invitations/:id', authenticate, requirePermission('student.view_assigned'), (req: AuthRequest, res: Response): void => {
  const me = req.user!.userId;
  if (!cancelParentInvitation(me, req.params.id) && !cancelEmailInvitation('parent', me, me, req.params.id)) {
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

// POST /invitations/claim — the signed-in learner opened an emailed sign-up link. The request becomes an ordinary
// pending invitation, which they still accept or decline. Only the account with the invited email can claim it.
router.post('/invitations/claim', authenticate, (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token || token.length > 200) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'token is required' } }); return; }
  const result = claimEmailInvitation(req.user!.userId, token);
  if (!result.ok) {
    res.status(result.reason === 'wrong_account' ? 403 : 404).json({ success: false, error: {
      code: result.reason === 'wrong_account' ? 'WRONG_ACCOUNT' : 'NOT_FOUND',
      message: result.reason === 'wrong_account' ? 'This invitation was sent to a different email address. Sign in with that address to see it.' : 'This invitation link has expired or was already used.',
    } });
    return;
  }
  res.json({ success: true, data: { kind: result.kind } });
});

export default router;
