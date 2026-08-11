/**
 * searchController — unified multi-entity search with RBAC filtering.
 *
 * Searches courses, users, credentials, and quizzes using SQL LIKE.
 * Results are filtered by the caller's role.
 */

import { Response } from 'express';
import { query } from '../config/database.js';
import { hasPermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';

const VALID_TYPES = ['courses', 'users', 'credentials', 'quizzes'] as const;
type SearchType = (typeof VALID_TYPES)[number];

export function globalSearch(req: AuthRequest, res: Response): void {
  const rawQ = (req.query.q as string | undefined)?.trim();
  if (!rawQ || rawQ.length < 2) {
    res.status(400).json({
      success: false,
      error: { message: 'q query parameter is required (minimum 2 characters)' },
    });
    return;
  }

  const q = rawQ.slice(0, 100);
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 5));
  const userId = req.user!.userId;
  const isAdmin = hasPermission(userId, 'user.view_all');

  // Parse requested types (default: all accessible)
  let requestedTypes: SearchType[];
  const typesParam = req.query.types as string | undefined;
  if (typesParam) {
    requestedTypes = typesParam
      .split(',')
      .map((t) => t.trim() as SearchType)
      .filter((t) => VALID_TYPES.includes(t));
  } else {
    requestedTypes = [...VALID_TYPES];
  }

  const pattern = `%${q}%`;
  const results: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  // Courses — all authenticated users can search
  if (requestedTypes.includes('courses')) {
    const courses = query<{ id: string; title: string; course_code: string; description: string }>(
      `SELECT id, title, course_code, description FROM courses
       WHERE title LIKE ? OR course_code LIKE ? OR description LIKE ?
       ORDER BY title LIMIT ?`,
      [pattern, pattern, pattern, limit],
    );
    results.courses = courses.map((c) => ({
      id: c.id,
      title: c.title,
      courseCode: c.course_code,
      description: c.description?.slice(0, 120) ?? '',
    }));
    counts.courses = courses.length;
  }

  // Users — admin only
  if (requestedTypes.includes('users') && isAdmin) {
    const users = query<{ id: string; name: string; email: string; role: string }>(
      `SELECT id, name, email, role FROM users
       WHERE name LIKE ? OR email LIKE ?
       ORDER BY name LIMIT ?`,
      [pattern, pattern, limit],
    );
    results.users = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    }));
    counts.users = users.length;
  }

  // Credentials — students see own only, admins see all
  if (requestedTypes.includes('credentials')) {
    const credParams: unknown[] = [pattern, pattern];
    let credWhere = `(c.title LIKE ? OR u.name LIKE ?) AND nc.mint_status = 'minted' AND nc.is_superseded = 0`;
    if (!isAdmin) {
      credWhere += ' AND nc.user_id = ?';
      credParams.push(userId);
    }
    credParams.push(limit);

    const creds = query<{
      id: string; course_title: string | null; student_name: string | null; created_at: string;
    }>(
      `SELECT nc.id, c.title AS course_title, u.name AS student_name, nc.created_at
       FROM nft_credentials nc
       LEFT JOIN courses c ON c.id = nc.course_id
       LEFT JOIN users u ON u.id = nc.user_id
       WHERE ${credWhere}
       ORDER BY nc.created_at DESC LIMIT ?`,
      credParams,
    );
    results.credentials = creds.map((cr) => ({
      id: cr.id,
      courseTitle: cr.course_title ?? 'Certificate',
      studentName: cr.student_name ?? 'Student',
      issuedAt: cr.created_at,
    }));
    counts.credentials = creds.length;
  }

  // Quizzes — admin sees all, students excluded for now (low value, can add later)
  if (requestedTypes.includes('quizzes') && isAdmin) {
    const quizzes = query<{ id: string; title: string; description: string | null; course_title: string | null }>(
      `SELECT q.id, q.title, q.description, c.title AS course_title
       FROM quizzes q
       LEFT JOIN courses c ON c.id = q.course_id
       WHERE q.title LIKE ? OR q.description LIKE ?
       ORDER BY q.title LIMIT ?`,
      [pattern, pattern, limit],
    );
    results.quizzes = quizzes.map((qz) => ({
      id: qz.id,
      title: qz.title,
      courseTitle: qz.course_title ?? '',
    }));
    counts.quizzes = quizzes.length;
  }

  res.json({
    success: true,
    data: { query: q, results, counts },
  });
}
