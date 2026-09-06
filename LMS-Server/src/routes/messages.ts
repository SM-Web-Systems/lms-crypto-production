import { Router } from 'express';
import {
  getConversations,
  postConversations,
  getConversation,
  getMessages,
  postMessage,
  getUnreadCount,
  markConversationRead,
  deleteMessage,
  adminDeleteMessage,
  adminGetConversationMessages,
  adminGetMessage,
} from '../controllers/messagesController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

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

// ── User self-delete ────────────────────────────────────────────

/**
 * @openapi
 * /messages/messages/{messageId}:
 *   delete:
 *     tags: [Messages]
 *     summary: Delete own message (soft-delete)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Message deleted }
 *       403: { description: Not authorized }
 *       404: { description: Not found }
 *       409: { description: Already deleted }
 */
router.delete('/messages/:messageId', deleteMessage);

// ── Admin endpoints ─────────────────────────────────────────────

/**
 * @openapi
 * /messages/admin/messages/{messageId}:
 *   delete:
 *     tags: [Messages Admin]
 *     summary: Admin delete any message (soft-delete)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Message deleted }
 *       403: { description: Forbidden }
 *       409: { description: Already deleted }
 */
router.delete('/admin/messages/:messageId', requirePermission('message.delete_any'), adminDeleteMessage);

/**
 * @openapi
 * /messages/admin/conversations/{conversationId}/messages:
 *   get:
 *     tags: [Messages Admin]
 *     summary: Admin view all messages in conversation (including deleted content)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Full message list with deletion metadata }
 *       403: { description: Forbidden }
 */
router.get('/admin/conversations/:conversationId/messages', requirePermission('message.view_deleted'), adminGetConversationMessages);

/**
 * @openapi
 * /messages/admin/messages/{messageId}:
 *   get:
 *     tags: [Messages Admin]
 *     summary: Admin view single message (including deleted content)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Full message details }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 */
router.get('/admin/messages/:messageId', requirePermission('message.view_deleted'), adminGetMessage);

export default router;
