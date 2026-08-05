import { Router } from 'express';
import {
  getSubmissions,
  getSubmission,
  createSubmission,
  updateSubmission,
  deleteSubmission,
  downloadSubmission,
  reviewSubmission,
} from '../controllers/submissionsController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { upload } from '../utils/fileUpload.js';

const router = Router();

// All submission routes require authentication
router.use(authenticate);

// GET /submissions - Get all submissions (filtered by role)
router.get('/', getSubmissions);

// GET /submissions/:id - Get single submission
router.get('/:id', getSubmission);

// POST /submissions - Create new submission (students only)
router.post('/', requirePermission('course.submit'), upload.single('file'), createSubmission);

// PUT /submissions/:id - Update submission (students only, pending status)
router.put('/:id', requirePermission('course.submit'), updateSubmission);

// DELETE /submissions/:id - Delete submission
router.delete('/:id', deleteSubmission);

// GET /submissions/:id/download - Download submission file
router.get('/:id/download', downloadSubmission);

// POST /submissions/:id/review - Review submission (admin or lecturer — scope enforced in controller)
router.post('/:id/review', requirePermission('course.grade'), reviewSubmission);

export default router;

