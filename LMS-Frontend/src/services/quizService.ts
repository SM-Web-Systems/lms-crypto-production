import api from './api';
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

  /** `create` must be used for new quizzes: they still carry a client `id` for questions, but must POST not PUT. */
  async save(quiz: Quiz, mode: 'create' | 'update'): Promise<Quiz> {
    const id = quiz.id != null ? String(quiz.id).trim() : '';
    const payload = {
      id: id || undefined,
      title: quiz.title,
      description: quiz.description,
      information: quiz.information,
      courseId: quiz.courseId,
      passingScore: quiz.passingScore,
      questions: quiz.questions,
    };

    if (mode === 'update') {
      if (!id) {
        throw new Error('Quiz id is required to update a quiz');
      }
      const res = await api.put<{ success: boolean; data: Quiz }>(
        `/quizzes/${encodeURIComponent(id)}`,
        payload
      );
      return res.data.data;
    }

    const res = await api.post<{ success: boolean; data: Quiz }>('/quizzes', payload);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    const qid = String(id).trim();
    if (!qid) throw new Error('Quiz id is required');
    await api.delete(`/quizzes/${encodeURIComponent(qid)}`);
  },

  async getCompletionsForUser(userId: string): Promise<QuizCompletion[]> {
    const res = await api.get<{ success: boolean; data: { completions: QuizCompletion[] } }>('/quizzes/completions', { params: { userId } });
    return res.data?.data?.completions ?? [];
  },

  async getCompletion(quizId: string, userId: string): Promise<QuizCompletion | null> {
    const qid = String(quizId).trim();
    const res = await api.get<{ success: boolean; data: QuizCompletion | null }>(
      `/quizzes/${encodeURIComponent(qid)}/completion`,
      { params: { userId } }
    );
    return res.data?.data ?? null;
  },

  async submitQuiz(quizId: string, _userId: string, answers: Record<string, string>): Promise<QuizCompletion> {
    const qid = String(quizId).trim();
    const res = await api.post<{ success: boolean; data: QuizCompletion }>(
      `/quizzes/${encodeURIComponent(qid)}/submit`,
      { answers }
    );
    return res.data.data;
  },

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  },
};
