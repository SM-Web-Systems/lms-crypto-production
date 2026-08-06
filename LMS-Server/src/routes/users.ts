import { Router } from 'express';
import { getMyCourses, getUser, getUsers, patchUser, patchUserRole } from '../controllers/usersController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /users/me/courses:
 *   get:
 *     tags: [Users]
 *     summary: Get own enrolled courses
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of enrolled courses }
 */
router.get('/me/courses', getMyCourses);
/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List all users (admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of users }
 *       403: { description: Requires user.view_all permission }
 */
router.get('/', requirePermission('user.view_all'), getUsers);
/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get single user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User data }
 *       404: { description: User not found }
 */
router.get('/:id', getUser);
// Role management — Phase C (must be before /:id to avoid param swallowing)
/**
 * @openapi
 * /users/{id}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Update user role
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
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [student, lecturer, admin] }
 *     responses:
 *       200: { description: Role updated }
 *       403: { description: Requires user.manage permission }
 */
router.patch('/:id/role', requirePermission('user.manage'), patchUserRole);
/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update user fields
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *     responses:
 *       200: { description: User updated }
 *       403: { description: Requires user.manage permission }
 */
router.patch('/:id', requirePermission('user.manage'), patchUser);

export default router;
