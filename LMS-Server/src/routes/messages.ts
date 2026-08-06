import { Router } from 'express';
import {
  getConversations,
  postConversations,
  getConversation,
  getMessages,
  postMessage,
  getUnreadCount,
  markConversationRead,
} from '../controllers/messagesController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /messages/unread-count:
 *   get:
 *     tags: [Messages]
 *     summary: Get unread message count
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Unread message count }
 */
router.get('/unread-count', getUnreadCount);

/**
 * @openapi
 * /messages/conversations:
 *   get:
 *     tags: [Messages]
 *     summary: List conversations
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of conversations }
 */
router.get('/conversations', getConversations);

/**
 * @openapi
 * /messages/conversations:
 *   post:
 *     tags: [Messages]
 *     summary: Start conversation
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientId, body]
 *             properties:
 *               recipientId: { type: string }
 *               body: { type: string }
 *     responses:
 *       201: { description: Conversation started }
 */
router.post('/conversations', postConversations);

/**
 * @openapi
 * /messages/conversations/{id}:
 *   get:
 *     tags: [Messages]
 *     summary: Get conversation
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Conversation data }
 *       404: { description: Not found }
 */
router.get('/conversations/:id', getConversation);

/**
 * @openapi
 * /messages/conversations/{id}/messages:
 *   get:
 *     tags: [Messages]
 *     summary: List messages in conversation
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of messages }
 */
router.get('/conversations/:id/messages', getMessages);

/**
 * @openapi
 * /messages/conversations/{id}/messages:
 *   post:
 *     tags: [Messages]
 *     summary: Send message
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
 *             required: [body]
 *             properties:
 *               body: { type: string }
 *     responses:
 *       201: { description: Message sent }
 */
router.post('/conversations/:id/messages', postMessage);

/**
 * @openapi
 * /messages/conversations/{id}/read:
 *   post:
 *     tags: [Messages]
 *     summary: Mark conversation as read
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Conversation marked as read }
 */
router.post('/conversations/:id/read', markConversationRead);

export default router;
