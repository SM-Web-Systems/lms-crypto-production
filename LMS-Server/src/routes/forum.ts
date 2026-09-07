import { Router } from 'express';
import { getTopics, getTopic, getPosts, createTopic, createPost, deleteTopic, deletePost, adminDeleteTopic, adminDeletePost, adminGetTopics, adminGetPosts } from '../controllers/forumController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// Admin routes (must be before parameterized user routes to prevent 'admin' being matched as a topic ID)
/**
 * @openapi
 * /forum/admin/topics/{id}:
 *   delete:
 *     tags: [Forum Admin]
 *     summary: Moderator/admin delete topic (soft-delete with cascade)
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
router.delete('/admin/topics/:id', requirePermission('forum.moderate'), adminDeleteTopic);
/**
 * @openapi
 * /forum/admin/posts/{id}:
 *   delete:
 *     tags: [Forum Admin]
 *     summary: Moderator/admin delete post (soft-delete)
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
router.delete('/admin/posts/:id', requirePermission('forum.moderate'), adminDeletePost);
/**
 * @openapi
 * /forum/admin/topics:
 *   get:
 *     tags: [Forum Admin]
 *     summary: List all topics with full content (admin audit)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All topics including deleted with full content }
 *       403: { description: Not authorized }
 */
router.get('/admin/topics', requirePermission('forum.view_deleted'), adminGetTopics);
/**
 * @openapi
 * /forum/admin/topics/{topicId}/posts:
 *   get:
 *     tags: [Forum Admin]
 *     summary: List all posts in topic with full content (admin audit)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: All posts including deleted with full content }
 *       403: { description: Not authorized }
 */
router.get('/admin/topics/:topicId/posts', requirePermission('forum.view_deleted'), adminGetPosts);

// User routes
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
