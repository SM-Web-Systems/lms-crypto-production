import { Router } from 'express';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../controllers/announcementsController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/',    getAnnouncements);
router.post('/',   requirePermission('announcement.create'), createAnnouncement);
router.patch('/:id',  requirePermission('announcement.manage'), updateAnnouncement);
router.delete('/:id', requirePermission('announcement.manage'), deleteAnnouncement);

export default router;
