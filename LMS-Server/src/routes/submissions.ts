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
import { authenticate, authorize } from '../middleware/auth.js';
import { upload } from '../utils/fileUpload.js';

const router = Router();

// All submission routes require authentication
router.use(authenticate);

// GET /submissions - Get all submissions (filtered by role)
router.get('/', getSubmissions);

// GET /submissions/:id - Get single submission
router.get('/:id', getSubmission);

// POST /submissions - Create new submission (students only)
router.post('/', authorize('student'), upload.single('file'), createSubmission);

// PUT /submissions/:id - Update submission (students only, pending status)
router.put('/:id', authorize('student'), updateSubmission);

// DELETE /submissions/:id - Delete submission
router.delete('/:id', deleteSubmission);

// GET /submissions/:id/download - Download submission file
router.get('/:id/download', downloadSubmission);

// POST /submissions/:id/review - Review submission (admin only)
router.post('/:id/review', authorize('admin'), reviewSubmission);

export default router;

