import { Router } from 'express';
import { getMyCourses, getUser, getUsers, patchUser, patchUserRole } from '../controllers/usersController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/me/courses', getMyCourses);
router.get('/', authorize('admin'), getUsers);
router.get('/:id', getUser);
// Role management — Phase C (must be before /:id to avoid param swallowing)
router.patch('/:id/role', authorize('admin'), patchUserRole);
router.patch('/:id', authorize('admin'), patchUser);

export default router;
