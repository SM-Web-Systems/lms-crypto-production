/**
 * cohorts — Phase 11 C3: sponsor cohort admin endpoints.
 */

import { Router, type Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
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
} from '../services/cohortService.js';

const router = Router();

// POST /admin/cohorts — create cohort
router.post('/admin/cohorts', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  const { name, courseId, selectedTier, memberUserIds } = req.body;

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
router.get('/admin/cohorts', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  const courseId = req.query.courseId as string | undefined;
  const cohorts = listCohorts(courseId ? { courseId } : undefined);
  res.json({ success: true, data: { cohorts, total: cohorts.length } });
});

// GET /admin/cohorts/:cohortId — get cohort detail
router.get('/admin/cohorts/:cohortId', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  const result = getCohort(req.params.cohortId);
  if (!result) {
    res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: 'Cohort not found' } });
    return;
  }
  res.json({ success: true, data: result });
});

// POST /admin/cohorts/:cohortId/members — add members
router.post('/admin/cohorts/:cohortId/members', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
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
router.delete('/admin/cohorts/:cohortId/members/:userId', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  const removed = removeMember(req.params.cohortId, req.params.userId);
  if (!removed) {
    res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Member not found in cohort' } });
    return;
  }
  res.json({ success: true, data: { removed: true } });
});

// POST /admin/cohorts/:cohortId/apply — bulk-apply
router.post('/admin/cohorts/:cohortId/apply', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
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
router.post('/admin/cohorts/:cohortId/pay', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
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

export default router;
