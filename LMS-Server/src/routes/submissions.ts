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
/**
 * @openapi
 * /submissions:
 *   get:
 *     tags: [Submissions]
 *     summary: Get all submissions
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of submissions (filtered by role) }
 */
router.get('/', getSubmissions);

// GET /submissions/:id - Get single submission
/**
 * @openapi
 * /submissions/{id}:
 *   get:
 *     tags: [Submissions]
 *     summary: Get single submission
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Submission data }
 *       404: { description: Submission not found }
 */
router.get('/:id', getSubmission);

// POST /submissions - Create new submission (students only)
/**
 * @openapi
 * /submissions:
 *   post:
 *     tags: [Submissions]
 *     summary: Create submission
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               courseId: { type: string }
 *               itemId: { type: string }
 *               comment: { type: string }
 *     responses:
 *       201: { description: Submission created }
 *       403: { description: Requires course.submit }
 */
router.post('/', requirePermission('course.submit'), upload.single('file'), createSubmission);

// PUT /submissions/:id - Update submission (students only, pending status)
/**
 * @openapi
 * /submissions/{id}:
 *   put:
 *     tags: [Submissions]
 *     summary: Update submission
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Submission updated }
 *       403: { description: Requires course.submit or not owner }
 *       404: { description: Submission not found }
 */
router.put('/:id', requirePermission('course.submit'), updateSubmission);

// DELETE /submissions/:id - Delete submission
/**
 * @openapi
 * /submissions/{id}:
 *   delete:
 *     tags: [Submissions]
 *     summary: Delete submission
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Submission deleted }
 *       403: { description: Not authorized to delete }
 *       404: { description: Submission not found }
 */
router.delete('/:id', deleteSubmission);

// GET /submissions/:id/download - Download submission file
/**
 * @openapi
 * /submissions/{id}/download:
 *   get:
 *     tags: [Submissions]
 *     summary: Download submission file
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: File download stream }
 *       404: { description: Submission or file not found }
 */
router.get('/:id/download', downloadSubmission);

// POST /submissions/:id/review - Review submission (admin or lecturer — scope enforced in controller)
/**
 * @openapi
 * /submissions/{id}/review:
 *   post:
 *     tags: [Submissions]
 *     summary: Review submission
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
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
 *                 enum: [approved, rejected]
 *               feedback: { type: string }
 *     responses:
 *       200: { description: Submission reviewed }
 *       403: { description: Requires course.grade }
 *       404: { description: Submission not found }
 */
router.post('/:id/review', requirePermission('course.grade'), reviewSubmission);

export default router;

