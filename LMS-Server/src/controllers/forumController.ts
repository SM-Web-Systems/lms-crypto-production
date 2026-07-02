import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import {
  AuthRequest,
  ForumTopicResponse,
  ForumPostResponse,
  ForumAuthor,
  User,
  ErrorCodes,
} from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';

function toISO(ts: string | null | undefined): string | null | undefined {
  if (ts == null) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toISOString();
}

function toAuthor(u: User): ForumAuthor {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
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
  author_name: string;
  author_email: string;
  author_role: string;
  post_count: number;
  last_post_at: string | null;
}): ForumTopicResponse {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    courseId: row.course_id ?? null,
    author: {
      id: row.author_id,
      name: row.author_name,
      email: row.author_email,
      role: row.author_role as ForumAuthor['role'],
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
  author_name: string;
  author_email: string;
  author_role: string;
}): ForumPostResponse {
  return {
    id: row.id,
    topicId: row.topic_id,
    body: row.body,
    author: {
      id: row.author_id,
      name: row.author_name,
      email: row.author_email,
      role: row.author_role as ForumAuthor['role'],
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

    const rows = query<{
      id: string;
      title: string;
      body: string;
      course_id: string | null;
      author_id: string;
      created_at: string;
      updated_at: string;
      author_name: string;
      author_email: string;
      author_role: string;
      post_count: number;
      last_post_at: string | null;
    }>(
      `SELECT t.id, t.title, t.body, t.course_id, t.author_id, t.created_at, t.updated_at,
              u.name AS author_name, u.email AS author_email, u.role AS author_role,
              (SELECT COUNT(*) FROM forum_posts WHERE topic_id = t.id) AS post_count,
              (SELECT MAX(created_at) FROM forum_posts WHERE topic_id = t.id) AS last_post_at
       FROM forum_topics t
       JOIN users u ON t.author_id = u.id
       WHERE ${filterGeneral ? 't.course_id IS NULL' : 't.course_id = ?'}
       ORDER BY COALESCE((SELECT MAX(created_at) FROM forum_posts WHERE topic_id = t.id), t.updated_at) DESC`,
      filterGeneral ? [] : [rawCourseId]
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
      author_name: string;
      author_email: string;
      author_role: string;
      post_count: number;
      last_post_at: string | null;
    }>(
      `SELECT t.id, t.title, t.body, t.course_id, t.author_id, t.created_at, t.updated_at,
              u.name AS author_name, u.email AS author_email, u.role AS author_role,
              (SELECT COUNT(*) FROM forum_posts WHERE topic_id = t.id) AS post_count,
              (SELECT MAX(created_at) FROM forum_posts WHERE topic_id = t.id) AS last_post_at
       FROM forum_topics t
       JOIN users u ON t.author_id = u.id
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

    const rows = query<{
      id: string;
      topic_id: string;
      body: string;
      author_id: string;
      created_at: string;
      updated_at: string;
      author_name: string;
      author_email: string;
      author_role: string;
    }>(
      `SELECT p.id, p.topic_id, p.body, p.author_id, p.created_at, p.updated_at,
              u.name AS author_name, u.email AS author_email, u.role AS author_role
       FROM forum_posts p
       JOIN users u ON p.author_id = u.id
       WHERE p.topic_id = ?
       ORDER BY p.created_at ASC`,
      [topicId]
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
    execute(
      `INSERT INTO forum_topics (id, title, body, author_id, course_id) VALUES (?, ?, ?, ?, ?)`,
      [id, String(title).trim(), String(body).trim(), userId, resolvedCourseId]
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
    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    const author = queryOne<User>('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    if (!author) {
      throw new AppError('User not found', 401, ErrorCodes.UNAUTHORIZED);
    }

    const id = uuidv4();
    execute(
      `INSERT INTO forum_posts (id, topic_id, body, author_id) VALUES (?, ?, ?, ?)`,
      [id, topicId, String(body).trim(), userId]
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
