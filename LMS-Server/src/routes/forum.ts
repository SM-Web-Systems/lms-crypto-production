import { Router } from 'express';
import { getTopics, getTopic, getPosts, createTopic, createPost } from '../controllers/forumController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/topics', getTopics);
router.get('/topics/:id', getTopic);
router.get('/topics/:topicId/posts', getPosts);
router.post('/topics', createTopic);
router.post('/topics/:topicId/posts', createPost);

export default router;
