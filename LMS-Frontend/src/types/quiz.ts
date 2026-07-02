// Quiz types for admin-created quizzes and student attempts

export type QuestionType = 'multiple_choice' | 'short_answer' | 'flashcard';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  /** Optional context shown to students while answering (like course material “Information”). */
  information?: string;
  /** For multiple_choice: array of options; correct one(s) indicated by correctIndex or correctOption */
  options?: string[];
  correctIndex?: number;
  /** For short_answer: exact match or key phrases (backend may do fuzzy match) */
  correctAnswer?: string;
  order: number;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  /** Extra student-facing context on the intro screen (instructions, how to prepare). */
  information?: string;
  /** Optional link to course (e.g. course id) */
  courseId?: string;
  questions: QuizQuestion[];
  /** Minimum score (0–100) to pass; default 70 */
  passingScore?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface QuizCompletion {
  id: string;
  quizId: string;
  userId: string;
  score: number;
  total: number;
  passed: boolean;
  answers: Record<string, string>; // questionId -> submitted answer
  completedAt: string;
  /** When backend supports payment: paid vs unpaid */
  paymentStatus?: 'pending' | 'paid' | 'none';
}
