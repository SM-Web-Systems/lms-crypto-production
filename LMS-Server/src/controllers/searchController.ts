import { userRoleSummaries } from '../services/roleSummaryService.js';
/**
 * searchController — unified multi-entity search with RBAC filtering.
 *
 * Searches courses, users, credentials, and quizzes using SQL LIKE.
 * Results are filtered by the caller's role.
 */

import { Response } from 'express';
import { query } from '../config/database.js';
import { getUserPermissions } from '../middleware/rbac.js';
import { searchCourseScope, searchDirectoryScope } from '../services/searchScopeService.js';
import type { AuthRequest } from '../types/index.js';
import logger from '../utils/logger.js';

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

  try {
    const q = rawQ.slice(0, 100);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string, 10) || 5));
    const userId = req.user!.userId;
    const permissions = new Set(getUserPermissions(userId));
    const courseScope = searchCourseScope(userId, permissions);
    const staffScope = searchCourseScope(userId, permissions, true);

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

    // Course discovery uses enrollment, assignment, sponsor, or tenant scope.
    if (requestedTypes.includes('courses') && permissions.has('course.view')) {
      const courses = query<{ id: string; title: string; course_code: string; description: string }>(
        `SELECT c.id, c.title, c.course_code, c.description FROM courses c
         WHERE (c.title LIKE ? OR c.course_code LIKE ? OR c.description LIKE ?) AND ${courseScope.sql}
         ORDER BY title LIMIT ?`,
        [pattern, pattern, pattern, ...courseScope.params, limit],
      );
      results.courses = courses.map((c) => ({
        id: c.id,
        title: c.title,
        courseCode: c.course_code,
        description: c.description?.slice(0, 120) ?? '',
      }));
      counts.courses = courses.length;
    }

    if (requestedTypes.includes('users') && permissions.has('user.view_all')) {
      const directoryScope = searchDirectoryScope(userId, permissions);
      const users = query<{ id: string; name: string; email: string }>(
        `SELECT u.id, u.name, u.email FROM users u
         WHERE (u.name LIKE ? OR u.email LIKE ?) AND ${directoryScope.sql}
         ORDER BY name LIMIT ?`,
        [pattern, pattern, ...directoryScope.params, limit],
      );
      const summaries=userRoleSummaries(users.map(user=>user.id));
      results.users = users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        ...summaries.get(u.id)!,
      }));
      counts.users = users.length;
    }

    // Directory access never implies credential access. Reviewers are course-scoped.
    if (requestedTypes.includes('credentials')) {
      const credParams: unknown[] = [pattern, pattern];
      let credWhere = `(c.title LIKE ? OR u.name LIKE ?) AND nc.mint_status = 'minted' AND nc.is_superseded = 0`;
      const credentialScopes: string[] = [];
      if (permissions.has('certificate.view_own')) {
        credentialScopes.push('nc.user_id = ?');
        credParams.push(userId);
      }
      if (permissions.has('certificate.approve')) {
        const isAdministrator = permissions.has('course.delete');
        const studentScope = isAdministrator
          ? searchDirectoryScope(userId, permissions) : { sql: '1 = 1', params: [] };
        // Legacy credentials without a course remain visible to administrators
        // within their directory boundary, never to unassigned instructors.
        const reviewScope = isAdministrator ? `(c.id IS NULL OR ${staffScope.sql})` : staffScope.sql;
        credentialScopes.push(`(${reviewScope} AND ${studentScope.sql})`);
        credParams.push(...staffScope.params, ...studentScope.params);
      }
      credWhere += ` AND (${credentialScopes.length ? credentialScopes.join(' OR ') : '0 = 1'})`;
      credParams.push(limit);

      const creds = query<{
        id: string; course_title: string | null; student_name: string | null; created_at: string;
      }>(
        `SELECT nc.id, c.title AS course_title, u.name AS student_name, nc.created_at
         FROM nft_credentials nc
         LEFT JOIN quizzes source_quiz ON source_quiz.id = nc.quiz_id
         LEFT JOIN courses c ON c.id = COALESCE(nc.course_id, source_quiz.course_id)
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

    if (requestedTypes.includes('quizzes') && permissions.has('quiz.view_analytics')) {
      const quizzes = query<{ id: string; title: string; description: string | null; course_title: string | null }>(
        `SELECT q.id, q.title, q.description, c.title AS course_title
         FROM quizzes q
         LEFT JOIN courses c ON c.id = q.course_id
         WHERE (q.title LIKE ? OR q.description LIKE ?) AND ${staffScope.sql}
         ORDER BY q.title LIMIT ?`,
        [pattern, pattern, ...staffScope.params, limit],
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
  } catch (err) {
    logger.error({ err }, 'Search query failed');
    res.status(500).json({ success: false, error: { message: 'Search failed' } });
  }
}
