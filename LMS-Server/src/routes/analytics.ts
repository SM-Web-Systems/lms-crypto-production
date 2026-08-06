import { Router } from 'express';
import { getDashboard, getCourseAnalytics, getQuizAnalytics, getSponsorStudents, exportCoursesCsv, getPaymentAnalytics } from '../controllers/analyticsController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

// All analytics routes require admin authentication
router.use(authenticate);
router.use(requirePermission('system.view_audit_log'));

// GET /analytics/dashboard - Get dashboard statistics
/**
 * @openapi
 * /analytics/dashboard:
 *   get:
 *     tags: [Analytics]
 *     summary: Get dashboard statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Aggregate platform statistics (users, courses, enrollments, NFTs)
 */
router.get('/dashboard', getDashboard);

// GET /analytics/courses - Per-course enrollment/NFT analytics
/**
 * @openapi
 * /analytics/courses:
 *   get:
 *     tags: [Analytics]
 *     summary: Get per-course analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Per-course enrollment counts, NFT applications, and completion rates
 */
router.get('/courses', getCourseAnalytics);

// GET /analytics/quizzes - Per-quiz completion analytics
/**
 * @openapi
 * /analytics/quizzes:
 *   get:
 *     tags: [Analytics]
 *     summary: Get quiz completion analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Per-quiz attempt counts, pass rates, and average scores
 */
router.get('/quizzes', getQuizAnalytics);

// GET /analytics/courses/export - CSV export (MUST be before :courseId)
/**
 * @openapi
 * /analytics/courses/export:
 *   get:
 *     tags: [Analytics]
 *     summary: Export courses as CSV
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: CSV file download of course analytics data
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/courses/export', exportCoursesCsv);

// GET /analytics/courses/:courseId/students - Per-student drill-down
/**
 * @openapi
 * /analytics/courses/{courseId}/students:
 *   get:
 *     tags: [Analytics]
 *     summary: Per-student drill-down
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 *     responses:
 *       '200':
 *         description: Per-student progress, quiz scores, and certificate status for the course
 *       '404':
 *         description: Course not found
 */
router.get('/courses/:courseId/students', getSponsorStudents);

// GET /analytics/payments - Payment revenue analytics
/**
 * @openapi
 * /analytics/payments:
 *   get:
 *     tags: [Analytics]
 *     summary: Payment revenue analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Payment revenue summary and breakdowns by course, method, and month
 */
router.get('/payments', getPaymentAnalytics);

export default router;
