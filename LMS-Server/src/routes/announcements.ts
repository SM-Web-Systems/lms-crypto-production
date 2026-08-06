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

/**
 * @openapi
 * /announcements:
 *   get:
 *     tags: [Announcements]
 *     summary: List announcements
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of announcements }
 */
router.get('/',    getAnnouncements);
/**
 * @openapi
 * /announcements:
 *   post:
 *     tags: [Announcements]
 *     summary: Create announcement
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title: { type: string }
 *               content: { type: string }
 *     responses:
 *       201: { description: Announcement created }
 *       403: { description: Requires announcement.create }
 */
router.post('/',   requirePermission('announcement.create'), createAnnouncement);
/**
 * @openapi
 * /announcements/{id}:
 *   patch:
 *     tags: [Announcements]
 *     summary: Update announcement
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Announcement updated }
 *       403: { description: Requires announcement.manage }
 */
router.patch('/:id',  requirePermission('announcement.manage'), updateAnnouncement);
/**
 * @openapi
 * /announcements/{id}:
 *   delete:
 *     tags: [Announcements]
 *     summary: Delete announcement
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Announcement deleted }
 *       403: { description: Requires announcement.manage }
 */
router.delete('/:id', requirePermission('announcement.manage'), deleteAnnouncement);

export default router;
