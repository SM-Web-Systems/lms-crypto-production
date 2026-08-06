import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { isTriggerQuiz, mintCredentialForQuiz } from '../services/mintService.js';
import { findQuizItemInCourse } from '../utils/courseHelpers.js';
import logger from '../utils/logger.js';

interface QuizQuestion {
  id: string;
  type: string;
  question: string;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  order: number;
  /** Optional context for students (shown during the quiz). */
  information?: string;
}

interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  information?: string | null;
  course_id: string | null;
  passing_score: number;
  questions: string;
  created_at: string;
  updated_at: string;
}

interface QuizCompletionRow {
  id: string;
  quiz_id: string;
  user_id: string;
  score: number;
  total: number;
  passed: number;
  answers: string;
  payment_status: string | null;
  completed_at: string;
}

function toISO(ts: string | null | undefined): string {
  if (ts == null) return new Date().toISOString();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toISOString();
}

function parseQuestions(json: string): QuizQuestion[] {
  try {
    const p = JSON.parse(json || '[]') as unknown;
    return Array.isArray(p) ? (p as QuizQuestion[]) : [];
  } catch {
    return [];
  }
}

function parseQuizIdParam(raw: string | undefined): string {
  const id = raw != null ? String(raw).trim() : '';
  if (!id) {
    throw new AppError('Quiz id is required', 400, ErrorCodes.VALIDATION_ERROR);
  }
  return id;
}

function rowToQuiz(row: QuizRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    information:
      row.information != null && String(row.information).trim() !== ''
        ? String(row.information).trim()
        : undefined,
    courseId: row.course_id ?? undefined,
    passingScore: row.passing_score,
    questions: parseQuestions(row.questions),
    createdAt: toISO(row.created_at),
    updatedAt: toISO(row.updated_at),
  };
}

/** Strip correctIndex and correctAnswer from questions for student-facing responses. */
function stripAnswerKeys(quiz: ReturnType<typeof rowToQuiz>) {
  return {
    ...quiz,
    questions: quiz.questions.map(({ correctIndex, correctAnswer, ...rest }) => rest),
  };
}

function rowToCompletion(row: QuizCompletionRow) {
  let answers: Record<string, string> = {};
  try {
    const p = JSON.parse(row.answers || '{}') as unknown;
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      answers = p as Record<string, string>;
    }
  } catch {
    answers = {};
  }
  return {
    id: row.id,
    quizId: row.quiz_id,
    userId: row.user_id,
    score: row.score,
    total: row.total,
    passed: row.passed === 1,
    answers,
    completedAt: toISO(row.completed_at),
    paymentStatus: (row.payment_status as 'pending' | 'paid' | 'none' | undefined) ?? 'none',
  };
}

function scoreSubmission(questions: QuizQuestion[], answers: Record<string, string>): { score: number; total: number } {
  const sorted = [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const n = sorted.length;
  if (n === 0) {
    return { score: 100, total: 0 };
  }
  let correct = 0;
  for (const q of sorted) {
    const submitted = answers[q.id];
    if (submitted === undefined || String(submitted).trim() === '') continue;
    const s = String(submitted).trim();
    if ((q.type === 'multiple_choice' || q.type === 'flashcard') && q.options && typeof q.correctIndex === 'number') {
      const expected = q.options[q.correctIndex];
      if (expected !== undefined && s === String(expected).trim()) correct++;
    } else if (q.type === 'short_answer' && q.correctAnswer != null && String(q.correctAnswer).trim() !== '') {
      if (s.toLowerCase() === String(q.correctAnswer).trim().toLowerCase()) correct++;
    }
  }
  const score = Math.round((correct / n) * 100);
  return { score, total: n };
}

function validateQuestions(questions: unknown): QuizQuestion[] {
  if (!Array.isArray(questions)) {
    throw new AppError('questions must be an array', 400, ErrorCodes.VALIDATION_ERROR);
  }
  const out: QuizQuestion[] = [];
  for (const q of questions) {
    if (!q || typeof q !== 'object') continue;
    const o = q as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.question !== 'string' || typeof o.order !== 'number') {
      throw new AppError('Each question needs id, question, and order', 400, ErrorCodes.VALIDATION_ERROR);
    }
    const infoRaw = o.information;
    const information =
      typeof infoRaw === 'string' && infoRaw.trim() !== '' ? infoRaw.trim() : undefined;
    out.push({
      id: o.id,
      type: typeof o.type === 'string' ? o.type : 'short_answer',
      question: o.question,
      options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : undefined,
      correctIndex: typeof o.correctIndex === 'number' ? o.correctIndex : undefined,
      correctAnswer: typeof o.correctAnswer === 'string' ? o.correctAnswer : undefined,
      order: o.order,
      ...(information ? { information } : {}),
    });
  }
  return out;
}

