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

router.get('/', getProfile);
router.patch('/', patchProfile);
router.post('/avatar', avatarUploadMiddleware, uploadAvatar);
router.get('/:userId', getProfileById);

export default router;
