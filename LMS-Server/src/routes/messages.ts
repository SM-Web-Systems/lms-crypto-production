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

router.get('/unread-count', getUnreadCount);
router.get('/conversations', getConversations);
router.post('/conversations', postConversations);
router.get('/conversations/:id', getConversation);
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', postMessage);
router.post('/conversations/:id/read', markConversationRead);

export default router;