export async function listQuizzes(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = query<QuizRow>('SELECT * FROM quizzes ORDER BY updated_at DESC');
    const role = (_req as AuthRequest).user?.role;
    const quizzes = rows.map(rowToQuiz);
    res.json({
      success: true,
      data: { quizzes: role === 'admin' || role === 'lecturer' ? quizzes : quizzes.map(stripAnswerKeys) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getQuiz(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseQuizIdParam(req.params.id);
    const row = queryOne<QuizRow>('SELECT * FROM quizzes WHERE id = ?', [id]);
    if (!row) {
      throw new AppError('Quiz not found', 404, ErrorCodes.NOT_FOUND);
    }
    const role = req.user?.role;
    const quiz = rowToQuiz(row);
    res.json({
      success: true,
      data: role === 'admin' || role === 'lecturer' ? quiz : stripAnswerKeys(quiz),
    });
  } catch (error) {
    next(error);
  }
}

export async function createQuiz(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const title = body.title != null ? String(body.title).trim() : '';
    if (!title) {
      throw new AppError('title is required', 400, ErrorCodes.VALIDATION_ERROR);
    }
    const questions = validateQuestions(body.questions);
    const description =
      body.description !== undefined && body.description !== null ? String(body.description).trim() : null;
    const information =
      body.information !== undefined && body.information !== null && String(body.information).trim() !== ''
        ? String(body.information).trim()
        : null;
    const courseId =
      body.courseId !== undefined && body.courseId !== null && String(body.courseId).trim() !== ''
        ? String(body.courseId).trim()
        : null;
    const passingScore =
      typeof body.passingScore === 'number' && body.passingScore >= 0 && body.passingScore <= 100
        ? Math.floor(body.passingScore)
        : 70;
    const id =
      body.id !== undefined && body.id !== null && String(body.id).trim() !== ''
        ? String(body.id).trim()
        : uuidv4();

    const existing = queryOne<{ id: string }>('SELECT id FROM quizzes WHERE id = ?', [id]);
    if (existing) {
      throw new AppError('A quiz with this id already exists', 400, ErrorCodes.DUPLICATE_ENTRY);
    }

    execute(
      `INSERT INTO quizzes (id, title, description, information, course_id, passing_score, questions)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, description, information, courseId, passingScore, JSON.stringify(questions)]
    );

    const row = queryOne<QuizRow>('SELECT * FROM quizzes WHERE id = ?', [id]);
    if (!row) {
      throw new AppError('Failed to create quiz', 500, ErrorCodes.INTERNAL_ERROR);
    }

    res.status(201).json({
      success: true,
      data: rowToQuiz(row),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateQuiz(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseQuizIdParam(req.params.id);
    const existing = queryOne<QuizRow>('SELECT * FROM quizzes WHERE id = ?', [id]);
    if (!existing) {
      throw new AppError('Quiz not found', 404, ErrorCodes.NOT_FOUND);
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const updates: string[] = [];
    const params: unknown[] = [];

    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t) {
        throw new AppError('title cannot be empty', 400, ErrorCodes.VALIDATION_ERROR);
      }
      updates.push('title = ?');
      params.push(t);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      params.push(body.description != null ? String(body.description).trim() : null);
    }
    if (body.information !== undefined) {
      updates.push('information = ?');
      params.push(
        body.information != null && String(body.information).trim() !== ''
          ? String(body.information).trim()
          : null
      );
    }
    if (body.courseId !== undefined) {
      updates.push('course_id = ?');
      params.push(
        body.courseId !== null && String(body.courseId).trim() !== '' ? String(body.courseId).trim() : null
      );
    }
    if (body.passingScore !== undefined) {
      const ps = body.passingScore;
      if (typeof ps !== 'number' || ps < 0 || ps > 100) {
        throw new AppError('passingScore must be between 0 and 100', 400, ErrorCodes.VALIDATION_ERROR);
      }
      updates.push('passing_score = ?');
      params.push(Math.floor(ps));
    }
    if (body.questions !== undefined) {
      const questions = validateQuestions(body.questions);
      updates.push('questions = ?');
      params.push(JSON.stringify(questions));
    }

    if (updates.length === 0) {
      res.json({ success: true, data: rowToQuiz(existing) });
      return;
    }

    updates.push(`updated_at = datetime('now')`);
    params.push(id);
    execute(`UPDATE quizzes SET ${updates.join(', ')} WHERE id = ?`, params);

    const row = queryOne<QuizRow>('SELECT * FROM quizzes WHERE id = ?', [id]);
    res.json({
      success: true,
      data: rowToQuiz(row!),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteQuiz(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseQuizIdParam(req.params.id);
    const existing = queryOne<{ id: string }>('SELECT id FROM quizzes WHERE id = ?', [id]);
    if (!existing) {
      throw new AppError('Quiz not found', 404, ErrorCodes.NOT_FOUND);
    }
    execute('DELETE FROM quizzes WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function getCompletionsForUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.query.userId as string | undefined;
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new AppError('userId query parameter is required', 400, ErrorCodes.VALIDATION_ERROR);
    }

    // Students can only query their own completions
    const role = req.user?.role;
    if (role === 'student' && userId.trim() !== req.user?.userId) {
      throw new AppError('You can only view your own quiz completions', 403, ErrorCodes.FORBIDDEN);
    }

    const rows = query<QuizCompletionRow>(
      'SELECT * FROM quiz_completions WHERE user_id = ? ORDER BY completed_at DESC',
      [userId.trim()]
    );

    res.json({
      success: true,
      data: { completions: rows.map(rowToCompletion) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCompletion(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const quizId = parseQuizIdParam(req.params.id);
    const userId = req.query.userId as string | undefined;
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new AppError('userId query parameter is required', 400, ErrorCodes.VALIDATION_ERROR);
    }

    // Students can only query their own completions
    const role = req.user?.role;
    if (role === 'student' && userId.trim() !== req.user?.userId) {
      throw new AppError('You can only view your own quiz completions', 403, ErrorCodes.FORBIDDEN);
    }

    const row = queryOne<QuizCompletionRow>(
      'SELECT * FROM quiz_completions WHERE quiz_id = ? AND user_id = ?',
      [quizId, userId.trim()]
    );

    res.json({
      success: true,
      data: row ? rowToCompletion(row) : null,
    });
  } catch (error) {
    next(error);
  }
}

export async function submitQuiz(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const quizId = parseQuizIdParam(req.params.id);
    const answersRaw = (req.body || {}) as Record<string, unknown>;
    const answers = answersRaw.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      throw new AppError('answers object is required', 400, ErrorCodes.VALIDATION_ERROR);
    }
    const answersMap = answers as Record<string, string>;

    const quiz = queryOne<QuizRow>('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (!quiz) {
      throw new AppError('Quiz not found', 404, ErrorCodes.NOT_FOUND);
    }

    const questions = parseQuestions(quiz.questions);
    const { score, total } = scoreSubmission(questions, answersMap);
    const passed = score >= (quiz.passing_score ?? 70) ? 1 : 0;
    const completionId = uuidv4();

    execute('DELETE FROM quiz_completions WHERE quiz_id = ? AND user_id = ?', [quizId, userId]);
    execute(
      `INSERT INTO quiz_completions (id, quiz_id, user_id, score, total, passed, answers, payment_status, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'none', datetime('now'))`,
      [completionId, quizId, userId, score, total, passed, JSON.stringify(answersMap)]
    );

    const row = queryOne<QuizCompletionRow>(
      'SELECT * FROM quiz_completions WHERE id = ?',
      [completionId]
    );
    if (!row) {
      throw new AppError('Failed to save completion', 500, ErrorCodes.INTERNAL_ERROR);
    }

    // Fire-and-forget NFT credential mint for designated quizzes only (LEGACY path)
    // Disabled when NFT_AUTO_MINT_ENABLED != 'true' — new flow uses course_nft_applications
    if (passed === 1 && isTriggerQuiz(quizId) && process.env.NFT_AUTO_MINT_ENABLED === 'true') {
      const userRow = queryOne<{ walletAddress: string | null; wallet_linking_status: string | null }>(
        'SELECT walletAddress, wallet_linking_status FROM users WHERE id = ?',
        [userId]
      );
      if (userRow?.walletAddress && userRow.wallet_linking_status === 'linked') {
        mintCredentialForQuiz({ userId, quizId, walletAddress: userRow.walletAddress }).catch((err: unknown) => {
          logger.error({ module: 'mint', err }, 'Fire-and-forget mint error');
        });
      }
    }

    // Phase 4: auto-complete linked course item on quiz pass (best-effort)
    if (passed === 1 && quiz.course_id) {
      try {
        const course = queryOne<{ sections: string }>(
          'SELECT sections FROM courses WHERE id = ?',
          [quiz.course_id]
        );
        if (course?.sections) {
          const match = findQuizItemInCourse(course.sections, quizId);
          if (match) {
            execute(
              `INSERT OR IGNORE INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by)
               VALUES (?, ?, ?, ?, ?, NULL)`,
              [uuidv4(), userId, quiz.course_id, match.itemId, match.sectionId]
            );
          }
        }
      } catch (err) {
        logger.error({ module: 'quiz-auto-complete', err }, 'Auto-complete error');
      }
    }

    res.status(201).json({
      success: true,
      data: rowToCompletion(row),
    });
  } catch (error) {
    next(error);
  }
}

/** Admin-only: structured answer-key export for all quizzes. */
export async function getAnswerKeys(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = query<QuizRow>('SELECT * FROM quizzes ORDER BY title ASC');
    const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean))] as string[];
    const courseTitles: Record<string, string> = {};
    for (const cid of courseIds) {
      const c = queryOne<{ id: string; title: string }>('SELECT id, title FROM courses WHERE id = ?', [cid]);
      if (c) courseTitles[cid] = c.title;
    }

    const keys = rows.map((r) => {
      const quiz = rowToQuiz(r);
      return {
        quizId: quiz.id,
        quizTitle: quiz.title,
        courseId: quiz.courseId ?? null,
        courseTitle: quiz.courseId ? (courseTitles[quiz.courseId] ?? null) : null,
        passingScore: quiz.passingScore ?? 70,
        questions: quiz.questions.map((q) => {
          let correctAnswer: string | null = null;
          if (q.type === 'short_answer' && q.correctAnswer != null) {
            correctAnswer = String(q.correctAnswer).trim();
          } else if ((q.type === 'multiple_choice' || q.type === 'flashcard') && q.options && typeof q.correctIndex === 'number') {
            correctAnswer = q.options[q.correctIndex] ?? null;
          }
          return {
            questionId: q.id,
            order: q.order,
            type: q.type,
            question: q.question,
            options: q.options ?? null,
            correctIndex: q.correctIndex ?? null,
            correctAnswer,
          };
        }),
      };
    });

    res.json({ success: true, generatedAt: new Date().toISOString(), data: { quizzes: keys } });
  } catch (error) {
    next(error);
  }
}
