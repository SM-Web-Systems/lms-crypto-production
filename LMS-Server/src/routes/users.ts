import { Router } from 'express';
import { getMyCourses, getUser, getUsers, patchUser, patchUserRole } from '../controllers/usersController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/me/courses', getMyCourses);
router.get('/', requirePermission('user.view_all'), getUsers);
router.get('/:id', getUser);
// Role management — Phase C (must be before /:id to avoid param swallowing)
router.patch('/:id/role', requirePermission('user.manage'), patchUserRole);
router.patch('/:id', requirePermission('user.manage'), patchUser);

export default router;
