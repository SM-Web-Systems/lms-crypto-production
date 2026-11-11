import type { RolePresentation } from '../utils/rolePresentation';

export interface ForumAuthor extends RolePresentation {
  id: string;
  name: string;
  email: string | null;
  isDeleted?: boolean;
}

export interface ForumTopic {
  id: string;
  title: string;
  body: string;
  /** null / undefined = General channel */
  courseId?: string | null;
  author: ForumAuthor;
  createdAt: string; // ISO
  updatedAt?: string;
  postCount: number; // denormalized for list view
  lastPostAt?: string; // ISO, for sorting
  isDeleted?: boolean;
}

export interface ForumPost {
  id: string;
  topicId: string;
  body: string;
  author: ForumAuthor;
  createdAt: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

export interface CreateTopicData {
  title: string;
  body: string;
  /** null / 'general' = General channel */
  courseId?: string | null;
}

export interface CreatePostData {
  body: string;
}
