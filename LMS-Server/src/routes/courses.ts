import { Router } from 'express';
import {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseMembers,
  addCourseMember,
  removeCourseMember,
  getLecturers,
  addLecturer,
  removeLecturer,
} from '../controllers/coursesController.js';
import { getCourseSubmissions } from '../controllers/submissionsController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/', getCourses);
router.get('/:id/members', getCourseMembers);
router.post('/:id/members', requirePermission('course.enroll_others'), addCourseMember);
router.delete('/:id/members/:userId', requirePermission('course.enroll_others'), removeCourseMember);
// Phase 1 Course-Centric IA: submissions scoped to a course
router.get('/:courseId/submissions', getCourseSubmissions);
// Lecturer assignment — Phase C (registered before /:id to avoid param collision)
router.get('/:id/lecturers', requirePermission('user.manage'), getLecturers);
router.post('/:id/lecturers', requirePermission('user.manage'), addLecturer);
router.delete('/:id/lecturers/:lecturerUserId', requirePermission('user.manage'), removeLecturer);
router.get('/:id', getCourse);
router.post('/', requirePermission('course.create'), createCourse);
router.put('/:id', requirePermission('course.manage'), updateCourse);
router.delete('/:id', requirePermission('course.manage'), deleteCourse);

export default router;
