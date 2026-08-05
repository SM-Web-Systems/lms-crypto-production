import { Router } from 'express';
import {
  bulkInvite,
  getInvites,
  revokeInvite,
  getInviteByToken,
  acceptInvite,
} from '../controllers/invitesController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

// Public-ish: anyone can look up an invite token (needed pre-signup)
router.get('/accept', authenticate, getInviteByToken);
router.post('/accept', authenticate, acceptInvite);

// Admin-only course invite management
router.post('/courses/:courseId/invite', authenticate, requirePermission('course.enroll_others'), bulkInvite);
router.get('/courses/:courseId/invites', authenticate, requirePermission('course.enroll_others'), getInvites);
router.delete('/courses/:courseId/invites/:inviteId', authenticate, requirePermission('course.enroll_others'), revokeInvite);

export default router;
