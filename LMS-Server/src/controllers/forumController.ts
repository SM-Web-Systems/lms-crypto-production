import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute, db } from '../config/database.js';
import {
  AuthRequest,
  ForumTopicResponse,
  ForumPostResponse,
  ForumAuthor,
  User,
  ErrorCodes,
} from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditLog } from '../services/auditService.js';

/** Escape HTML special characters to prevent stored XSS. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toISO(ts: string | null | undefined): string | null | undefined {
  if (ts == null) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toISOString();
}

function toAuthor(u: User): ForumAuthor {
  return {
    id: u.id,
    name: u.name,
    email: u.email ?? null,
    role: u.role,
  };
}

function rowToTopic(row: {
  id: string;
  title: string;
  body: string;
  course_id?: string | null;
  author_id: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_email: string | null;
  author_role: string | null;
  author_deletion_status: string | null;
  post_count: number;
  last_post_at: string | null;
}): ForumTopicResponse {
  const isDeleted = row.author_deletion_status === 'finalized';
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    courseId: row.course_id ?? null,
    author: {
      id: row.author_id,
      name: isDeleted ? 'Deleted User' : (row.author_name ?? 'Unknown'),
      email: isDeleted ? null : (row.author_email ?? null),
      role: (row.author_role ?? 'student') as ForumAuthor['role'],
      ...(isDeleted ? { isDeleted: true } : {}),
    },
    createdAt: toISO(row.created_at)!,
    updatedAt: toISO(row.updated_at) ?? undefined,
    postCount: row.post_count,
    lastPostAt: row.last_post_at ? toISO(row.last_post_at)! : null,
  };
}

function rowToPost(row: {
  id: string;
  topic_id: string;
  body: string;
  author_id: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_email: string | null;
  author_role: string | null;
  author_deletion_status: string | null;
}): ForumPostResponse {
  const isDeleted = row.author_deletion_status === 'finalized';
  return {
    id: row.id,
    topicId: row.topic_id,
    body: row.body,
    author: {
      id: row.author_id,
      name: isDeleted ? 'Deleted User' : (row.author_name ?? 'Unknown'),
      email: isDeleted ? null : (row.author_email ?? null),
      role: (row.author_role ?? 'student') as ForumAuthor['role'],
      ...(isDeleted ? { isDeleted: true } : {}),
    },
    createdAt: toISO(row.created_at)!,
    updatedAt: toISO(row.updated_at) ?? undefined,
  };
}

export async function getTopics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // ?courseId=<id> for a specific course channel; ?courseId=general (or omitted) for the general channel
    const rawCourseId = req.query.courseId as string | undefined;
    const filterGeneral = !rawCourseId || rawCourseId === 'general';

    // LMS-PAGINATION-001: paginate topics
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = query<{
      id: string;
      title: string;
      body: string;
      course_id: string | null;
      author_id: string;
      created_at: string;
      updated_at: string;
      author_name: string | null;
      author_email: string | null;
      author_role: string | null;
      author_deletion_status: string | null;
      post_count: number;
      last_post_at: string | null;
    }>(
      `SELECT t.id, t.title, t.body, t.course_id, t.author_id, t.created_at, t.updated_at,
              u.name AS author_name, u.email AS author_email, u.role AS author_role,
              u.deletion_status AS author_deletion_status,
              (SELECT COUNT(*) FROM forum_posts WHERE topic_id = t.id) AS post_count,
              (SELECT MAX(created_at) FROM forum_posts WHERE topic_id = t.id) AS last_post_at
       FROM forum_topics t
       LEFT JOIN users u ON t.author_id = u.id
       WHERE ${filterGeneral ? 't.course_id IS NULL' : 't.course_id = ?'}
       ORDER BY COALESCE((SELECT MAX(created_at) FROM forum_posts WHERE topic_id = t.id), t.updated_at) DESC
       LIMIT ? OFFSET ?`,
      filterGeneral ? [limit, offset] : [rawCourseId, limit, offset]
    );

    const topics = rows.map(rowToTopic);
    res.json({
      success: true,
      data: { topics },
    });
  } catch (error) {
    next(error);
  }
}

export async function getTopic(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const row = queryOne<{
      id: string;
      title: string;
      body: string;
      course_id: string | null;
      author_id: string;
      created_at: string;
      updated_at: string;
      author_name: string | null;
      author_email: string | null;
      author_role: string | null;
      author_deletion_status: string | null;
      post_count: number;
      last_post_at: string | null;
    }>(
      `SELECT t.id, t.title, t.body, t.course_id, t.author_id, t.created_at, t.updated_at,
              u.name AS author_name, u.email AS author_email, u.role AS author_role,
              u.deletion_status AS author_deletion_status,
              (SELECT COUNT(*) FROM forum_posts WHERE topic_id = t.id) AS post_count,
              (SELECT MAX(created_at) FROM forum_posts WHERE topic_id = t.id) AS last_post_at
       FROM forum_topics t
       LEFT JOIN users u ON t.author_id = u.id
       WHERE t.id = ?`,
      [id]
    );

    if (!row) {
      throw new AppError('Topic not found', 404, ErrorCodes.NOT_FOUND);
    }

    res.json({
      success: true,
      data: rowToTopic(row),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPosts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { topicId } = req.params;

    const topicExists = queryOne<{ id: string }>('SELECT id FROM forum_topics WHERE id = ?', [topicId]);
    if (!topicExists) {
      throw new AppError('Topic not found', 404, ErrorCodes.NOT_FOUND);
    }

    // LMS-PAGINATION-001: paginate posts
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = query<{
      id: string;
      topic_id: string;
      body: string;
      author_id: string;
      created_at: string;
      updated_at: string;
      author_name: string | null;
      author_email: string | null;
      author_role: string | null;
      author_deletion_status: string | null;
    }>(
      `SELECT p.id, p.topic_id, p.body, p.author_id, p.created_at, p.updated_at,
              u.name AS author_name, u.email AS author_email, u.role AS author_role,
              u.deletion_status AS author_deletion_status
       FROM forum_posts p
       LEFT JOIN users u ON p.author_id = u.id
       WHERE p.topic_id = ?
       ORDER BY p.created_at ASC
       LIMIT ? OFFSET ?`,
      [topicId, limit, offset]
    );

    res.json({
      success: true,
      data: { posts: rows.map(rowToPost) },
    });
  } catch (error) {
    next(error);
  }
}

export async function createTopic(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { title, body, courseId } = req.body;
    const errors: Array<{ field: string; message: string }> = [];

    if (title === undefined || title === null || String(title).trim() === '') {
      errors.push({ field: 'title', message: 'Title is required' });
    }
    if (body === undefined || body === null || String(body).trim() === '') {
      errors.push({ field: 'body', message: 'Body is required' });
    }
    if (String(title).trim().length > 200) {
      throw new AppError('Title must be 200 characters or fewer', 400, ErrorCodes.VALIDATION_ERROR);
    }
    if (String(body).trim().length > 10000) {
      throw new AppError('Body must be 10,000 characters or fewer', 400, ErrorCodes.VALIDATION_ERROR);
    }

    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    // Validate courseId if provided (must be an existing course)
    const resolvedCourseId: string | null =
      courseId && String(courseId).trim() !== '' && courseId !== 'general'
        ? String(courseId).trim()
        : null;

    if (resolvedCourseId) {
      const courseExists = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [resolvedCourseId]);
      if (!courseExists) {
        throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
      }
    }

    const author = queryOne<User>('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    if (!author) {
      throw new AppError('User not found', 401, ErrorCodes.UNAUTHORIZED);
    }

    const id = uuidv4();
    const safeTitle = escapeHtml(String(title).trim());
    const safeBody = escapeHtml(String(body).trim());
    execute(
      `INSERT INTO forum_topics (id, title, body, author_id, course_id) VALUES (?, ?, ?, ?, ?)`,
      [id, safeTitle, safeBody, userId, resolvedCourseId]
    );

    const row = queryOne<{
      id: string;
      title: string;
      body: string;
      course_id: string | null;
      author_id: string;
      created_at: string;
      updated_at: string;
    }>('SELECT id, title, body, course_id, author_id, created_at, updated_at FROM forum_topics WHERE id = ?', [id]);
    if (!row) {
      throw new AppError('Failed to create topic', 500, ErrorCodes.INTERNAL_ERROR);
    }

    const topic: ForumTopicResponse = {
      id: row.id,
      title: row.title,
      body: row.body,
      courseId: row.course_id ?? null,
      author: toAuthor(author),
      createdAt: toISO(row.created_at)!,
      updatedAt: toISO(row.updated_at) ?? undefined,
      postCount: 0,
      lastPostAt: null,
    };

    res.status(201).json({
      success: true,
      data: topic,
    });
  } catch (error) {
    next(error);
  }
}

export async function createPost(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { topicId } = req.params;
    const { body } = req.body;

    const topicExists = queryOne<{ id: string }>('SELECT id FROM forum_topics WHERE id = ?', [topicId]);
    if (!topicExists) {
      throw new AppError('Topic not found', 404, ErrorCodes.NOT_FOUND);
    }

    const errors: Array<{ field: string; message: string }> = [];
    if (body === undefined || body === null || String(body).trim() === '') {
      errors.push({ field: 'body', message: 'Body is required' });
    }
    if (String(body).trim().length > 10000) {
      throw new AppError('Body must be 10,000 characters or fewer', 400, ErrorCodes.VALIDATION_ERROR);
    }
    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    const author = queryOne<User>('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    if (!author) {
      throw new AppError('User not found', 401, ErrorCodes.UNAUTHORIZED);
    }

    const id = uuidv4();
    const safeBody = escapeHtml(String(body).trim());
    execute(
      `INSERT INTO forum_posts (id, topic_id, body, author_id) VALUES (?, ?, ?, ?)`,
      [id, topicId, safeBody, userId]
    );

    const row = queryOne<{
      id: string;
      topic_id: string;
      body: string;
      author_id: string;
      created_at: string;
      updated_at: string;
    }>('SELECT id, topic_id, body, author_id, created_at, updated_at FROM forum_posts WHERE id = ?', [id]);
    if (!row) {
      throw new AppError('Failed to create post', 500, ErrorCodes.INTERNAL_ERROR);
    }

    const post: ForumPostResponse = {
      id: row.id,
      topicId: row.topic_id,
      body: row.body,
      author: toAuthor(author),
      createdAt: toISO(row.created_at)!,
      updatedAt: toISO(row.updated_at) ?? undefined,
    };

    res.status(201).json({
      success: true,
      data: post,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteTopic(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { id } = req.params;

    const topic = queryOne<{ id: string; author_id: string; is_deleted: number; title: string; body: string; course_id: string | null }>(
      'SELECT id, author_id, is_deleted, title, body, course_id FROM forum_topics WHERE id = ?',
      [id]
    );

    if (!topic) {
      throw new AppError('Topic not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (topic.is_deleted === 1) {
      throw new AppError('Topic already deleted', 409, ErrorCodes.ALREADY_DELETED);
    }

    if (topic.author_id !== userId) {
      throw new AppError('Not authorized to delete this topic', 403, ErrorCodes.FORBIDDEN);
    }

    const now = new Date().toISOString();

    // Transactional: soft-delete topic + cascade posts
    const txn = db.transaction(() => {
      execute(
        `UPDATE forum_topics
         SET is_deleted = 1, deleted_at = ?, deleted_by = ?, deletion_type = 'self_delete'
         WHERE id = ? AND is_deleted = 0`,
        [now, userId, id]
      );

      const result = db.prepare(
        `UPDATE forum_posts
         SET is_deleted = 1, deleted_at = ?, deleted_by = ?, deletion_type = 'topic_cascade'
         WHERE topic_id = ? AND is_deleted = 0`
      ).run(now, userId, id);

      return result.changes;
    });

    const cascadedPosts = txn();

    auditLog({
      action: 'forum_topic.deleted',
      actorId: userId,
      targetId: id,
      details: JSON.stringify({
        deletion_type: 'self_delete',
        course_id: topic.course_id,
        author_id: topic.author_id,
        title_length: topic.title.length,
        body_length: topic.body.length,
        cascaded_posts: cascadedPosts,
      }),
    });

    res.json({ success: true, data: { deleted: true, cascadedPosts } });
  } catch (error) {
    next(error);
  }
}

export async function deletePost(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { id } = req.params;

    const post = queryOne<{ id: string; author_id: string; is_deleted: number; body: string; topic_id: string }>(
      'SELECT id, author_id, is_deleted, body, topic_id FROM forum_posts WHERE id = ?',
      [id]
    );

    if (!post) {
      throw new AppError('Post not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (post.is_deleted === 1) {
      throw new AppError('Post already deleted', 409, ErrorCodes.ALREADY_DELETED);
    }

    if (post.author_id !== userId) {
      throw new AppError('Not authorized to delete this post', 403, ErrorCodes.FORBIDDEN);
    }

    execute(
      `UPDATE forum_posts
       SET is_deleted = 1, deleted_at = datetime('now'), deleted_by = ?, deletion_type = 'self_delete'
       WHERE id = ? AND is_deleted = 0`,
      [userId, id]
    );

    auditLog({
      action: 'forum_post.deleted',
      actorId: userId,
      targetId: id,
      details: JSON.stringify({
        deletion_type: 'self_delete',
        topic_id: post.topic_id,
        author_id: post.author_id,
        body_length: post.body.length,
      }),
    });

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function adminDeleteTopic(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const actorId = req.user?.userId;
    if (!actorId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { id } = req.params;

    const topic = queryOne<{ id: string; author_id: string; is_deleted: number; title: string; body: string; course_id: string | null }>(
      'SELECT id, author_id, is_deleted, title, body, course_id FROM forum_topics WHERE id = ?',
      [id]
    );

    if (!topic) {
      throw new AppError('Topic not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (topic.is_deleted === 1) {
      throw new AppError('Topic already deleted', 409, ErrorCodes.ALREADY_DELETED);
    }

    const now = new Date().toISOString();

    const txn = db.transaction(() => {
      execute(
        `UPDATE forum_topics
         SET is_deleted = 1, deleted_at = ?, deleted_by = ?, deletion_type = 'moderator_delete'
         WHERE id = ? AND is_deleted = 0`,
        [now, actorId, id]
      );

      const result = db.prepare(
        `UPDATE forum_posts
         SET is_deleted = 1, deleted_at = ?, deleted_by = ?, deletion_type = 'topic_cascade'
         WHERE topic_id = ? AND is_deleted = 0`
      ).run(now, actorId, id);

      return result.changes;
    });

    const cascadedPosts = txn();

    auditLog({
      action: 'forum_topic.moderated',
      actorId,
      targetId: id,
      details: JSON.stringify({
        deletion_type: 'moderator_delete',
        course_id: topic.course_id,
        author_id: topic.author_id,
        title_length: topic.title.length,
        body_length: topic.body.length,
        cascaded_posts: cascadedPosts,
      }),
    });

    res.json({ success: true, data: { deleted: true, cascadedPosts } });
  } catch (error) {
    next(error);
  }
}

export async function adminDeletePost(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const actorId = req.user?.userId;
    if (!actorId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { id } = req.params;

    const post = queryOne<{ id: string; author_id: string; is_deleted: number; body: string; topic_id: string }>(
      'SELECT id, author_id, is_deleted, body, topic_id FROM forum_posts WHERE id = ?',
      [id]
    );

    if (!post) {
      throw new AppError('Post not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (post.is_deleted === 1) {
      throw new AppError('Post already deleted', 409, ErrorCodes.ALREADY_DELETED);
    }

    execute(
      `UPDATE forum_posts
       SET is_deleted = 1, deleted_at = datetime('now'), deleted_by = ?, deletion_type = 'moderator_delete'
       WHERE id = ? AND is_deleted = 0`,
      [actorId, id]
    );

    auditLog({
      action: 'forum_post.moderated',
      actorId,
      targetId: id,
      details: JSON.stringify({
        deletion_type: 'moderator_delete',
        topic_id: post.topic_id,
        author_id: post.author_id,
        body_length: post.body.length,
      }),
    });

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}
