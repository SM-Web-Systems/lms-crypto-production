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
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', getCourses);
router.get('/:id/members', getCourseMembers);
router.post('/:id/members', authorize('admin'), addCourseMember);
router.delete('/:id/members/:userId', authorize('admin'), removeCourseMember);
// Phase 1 Course-Centric IA: submissions scoped to a course
router.get('/:courseId/submissions', getCourseSubmissions);
// Lecturer assignment — Phase C (registered before /:id to avoid param collision)
router.get('/:id/lecturers', authorize('admin'), getLecturers);
router.post('/:id/lecturers', authorize('admin'), addLecturer);
router.delete('/:id/lecturers/:lecturerUserId', authorize('admin'), removeLecturer);
router.get('/:id', getCourse);
router.post('/', authorize('admin'), createCourse);
router.put('/:id', authorize('admin'), updateCourse);
router.delete('/:id', authorize('admin'), deleteCourse);

export default router;
