import { Router } from 'express';
import {
  bulkInvite,
  getInvites,
  revokeInvite,
  getInviteByToken,
  acceptInvite,
} from '../controllers/invitesController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Public-ish: anyone can look up an invite token (needed pre-signup)
router.get('/accept', authenticate, getInviteByToken);
router.post('/accept', authenticate, acceptInvite);

// Admin-only course invite management
router.post('/courses/:courseId/invite', authenticate, authorize('admin'), bulkInvite);
router.get('/courses/:courseId/invites', authenticate, authorize('admin'), getInvites);
router.delete('/courses/:courseId/invites/:inviteId', authenticate, authorize('admin'), revokeInvite);

export default router;
