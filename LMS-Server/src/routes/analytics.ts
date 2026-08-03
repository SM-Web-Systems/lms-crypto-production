import { Router } from 'express';
import { getDashboard, getCourseAnalytics, getSponsorStudents, exportCoursesCsv } from '../controllers/analyticsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All analytics routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// GET /analytics/dashboard - Get dashboard statistics
router.get('/dashboard', getDashboard);

// GET /analytics/courses - Per-course enrollment/NFT analytics
router.get('/courses', getCourseAnalytics);

// GET /analytics/courses/export - CSV export (MUST be before :courseId)
router.get('/courses/export', exportCoursesCsv);

// GET /analytics/courses/:courseId/students - Per-student drill-down
router.get('/courses/:courseId/students', getSponsorStudents);

export default router;
