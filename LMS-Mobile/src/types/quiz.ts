export type QuestionType = 'multiple_choice' | 'short_answer' | 'flashcard';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  information?: string;
  options?: string[];
  correctIndex?: number;
  correctAnswer?: string;
  order: number;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  information?: string;
  courseId?: string;
  questions: QuizQuestion[];
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
  answers: Record<string, string>;
  completedAt: string;
  paymentStatus?: 'pending' | 'paid' | 'none';
}
