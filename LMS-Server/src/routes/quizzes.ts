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
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/completions', getCompletionsForUser);
router.get('/answer-keys', authorize('admin'), getAnswerKeys);
router.get('/:id/completion', getCompletion);
router.post('/:id/submit', submitQuiz);

router.get('/', listQuizzes);
router.post('/', authorize('admin'), createQuiz);
router.get('/:id', getQuiz);
router.put('/:id', authorize('admin'), updateQuiz);
router.delete('/:id', authorize('admin'), deleteQuiz);

export default router;
