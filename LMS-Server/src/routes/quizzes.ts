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

router.get('/completions', getCompletionsForUser);
router.get('/answer-keys', requirePermission('quiz.view_analytics'), getAnswerKeys);
router.get('/:id/completion', getCompletion);
router.post('/:id/submit', submitQuiz);

router.get('/', listQuizzes);
router.post('/', requirePermission('quiz.manage'), createQuiz);
router.get('/:id', getQuiz);
router.put('/:id', requirePermission('quiz.manage'), updateQuiz);
router.delete('/:id', requirePermission('quiz.manage'), deleteQuiz);

export default router;
