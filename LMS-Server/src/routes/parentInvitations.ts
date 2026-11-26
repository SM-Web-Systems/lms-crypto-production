import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspace } from '../middleware/workspace.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { queryOne } from '../config/database.js';
import { createNotification } from '../services/notificationService.js';
import {
  inviteChild, listParentInvitations, cancelParentInvitation, myPendingParentInvitations, respondToParentInvitation,
} from '../services/parentInvitationService.js';
import { myConnections, unlinkParent, leaveGroup } from '../services/connectionService.js';
import { deliverInvitationEmail, listEmailInvitations, cancelEmailInvitation, claimEmailInvitation } from '../services/emailInvitationService.js';

const router = Router();
// Only parent accounts (and admins) may use the /parent API, whatever permissions another role shares with it.
router.use('/parent', authenticate, requireWorkspace('parent'));

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

// DELETE /parent/children/:childId — the parent ends the link to a child. The child account itself is kept.
router.delete('/parent/children/:childId', authenticate, requirePermission('student.view_assigned'), (req: AuthRequest, res: Response): void => {
  if (!unlinkParent(req.user!.userId, req.params.childId)) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Child not found' } });
    return;
  }
  res.json({ success: true, data: { removed: true } });
});

// GET /students/me/connections — parents linked to me, and the classes and teams I belong to
router.get('/students/me/connections', authenticate, (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: myConnections(req.user!.userId) });
});

// DELETE /students/me/parents/:parentId — I end a parent's link to my account
router.delete('/students/me/parents/:parentId', authenticate, (req: AuthRequest, res: Response): void => {
  if (!unlinkParent(req.params.parentId, req.user!.userId)) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Link not found' } });
    return;
  }
  res.json({ success: true, data: { removed: true } });
});

// DELETE /students/me/groups/:groupId — I leave a class or team
router.delete('/students/me/groups/:groupId', authenticate, (req: AuthRequest, res: Response): void => {
  if (!leaveGroup(req.user!.userId, req.params.groupId)) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'You are not in that class or team' } });
    return;
  }
  // Tell the teacher or employer, who otherwise only notices the smaller member count (best-effort).
  try {
    const group = queryOne<{ owner_user_id: string; name: string; group_type: string }>(
      'SELECT owner_user_id, name, group_type FROM user_groups WHERE id = ?', [req.params.groupId]);
    const learner = queryOne<{ name: string | null }>('SELECT name FROM users WHERE id = ?', [req.user!.userId]);
    if (group) {
      const kind = group.group_type === 'team' ? 'team' : 'class';
      createNotification({
        userId: group.owner_user_id,
        type: 'group_member_left',
        title: `A learner left your ${kind}`,
        body: `${learner?.name ?? 'A learner'} left the ${kind} "${group.name}".`,
        link: kind === 'team' ? '/employer/teams' : '/teacher/classes',
      });
    }
  } catch { /* best-effort */ }
  res.json({ success: true, data: { removed: true } });
});

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
