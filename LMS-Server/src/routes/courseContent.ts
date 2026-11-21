/**
 * Course content and media analytics routes. Mounted at /api/v1.
 *
 * GET  /courses/:courseId/content-manifest            — every lesson, resolved for web and mobile
 * GET  /courses/:courseId/lessons/:itemId/reading     — a lesson's reading as sanitized HTML
 * GET  /courses/:id/content-sources                   — approved GitHub sources for the course (managers)
 * PUT  /courses/:id/content-sources                   — replace them (managers)
 * POST /courses/:courseId/lessons/:itemId/play-events — record a media play milestone (learner)
 * GET  /analytics/media                               — per-lesson media totals, JSON or ?format=csv (admins)
 */
import { Router, type NextFunction, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { requireCourseManagementScope, requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import {
  CourseContentError, contentManifest, lessonReading, listCourseSources, replaceCourseSources,
} from '../services/courseContentService.js';
import { mediaStats, mediaStatsCsv, recordPlayEvent } from '../services/mediaPlayService.js';

const router = Router();
const production = process.env.NODE_ENV === 'production';
const perUser = (limit: number) => rateLimit({
  windowMs: 60_000,
  limit: production ? limit : 5000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user?.userId ?? 'anonymous',
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
});
const readingLimiter = perUser(120);
const playLimiter = perUser(60);

function fail(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof CourseContentError) {
    res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    return;
  }
  next(error);
}

router.get('/courses/:courseId/content-manifest', authenticate, (req: AuthRequest, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: contentManifest(req.user!.userId, req.params.courseId) });
  } catch (error) { fail(res, next, error); }
});

router.get('/courses/:courseId/lessons/:itemId/reading', authenticate, readingLimiter, async (req: AuthRequest, res, next) => {
  try {
    res.set('Cache-Control', 'private, max-age=300');
    res.json({ success: true, data: await lessonReading(req.user!.userId, req.params.courseId, req.params.itemId) });
  } catch (error) { fail(res, next, error); }
});

router.get('/courses/:id/content-sources', authenticate, requirePermission('course.manage'), requireCourseManagementScope,
  (req: AuthRequest, res) => { res.json({ success: true, data: { sources: listCourseSources(req.params.id) } }); });

router.put('/courses/:id/content-sources', authenticate, requirePermission('course.manage'), requireCourseManagementScope,
  (req: AuthRequest, res, next) => {
    try { res.json({ success: true, data: { sources: replaceCourseSources(req.params.id, req.body?.sources) } }); }
    catch (error) { fail(res, next, error); }
  });

router.post('/courses/:courseId/lessons/:itemId/play-events', authenticate, playLimiter, (req: AuthRequest, res, next) => {
  try { res.json({ success: true, data: recordPlayEvent(req.user!.userId, req.params.courseId, req.params.itemId, req.body) }); }
  catch (error) { fail(res, next, error); }
});

const day = (value: unknown, endOfDay: boolean) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(value + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
  return Number.isFinite(time) ? time : undefined;
};

router.get('/analytics/media', authenticate, requirePermission('system.view_audit_log'), (req: AuthRequest, res) => {
  const courseId = typeof req.query.courseId === 'string' && req.query.courseId ? req.query.courseId : undefined;
  const rows = mediaStats({ courseId, from: day(req.query.from, false), to: day(req.query.to, true) });
  if (req.query.format === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="lesson-media-views.csv"');
    res.send(mediaStatsCsv(rows));
    return;
  }
  res.json({ success: true, data: { lessons: rows } });
});

export default router;
