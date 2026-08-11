/**
 * searchService — API client for unified search endpoint.
 */

import api from './api';

export interface SearchResults {
  query: string;
  results: {
    courses?: Array<{ id: string; title: string; courseCode: string; description: string }>;
    users?: Array<{ id: string; name: string; email: string; role: string }>;
    credentials?: Array<{ id: string; courseTitle: string; studentName: string; issuedAt: string }>;
    quizzes?: Array<{ id: string; title: string; courseTitle: string }>;
  };
  counts: Record<string, number>;
}

export const searchService = {
  async search(q: string, types?: string, limit?: number): Promise<SearchResults> {
    const params: Record<string, string> = { q };
    if (types) params.types = types;
    if (limit) params.limit = String(limit);
    const res = await api.get<{ success: boolean; data: SearchResults }>('/search', { params });
    return res.data.data;
  },
};
