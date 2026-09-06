import { Router } from 'express';
import { getTopics, getTopic, getPosts, createTopic, createPost, deleteTopic, deletePost } from '../controllers/forumController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /forum/topics:
 *   get:
 *     tags: [Forum]
 *     summary: List forum topics
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of topics }
 */
router.get('/topics', getTopics);
/**
 * @openapi
 * /forum/topics/{id}:
 *   get:
 *     tags: [Forum]
 *     summary: Get single topic
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Topic data }
 *       404: { description: Not found }
 */
router.get('/topics/:id', getTopic);
/**
 * @openapi
 * /forum/topics/{topicId}/posts:
 *   get:
 *     tags: [Forum]
 *     summary: List posts in topic
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of posts }
 */
router.get('/topics/:topicId/posts', getPosts);
/**
 * @openapi
 * /forum/topics:
 *   post:
 *     tags: [Forum]
 *     summary: Create forum topic
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body]
 *             properties:
 *               title: { type: string }
 *               body: { type: string }
 *     responses:
 *       201: { description: Topic created }
 */
router.post('/topics', createTopic);
/**
 * @openapi
 * /forum/topics/{topicId}/posts:
 *   post:
 *     tags: [Forum]
 *     summary: Create post in topic
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: topicId
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
 *       201: { description: Post created }
 */
router.post('/topics/:topicId/posts', createPost);
/**
 * @openapi
 * /forum/topics/{id}:
 *   delete:
 *     tags: [Forum]
 *     summary: Delete own topic (soft-delete with cascade)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Topic deleted }
 *       403: { description: Not authorized }
 *       404: { description: Not found }
 *       409: { description: Already deleted }
 */
router.delete('/topics/:id', deleteTopic);
/**
 * @openapi
 * /forum/posts/{id}:
 *   delete:
 *     tags: [Forum]
 *     summary: Delete own post (soft-delete)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Post deleted }
 *       403: { description: Not authorized }
 *       404: { description: Not found }
 *       409: { description: Already deleted }
 */
router.delete('/posts/:id', deletePost);

export default router;
