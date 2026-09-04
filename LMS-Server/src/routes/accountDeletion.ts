/**
 * Account Deletion Routes — user-facing deletion request lifecycle.
 */

import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { queryOne } from '../config/database.js';
import {
  createDeletionRequest,
  cancelDeletionRequest,
  getDeletionStatus,
} from '../services/deletionService.js';

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /account/delete:
 *   post:
 *     tags: [Account]
 *     summary: Request account deletion
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirmation]
 *             properties:
 *               confirmation: { type: string, description: "Must be 'DELETE MY ACCOUNT'" }
 *     responses:
 *       200: { description: Deletion request created }
 *       400: { description: Missing confirmation }
 *       403: { description: Admins cannot self-delete or user on legal hold }
 *       409: { description: Already pending deletion }
 */
router.post('/delete', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);

    // Admins cannot self-delete
    if (req.user?.role === 'admin') {
      throw new AppError('Administrators cannot delete their own accounts', 403, ErrorCodes.FORBIDDEN);
    }

    // Require confirmation string
    const { confirmation } = req.body;
    if (confirmation !== 'DELETE MY ACCOUNT') {
      throw new AppError(
        "Confirmation required: send { confirmation: 'DELETE MY ACCOUNT' }",
        400,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // Check current deletion state
    const user = queryOne<{ deletion_status: string | null }>(
      'SELECT deletion_status FROM users WHERE id = ?',
      [userId]
    );
    if (!user) throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);

    if (user.deletion_status === 'legal_hold') {
      throw new AppError(
        'Account is under legal hold and cannot be deleted',
        403,
        ErrorCodes.FORBIDDEN
      );
    }

    if (user.deletion_status === 'pending_deletion') {
      throw new AppError('Deletion request already pending', 409, ErrorCodes.DUPLICATE_ENTRY);
    }

    if (user.deletion_status === 'finalized') {
      throw new AppError('Account is already deleted', 410, ErrorCodes.NOT_FOUND);
    }

    const result = createDeletionRequest(userId);

    res.json({
      success: true,
      data: {
        requestId: result.requestId,
        gracePeriodEndsAt: result.gracePeriodEndsAt,
        message: 'Account deletion requested. You have 30 days to cancel.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /account/delete/cancel:
 *   post:
 *     tags: [Account]
 *     summary: Cancel pending account deletion
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Deletion cancelled }
 *       404: { description: No pending deletion request }
 */
router.post('/delete/cancel', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);

    const cancelled = cancelDeletionRequest(userId);
    if (!cancelled) {
      throw new AppError('No pending deletion request found', 404, ErrorCodes.NOT_FOUND);
    }

    res.json({
      success: true,
      data: { message: 'Account deletion cancelled. Your account is restored.' },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /account/delete/status:
 *   get:
 *     tags: [Account]
 *     summary: Get current deletion request status
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Deletion status }
 */
router.get('/delete/status', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);

    const status = getDeletionStatus(userId);
    if (!status) {
      res.json({ success: true, data: { status: 'none' } });
      return;
    }

    res.json({
      success: true,
      data: {
        status: status.status,
        gracePeriodEndsAt: status.gracePeriodEndsAt,
        requestedAt: status.requestedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
