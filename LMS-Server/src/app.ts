import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import studentsRoutes from './routes/students.js';
import submissionsRoutes from './routes/submissions.js';
import analyticsRoutes from './routes/analytics.js';
import documentsRoutes from './routes/documents.js';
import forumRoutes from './routes/forum.js';
import coursesRoutes from './routes/courses.js';
import messagesRoutes from './routes/messages.js';
import profileRoutes from './routes/profile.js';
import usersRoutes from './routes/users.js';
import quizzesRoutes from './routes/quizzes.js';
import invitesRoutes from './routes/invites.js';
import announcementsRoutes from './routes/announcements.js';
import adminRoutes from './routes/admin.js';
import courseRequirementsRoutes from './routes/courseRequirements.js';
import nftApplicationsRoutes from './routes/nftApplications.js';
import lessonCompletionsRoutes from './routes/lessonCompletions.js';
import progressRoutes from './routes/progress.js';
import walletStatusRoutes from './routes/walletStatus.js';
import publicCredentialsRoutes from './routes/publicCredentials.js';
import notificationRoutes from './routes/notifications.js';
import studentProgressRoutes from './routes/studentProgress.js';
import studentRewardsRoutes from './routes/studentRewards.js';
import adminRewardsRoutes from './routes/adminRewards.js';
import paymentRoutes from './routes/payments.js';
import cohortRoutes from './routes/cohorts.js';
import rbacRoutes from './routes/rbac.js';
import tenantRoutes from './routes/tenants.js';
import webhookRoutes from './routes/webhooks.js';
import emailTemplateRoutes from './routes/emailTemplates.js';
import ogPagesRoutes from './routes/ogPages.js';
import searchRoutes from './routes/search.js';
import sponsorRoutes from './routes/sponsor.js';
import employerRoutes from './routes/employer.js';
import parentRoutes from './routes/parent.js';
import teacherRoutes from './routes/teacher.js';
import taRoutes from './routes/ta.js';
import systemConfigRoutes from './routes/systemConfig.js';
import perksRoutes from './routes/perks.js';
import loginHistoryRoutes from './routes/loginHistory.js';
import sessionsRoutes from './routes/sessions.js';
import dataExportRoutes from './routes/dataExport.js';
import disputeRoutes from './routes/disputes.js';
import nftMetadataRoutes from './routes/nftMetadata.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { getHealthStatus } from './services/healthCheckService.js';
import { getReadinessStatus } from './services/readinessService.js';
import logger from './utils/logger.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import { authenticate } from './middleware/auth.js';
import { requirePermission } from './middleware/rbac.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Honor X-Forwarded-* when deployed behind a reverse proxy (needed for correct IP-based rate limits).
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}
if (process.env.NODE_ENV === 'production' && !process.env.TRUST_PROXY) {
  logger.warn('NODE_ENV=production but TRUST_PROXY is not set. Rate limiting may not work correctly behind a reverse proxy.');
}

// Security headers
app.use(helmet());

// CORS — FRONTEND_URL can be comma-separated; in development, any localhost / 127.0.0.1 port is allowed (Vite port shifts when 5173 is taken).
const frontendUrlRaw = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = frontendUrlRaw.split(',').map((s) => s.trim()).filter(Boolean);
const isDev = process.env.NODE_ENV !== 'production';

const corsOrigin: cors.CorsOptions['origin'] = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }
  if (allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }
  if (isDev && /^https?:\/\/localhost(?::\d+)?$/i.test(origin)) {
    callback(null, true);
    return;
  }
  if (isDev && /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`CORS blocked origin: ${origin}`));
};

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Request tracing — adds x-request-id to all requests
app.use(requestLogger);

const RATE_WINDOW_MS = 15 * 60 * 1000;

/** Auth endpoints — brute-force protection. Override with AUTH_RATE_LIMIT_MAX. */
function readAuthMax(): number {
  const raw = process.env.AUTH_RATE_LIMIT_MAX;
  if (raw != null && raw !== '') {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return isDev ? 200 : 60;
}

/**
 * Write endpoints (POST / PATCH / PUT / DELETE) — prevent spam & data flooding.
 * Override with WRITE_RATE_LIMIT_MAX.
 */
function readWriteMax(): number {
  const raw = process.env.WRITE_RATE_LIMIT_MAX;
  if (raw != null && raw !== '') {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return isDev ? 1000 : 300;
}

const authMax  = readAuthMax();
const writeMax = readWriteMax();

/** Tight limiter on auth routes (login / signup brute-force protection). */
const SSO_PATHS = new Set(['/amma-login', '/amma-callback']);
const authLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' && SSO_PATHS.has(req.path),
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts, please try again later' } },
});

/**
 * Write limiter — applied only to mutating HTTP methods.
 * GET requests pass through unrestricted (the JWT is the gate for authenticated routes).
 */
const writeLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: writeMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
});

// Keep this name so any future code referencing apiLimiter still compiles.
const apiLimiter = writeLimiter;

/** Read rate limiter — all methods including GET. Prevents abuse of expensive queries. */
const readLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: isDev ? 2000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
});

