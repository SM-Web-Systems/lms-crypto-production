import { Router } from 'express';
import {
  listQuizzes,
  getQuiz,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getCompletionsForUser,
  getCompletion,
  submitQuiz,
  getAnswerKeys,
} from '../controllers/quizzesController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /quizzes/completions:
 *   get:
 *     tags: [Quizzes]
 *     summary: Get user's quiz completions
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of quiz completions for the authenticated user }
 */
router.get('/completions', getCompletionsForUser);
/**
 * @openapi
 * /quizzes/answer-keys:
 *   get:
 *     tags: [Quizzes]
 *     summary: Get answer keys (admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Answer keys for all quizzes }
 *       403: { description: Requires quiz.view_analytics }
 */
router.get('/answer-keys', requirePermission('quiz.view_analytics'), getAnswerKeys);
/**
 * @openapi
 * /quizzes/{id}/completion:
 *   get:
 *     tags: [Quizzes]
 *     summary: Get specific quiz completion
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Quiz completion record }
 *       404: { description: Completion not found }
 */
router.get('/:id/completion', getCompletion);
/**
 * @openapi
 * /quizzes/{id}/submit:
 *   post:
 *     tags: [Quizzes]
 *     summary: Submit quiz answers
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
 *             required: [answers]
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     questionId: { type: string }
 *                     answer: { type: string }
 *     responses:
 *       200: { description: Quiz submitted and scored }
 *       404: { description: Quiz not found }
 */
router.post('/:id/submit', submitQuiz);

/**
 * @openapi
 * /quizzes:
 *   get:
 *     tags: [Quizzes]
 *     summary: List quizzes
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of quizzes }
 */
router.get('/', listQuizzes);
/**
 * @openapi
 * /quizzes:
 *   post:
 *     tags: [Quizzes]
 *     summary: Create quiz
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               courseId: { type: string }
 *               questions: { type: array, items: { type: object } }
 *     responses:
 *       201: { description: Quiz created }
 *       403: { description: Requires quiz.manage }
 */
router.post('/', requirePermission('quiz.manage'), createQuiz);
/**
 * @openapi
 * /quizzes/{id}:
 *   get:
 *     tags: [Quizzes]
 *     summary: Get single quiz
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Quiz data }
 *       404: { description: Quiz not found }
 */
router.get('/:id', getQuiz);
/**
 * @openapi
 * /quizzes/{id}:
 *   put:
 *     tags: [Quizzes]
 *     summary: Update quiz
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Quiz updated }
 *       403: { description: Requires quiz.manage }
 *       404: { description: Quiz not found }
 */
router.put('/:id', requirePermission('quiz.manage'), updateQuiz);
/**
 * @openapi
 * /quizzes/{id}:
 *   delete:
 *     tags: [Quizzes]
 *     summary: Delete quiz
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Quiz deleted }
 *       403: { description: Requires quiz.manage }
 *       404: { description: Quiz not found }
 */
router.delete('/:id', requirePermission('quiz.manage'), deleteQuiz);

export default router;
