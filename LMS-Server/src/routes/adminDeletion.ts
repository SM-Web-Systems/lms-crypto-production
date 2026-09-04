/**
 * Admin Account Deletion Routes — legal hold management and compliance identity access.
 */

import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  placeLegalHold,
  releaseLegalHold,
  getDeletedIdentity,
} from '../services/deletionService.js';

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /admin/users/{userId}/legal-hold:
 *   post:
 *     tags: [Admin, Account]
 *     summary: Place legal hold on user account
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *               reviewDate: { type: string, format: date }
 *     responses:
 *       200: { description: Legal hold placed }
 *       403: { description: Insufficient permissions }
 */
router.post(
  '/users/:userId/legal-hold',
  requirePermission('user.delete'),
  (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { reason, reviewDate } = req.body;

      if (!reason || typeof reason !== 'string' || reason.trim() === '') {
        throw new AppError('Reason is required', 400, ErrorCodes.VALIDATION_ERROR);
      }

      placeLegalHold(userId, reason.trim(), reviewDate, req.user?.userId);

      res.json({
        success: true,
        data: { message: 'Legal hold placed', userId },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /admin/users/{userId}/legal-hold:
 *   delete:
 *     tags: [Admin, Account]
 *     summary: Release legal hold on user account
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Legal hold released }
 *       403: { description: Insufficient permissions }
 */
router.delete(
  '/users/:userId/legal-hold',
  requirePermission('user.delete'),
  (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      releaseLegalHold(userId, req.user?.userId);

      res.json({
        success: true,
        data: { message: 'Legal hold released', userId },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /admin/deleted-identities/{userId}:
 *   get:
 *     tags: [Admin, Account]
 *     summary: View deleted user's original identity (compliance only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Original identity data }
 *       403: { description: Insufficient permissions }
 *       404: { description: No identity snapshot found }
 */
router.get(
  '/deleted-identities/:userId',
  requirePermission('privacy.view_deleted_identity'),
  (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const actorId = req.user?.userId;
      if (!actorId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);

      // Reason can come from query or body
      const reason = (req.query.reason as string) || (req.body?.reason as string) || 'Admin access';

      const identity = getDeletedIdentity(userId, actorId, reason);
      if (!identity) {
        throw new AppError('No identity snapshot found for this user', 404, ErrorCodes.NOT_FOUND);
      }

      res.json({
        success: true,
        data: identity,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
