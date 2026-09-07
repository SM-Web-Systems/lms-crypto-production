import api from './api';
import type { ApiResponse, User } from '../types/api';
import { assertApiOk, assertApiSuccess } from '../utils/apiError';
import type { ForumTopic, ForumPost, CreateTopicData, CreatePostData } from '../types/forum';

export const forumService = {
  /** Pass courseId=null/'general' for the General channel, or a course ID for a course channel. */
  async getTopics(courseId?: string | null): Promise<ForumTopic[]> {
    const param =
      courseId && courseId !== 'general'
        ? `?courseId=${encodeURIComponent(courseId)}`
        : '?courseId=general';
    const res = await api.get<ApiResponse<{ topics: ForumTopic[] }>>(`/forum/topics${param}`);
    const data = assertApiSuccess(res, 'Could not load forum topics.');
    return data.topics ?? [];
  },

  async getTopic(id: string): Promise<ForumTopic | null> {
    try {
      const res = await api.get<ApiResponse<ForumTopic>>(`/forum/topics/${id}`);
      return assertApiSuccess(res, 'Could not load that topic.');
    } catch {
      return null;
    }
  },

  async getPosts(topicId: string): Promise<ForumPost[]> {
    const res = await api.get<ApiResponse<{ posts: ForumPost[] }>>(`/forum/topics/${topicId}/posts`);
    const data = assertApiSuccess(res, 'Could not load replies.');
    return data.posts ?? [];
  },

  async createTopic(_user: User, data: CreateTopicData): Promise<ForumTopic> {
    const res = await api.post<ApiResponse<ForumTopic>>('/forum/topics', data);
    return assertApiSuccess(res, 'Could not create the topic. Check title and body, then try again.');
  },

  async createPost(_user: User, topicId: string, data: CreatePostData): Promise<ForumPost> {
    const res = await api.post<ApiResponse<ForumPost>>(`/forum/topics/${topicId}/posts`, data);
    return assertApiSuccess(res, 'Could not post your reply.');
  },

  async deleteTopic(id: string): Promise<void> {
    const res = await api.delete<ApiResponse<unknown>>(`/forum/topics/${id}`);
    assertApiOk(res, 'Could not delete the topic.');
  },

  async deletePost(id: string): Promise<void> {
    const res = await api.delete<ApiResponse<unknown>>(`/forum/posts/${id}`);
    assertApiOk(res, 'Could not delete the reply.');
  },
};
