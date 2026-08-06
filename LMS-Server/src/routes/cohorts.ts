/**
 * cohorts — Phase 11 C3: sponsor cohort admin endpoints.
 */

import { Router, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { ErrorCodes } from '../types/index.js';
import {
  createCohort,
  listCohorts,
  getCohort,
  addMembers,
  removeMember,
  bulkApply,
  bulkPay,
  transitionCohortStatus,
  getStatusLog,
  bulkInviteToCohort,
  getSpendingReport,
  sendPaymentReminders,
} from '../services/cohortService.js';

const router = Router();

// POST /admin/cohorts — create cohort
/**
 * @openapi
 * /admin/cohorts:
 *   post:
 *     tags: [Cohorts]
 *     summary: Create cohort
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, courseId]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Cohort name
 *               courseId:
 *                 type: string
 *                 description: Course ID for this cohort
 *               selectedTier:
 *                 type: string
 *                 enum: [free, paid]
 *                 description: Certificate tier for cohort members (defaults to 'free')
 *               memberUserIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional initial member user IDs
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Optional cohort start date
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: Optional cohort end date
 *     responses:
 *       '201':
 *         description: Cohort created successfully
 *       '400':
 *         description: Validation error or tier not available
 *       '404':
 *         description: Course not found
 */
router.post('/admin/cohorts', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  const { name, courseId, selectedTier, memberUserIds, startDate, endDate } = req.body;

  if (!name || !courseId) {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'name and courseId are required' } });
    return;
  }

  if (selectedTier && selectedTier !== 'free' && selectedTier !== 'paid') {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: "selectedTier must be 'free' or 'paid'" } });
    return;
  }

  try {
    const cohort = createCohort({
      name,
      sponsorUserId: req.user!.userId,
      courseId,
      selectedTier: selectedTier || 'free',
      memberUserIds,
      startDate,
      endDate,
    });
    res.status(201).json({ success: true, data: cohort });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: err.message } });
    } else if (err.code === 'TIER_NOT_AVAILABLE') {
      res.status(400).json({ success: false, error: { code: ErrorCodes.TIER_NOT_AVAILABLE, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

// GET /admin/cohorts — list cohorts
/**
 * @openapi
 * /admin/cohorts:
 *   get:
 *     tags: [Cohorts]
 *     summary: List cohorts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: courseId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter cohorts by course ID
 *     responses:
 *       '200':
 *         description: List of cohorts with total count
 */
router.get('/admin/cohorts', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  const courseId = req.query.courseId as string | undefined;
  const cohorts = listCohorts(courseId ? { courseId } : undefined);
  res.json({ success: true, data: { cohorts, total: cohorts.length } });
});

// GET /admin/cohorts/spending-report — spending report (MUST be before :cohortId)
/**
 * @openapi
 * /admin/cohorts/spending-report:
 *   get:
 *     tags: [Cohorts]
 *     summary: Get spending report
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Aggregated sponsor spending report across all cohorts
 */
router.get('/admin/cohorts/spending-report', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  const report = getSpendingReport();
  res.json({ success: true, data: report });
});

// GET /admin/cohorts/:cohortId — get cohort detail
/**
 * @openapi
 * /admin/cohorts/{cohortId}:
 *   get:
 *     tags: [Cohorts]
 *     summary: Get cohort detail
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cohort ID
 *     responses:
 *       '200':
 *         description: Cohort details including members and completion stats
 *       '404':
 *         description: Cohort not found
 */
router.get('/admin/cohorts/:cohortId', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  const result = getCohort(req.params.cohortId);
  if (!result) {
    res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: 'Cohort not found' } });
    return;
  }
  res.json({ success: true, data: result });
});

// POST /admin/cohorts/:cohortId/members — add members
/**
 * @openapi
 * /admin/cohorts/{cohortId}/members:
 *   post:
 *     tags: [Cohorts]
 *     summary: Add members to cohort
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cohort ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user IDs to add to the cohort
 *     responses:
 *       '200':
 *         description: Members added successfully
 *       '400':
 *         description: userIds array is required
 *       '404':
 *         description: Cohort not found
 */
router.post('/admin/cohorts/:cohortId/members', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'userIds array is required' } });
    return;
  }
  try {
    const result = addMembers(req.params.cohortId, userIds);
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err.code === 'COHORT_NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

// DELETE /admin/cohorts/:cohortId/members/:userId — remove member
/**
 * @openapi
 * /admin/cohorts/{cohortId}/members/{userId}:
 *   delete:
 *     tags: [Cohorts]
 *     summary: Remove member from cohort
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cohort ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to remove
 *     responses:
 *       '200':
 *         description: Member removed successfully
 *       '404':
 *         description: Member not found in cohort
 */
router.delete('/admin/cohorts/:cohortId/members/:userId', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  const removed = removeMember(req.params.cohortId, req.params.userId);
  if (!removed) {
    res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Member not found in cohort' } });
    return;
  }
  res.json({ success: true, data: { removed: true } });
});

