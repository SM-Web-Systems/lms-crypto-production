import { Router } from 'express';
import {
  getProfile,
  getProfileById,
  patchProfile,
  uploadAvatar,
  avatarUploadMiddleware,
} from '../controllers/profileController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /profile:
 *   get:
 *     tags: [Profile]
 *     summary: Get own profile
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile data }
 */
router.get('/', getProfile);
/**
 * @openapi
 * /profile:
 *   patch:
 *     tags: [Profile]
 *     summary: Update own profile
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               bio: { type: string }
 *     responses:
 *       200: { description: Profile updated }
 */
router.patch('/', patchProfile);
/**
 * @openapi
 * /profile/avatar:
 *   post:
 *     tags: [Profile]
 *     summary: Upload profile avatar
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200: { description: Avatar uploaded }
 */
router.post('/avatar', avatarUploadMiddleware, uploadAvatar);
/**
 * @openapi
 * /profile/{userId}:
 *   get:
 *     tags: [Profile]
 *     summary: View another user's profile
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User profile }
 *       404: { description: User not found }
 */
router.get('/:userId', getProfileById);

export default router;
