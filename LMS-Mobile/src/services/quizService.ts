import api from '../lib/api';
import type { Quiz, QuizCompletion } from '../types/quiz';

export const quizService = {
  async getAll(): Promise<Quiz[]> {
    const res = await api.get<{ success: boolean; data: { quizzes: Quiz[] } }>('/quizzes');
    return res.data?.data?.quizzes ?? [];
  },

  async getById(id: string): Promise<Quiz | null> {
    try {
      const qid = String(id).trim();
      if (!qid) return null;
      const res = await api.get<{ success: boolean; data: Quiz }>(`/quizzes/${encodeURIComponent(qid)}`);
      return res.data?.data ?? null;
    } catch {
      return null;
    }
  },

  async getCompletionsForUser(userId: string): Promise<QuizCompletion[]> {
    const res = await api.get<{ success: boolean; data: { completions: QuizCompletion[] } }>('/quizzes/completions', {
      params: { userId },
    });
    return res.data?.data?.completions ?? [];
  },

  async getCompletion(quizId: string, userId: string): Promise<QuizCompletion | null> {
    const res = await api.get<{ success: boolean; data: QuizCompletion | null }>(
      `/quizzes/${encodeURIComponent(quizId)}/completion`,
      { params: { userId } }
    );
    return res.data?.data ?? null;
  },

  async submitQuiz(quizId: string, answers: Record<string, string>): Promise<QuizCompletion> {
    const res = await api.post<{ success: boolean; data: QuizCompletion }>(
      `/quizzes/${encodeURIComponent(quizId)}/submit`,
      { answers }
    );
    return res.data.data;
  },
};