if (process.env.NODE_ENV !== 'test') {
  const mins = RATE_WINDOW_MS / 60_000;
  logger.info(
    { writeMax, authMax, windowMin: mins, trustProxy: !!app.get('trust proxy') },
    `Rate limits: writes ${writeMax} req / ${mins} min per IP | auth ${authMax} / ${mins} min per IP | reads unlimited` +
      (app.get('trust proxy') ? ' (trust proxy on)' : '')
  );
}

// Webhook routes — mounted BEFORE JSON body parsing so they receive raw body for HMAC verification
app.use('/api/v1/webhooks', webhookRoutes);

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health checks (no rate limit)
/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Basic health check
 *     servers:
 *       - url: /
 *     responses:
 *       200: { description: Service healthy }
 */
app.get('/health', (_req, res) => { res.json(getHealthStatus()); });
/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     tags: [Health]
 *     summary: Health check (API-prefixed)
 *     servers:
 *       - url: /
 *     responses:
 *       200: { description: Service healthy }
 */
app.get('/api/v1/health', (_req, res) => { res.json(getHealthStatus()); });
/**
 * @openapi
 * /healthz:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe
 *     servers:
 *       - url: /
 *     responses:
 *       200: { description: Service ready }
 *       503: { description: Service not ready }
 */
app.get('/healthz', (_req, res) => {
  const status = getReadinessStatus();
  res.status(status.ready ? 200 : 503).json(status);
});

// OG pages — dynamic Open Graph tags for certificate verification (Phase 25 C2)
// Scoped to /verify to prevent readLimiter from applying to all routes (LOCKOUT-001).
app.use('/verify', readLimiter, ogPagesRoutes);

// API routes
app.use('/api/v1/auth', authLimiter, authRoutes);
// studentProgressRoutes MUST be mounted before studentsRoutes — the students router applies
// requirePermission('user.manage') to all /students/* paths, so /students/me/progress would be
// blocked for non-admin users if studentsRoutes ran first.
app.use('/api/v1', apiLimiter, studentProgressRoutes);
app.use('/api/v1', apiLimiter, studentRewardsRoutes);
app.use('/api/v1/admin/rewards', apiLimiter, adminRewardsRoutes);
app.use('/api/v1/students', apiLimiter, studentsRoutes);
app.use('/api/v1/submissions', apiLimiter, submissionsRoutes);
app.use('/api/v1/analytics', apiLimiter, analyticsRoutes);
app.use('/api/v1/documents', apiLimiter, documentsRoutes);
app.use('/api/v1/forum', apiLimiter, forumRoutes);
app.use('/api/v1/courses', apiLimiter, coursesRoutes);
app.use('/api/v1/messages', apiLimiter, messagesRoutes);
app.use('/api/v1/profile', apiLimiter, profileRoutes);
app.use('/api/v1/users', readLimiter, usersRoutes);
app.use('/api/v1/quizzes', apiLimiter, quizzesRoutes);
app.use('/api/v1', apiLimiter, invitesRoutes);
app.use('/api/v1/announcements', apiLimiter, announcementsRoutes);
app.use('/api/v1/admin', apiLimiter, adminRoutes);
app.use('/api/v1/courses', apiLimiter, courseRequirementsRoutes);
app.use('/api/v1', apiLimiter, nftApplicationsRoutes);
app.use('/api/v1', apiLimiter, lessonCompletionsRoutes);
app.use('/api/v1', apiLimiter, progressRoutes);
app.use('/api/v1', apiLimiter, walletStatusRoutes);
app.use('/api/v1', apiLimiter, notificationRoutes);
app.use('/api/v1', readLimiter, publicCredentialsRoutes);
app.use('/api/v1', readLimiter, nftMetadataRoutes);
app.use('/api/v1', apiLimiter, paymentRoutes);
app.use('/api/v1', apiLimiter, cohortRoutes);
app.use('/api/v1/admin', apiLimiter, rbacRoutes);
app.use('/api/v1/admin/tenants', apiLimiter, tenantRoutes);
app.use('/api/v1', apiLimiter, emailTemplateRoutes);
app.use('/api/v1', readLimiter, searchRoutes);
app.use('/api/v1', apiLimiter, sponsorRoutes);
app.use('/api/v1', apiLimiter, employerRoutes);
app.use('/api/v1', apiLimiter, parentRoutes);
app.use('/api/v1', apiLimiter, teacherRoutes);
app.use('/api/v1', apiLimiter, taRoutes);
app.use('/api/v1/system', apiLimiter, systemConfigRoutes);
app.use('/api/v1/perks', apiLimiter, perksRoutes);
app.use('/api/v1', apiLimiter, loginHistoryRoutes);
app.use('/api/v1', apiLimiter, sessionsRoutes);
app.use('/api/v1', apiLimiter, dataExportRoutes);
app.use('/api/v1', apiLimiter, disputeRoutes);

// ─── API Documentation ─────────────────────────────────────────────────────
app.get('/api-docs/spec.json', (_req, res) => { res.json(swaggerSpec); });
if (process.env.NODE_ENV === 'production') {
  app.use('/api-docs', authenticate, requirePermission('system.view_audit_log'), swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} else {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Serve uploaded avatars only — submissions/documents served via authenticated endpoints
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads/avatars', express.static(path.join(UPLOAD_DIR, 'avatars')));

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

