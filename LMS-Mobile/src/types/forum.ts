import type { RoleSummary } from './api';

export interface ForumAuthor {
  id: string;
  name: string;
  email: string | null;
  rbacRoles?: string[];
  roleSummaries?: RoleSummary[];
  isDeleted?: boolean;
}

export interface ForumTopic {
  id: string;
  title: string;
  body: string;
  courseId?: string | null;
  author: ForumAuthor;
  createdAt: string;
  updatedAt?: string;
  postCount: number;
  lastPostAt?: string;
}

export interface ForumPost {
  id: string;
  topicId: string;
  body: string;
  author: ForumAuthor;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateTopicData {
  title: string;
  body: string;
  courseId?: string | null;
}

export interface CreatePostData {
  body: string;
}
