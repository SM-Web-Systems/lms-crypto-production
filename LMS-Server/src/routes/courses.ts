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
} from '../controllers/coursesController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', getCourses);
router.get('/:id/members', getCourseMembers);
router.post('/:id/members', authorize('admin'), addCourseMember);
router.delete('/:id/members/:userId', authorize('admin'), removeCourseMember);
router.get('/:id', getCourse);
router.post('/', authorize('admin'), createCourse);
router.put('/:id', authorize('admin'), updateCourse);
router.delete('/:id', authorize('admin'), deleteCourse);

export default router;
