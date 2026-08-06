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
/**
 * @openapi
 * /accept:
 *   get:
 *     tags: [Invites]
 *     summary: Look up invite by token
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Invite data }
 *       404: { description: Invalid token }
 */
router.get('/accept', authenticate, getInviteByToken);
/**
 * @openapi
 * /accept:
 *   post:
 *     tags: [Invites]
 *     summary: Accept invite
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: Invite accepted }
 */
router.post('/accept', authenticate, acceptInvite);

// Admin-only course invite management
/**
 * @openapi
 * /courses/{courseId}/invite:
 *   post:
 *     tags: [Invites]
 *     summary: Bulk invite to course
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emails]
 *             properties:
 *               emails: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Invites sent }
 *       403: { description: Requires course.enroll_others }
 */
router.post('/courses/:courseId/invite', authenticate, requirePermission('course.enroll_others'), bulkInvite);
/**
 * @openapi
 * /courses/{courseId}/invites:
 *   get:
 *     tags: [Invites]
 *     summary: List course invites
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of invites }
 */
router.get('/courses/:courseId/invites', authenticate, requirePermission('course.enroll_others'), getInvites);
/**
 * @openapi
 * /courses/{courseId}/invites/{inviteId}:
 *   delete:
 *     tags: [Invites]
 *     summary: Revoke invite
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Invite revoked }
 */
router.delete('/courses/:courseId/invites/:inviteId', authenticate, requirePermission('course.enroll_others'), revokeInvite);

export default router;
