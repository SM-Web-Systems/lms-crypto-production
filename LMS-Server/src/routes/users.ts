import { Router } from 'express';
import { getMyCourses, getUser, getUsers, patchUser } from '../controllers/usersController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/me/courses', getMyCourses);
router.get('/', authorize('admin'), getUsers);
router.get('/:id', getUser);
router.patch('/:id', authorize('admin'), patchUser);

export default router;