// POST /admin/cohorts/:cohortId/apply — bulk-apply
/**
 * @openapi
 * /admin/cohorts/{cohortId}/apply:
 *   post:
 *     tags: [Cohorts]
 *     summary: Bulk apply for certificates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cohort ID
 *     responses:
 *       '200':
 *         description: Bulk certificate applications created for all eligible cohort members
 *       '400':
 *         description: Cohort is empty
 *       '404':
 *         description: Cohort not found
 */
router.post('/admin/cohorts/:cohortId/apply', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  try {
    const result = bulkApply(req.params.cohortId, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err.code === 'COHORT_NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: err.message } });
    } else if (err.code === 'COHORT_EMPTY') {
      res.status(400).json({ success: false, error: { code: ErrorCodes.COHORT_EMPTY, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

// POST /admin/cohorts/:cohortId/pay — bulk payment
/**
 * @openapi
 * /admin/cohorts/{cohortId}/pay:
 *   post:
 *     tags: [Cohorts]
 *     summary: Record bulk payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cohort ID
 *     responses:
 *       '201':
 *         description: Bulk payment recorded for all cohort members
 *       '400':
 *         description: Validation error or cohort is empty
 *       '404':
 *         description: Cohort not found
 *       '409':
 *         description: Cohort payment already processed
 */
router.post('/admin/cohorts/:cohortId/pay', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  try {
    const result = bulkPay(req.params.cohortId, req.user!.userId);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    if (err.code === 'COHORT_NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: err.message } });
    } else if (err.code === 'VALIDATION_ERROR') {
      res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: err.message } });
    } else if (err.code === 'COHORT_ALREADY_PAID') {
      res.status(409).json({ success: false, error: { code: ErrorCodes.COHORT_ALREADY_PAID, message: err.message } });
    } else if (err.code === 'COHORT_EMPTY') {
      res.status(400).json({ success: false, error: { code: ErrorCodes.COHORT_EMPTY, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

// PATCH /admin/cohorts/:cohortId/status — admin override
/**
 * @openapi
 * /admin/cohorts/{cohortId}/status:
 *   patch:
 *     tags: [Cohorts]
 *     summary: Override cohort status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cohort ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, completed]
 *                 description: Target status to transition to
 *               reason:
 *                 type: string
 *                 description: Optional reason for the status override
 *     responses:
 *       '200':
 *         description: Cohort status updated
 *       '400':
 *         description: Invalid status value or invalid transition
 */
router.patch('/admin/cohorts/:cohortId/status', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  const { status, reason } = req.body;
  if (!status || (status !== 'active' && status !== 'completed')) {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: "status must be 'active' or 'completed'" } });
    return;
  }

  const transitioned = transitionCohortStatus(
    req.params.cohortId,
    status,
    `admin:${req.user!.userId}`,
    reason,
  );

  if (!transitioned) {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Invalid status transition' } });
    return;
  }

  res.json({ success: true, data: { cohortId: req.params.cohortId, status } });
});

// GET /admin/cohorts/:cohortId/status-log — transition history
/**
 * @openapi
 * /admin/cohorts/{cohortId}/status-log:
 *   get:
 *     tags: [Cohorts]
 *     summary: Get status transition history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cohort ID
 *     responses:
 *       '200':
 *         description: Chronological log of all status transitions for the cohort
 */
router.get('/admin/cohorts/:cohortId/status-log', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  const log = getStatusLog(req.params.cohortId);
  res.json({ success: true, data: { log } });
});

// POST /admin/cohorts/:cohortId/invite — bulk invite emails to cohort
/**
 * @openapi
 * /admin/cohorts/{cohortId}/invite:
 *   post:
 *     tags: [Cohorts]
 *     summary: Bulk email invite
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cohort ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emails]
 *             properties:
 *               emails:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *                 description: Array of email addresses to invite
 *     responses:
 *       '200':
 *         description: Invitations sent to all provided email addresses
 *       '400':
 *         description: emails array is required
 *       '404':
 *         description: Cohort not found
 */
router.post('/admin/cohorts/:cohortId/invite', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  const { emails } = req.body;
  if (!Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'emails array is required' } });
    return;
  }
  try {
    const result = bulkInviteToCohort(req.params.cohortId, emails);
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err.code === 'COHORT_NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

// POST /admin/cohorts/:cohortId/send-reminder — send payment reminders
/**
 * @openapi
 * /admin/cohorts/{cohortId}/send-reminder:
 *   post:
 *     tags: [Cohorts]
 *     summary: Send payment reminders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cohort ID
 *     responses:
 *       '200':
 *         description: Payment reminder emails sent to cohort members with pending payments
 *       '404':
 *         description: Cohort not found
 */
router.post('/admin/cohorts/:cohortId/send-reminder', authenticate, requirePermission('cohort.manage'), (req: AuthRequest, res: Response): void => {
  try {
    const result = sendPaymentReminders(req.params.cohortId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err.code === 'COHORT_NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

export default router;
