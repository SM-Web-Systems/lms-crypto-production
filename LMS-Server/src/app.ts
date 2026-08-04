import express, { type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from './config/database.js';

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
import paymentRoutes from './routes/payments.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Honor X-Forwarded-* when deployed behind a reverse proxy (needed for correct IP-based rate limits).
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}
if (process.env.NODE_ENV === 'production' && !process.env.TRUST_PROXY) {
  console.warn('⚠️  WARNING: NODE_ENV=production but TRUST_PROXY is not set. Rate limiting may not work correctly behind a reverse proxy.');
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
const authLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: authMax,
  standardHeaders: true,
  legacyHeaders: false,
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
  console.log(
    `⏱️  Rate limits: writes ${writeMax} req / ${mins} min per IP | auth ${authMax} / ${mins} min per IP | reads unlimited` +
      (app.get('trust proxy') ? ' (trust proxy on)' : '')
  );
}

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

function sendHealthJson(res: Response): void {
  let dbStatus: 'ok' | 'error' = 'ok';
  try { db.prepare('SELECT 1').get(); } catch { dbStatus = 'error'; }
  res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db: dbStatus,
    ammaWallet: {
      url: !!process.env.AMMA_WALLET_URL,
      apiKey: !!process.env.AMMA_WALLET_API_KEY,
      network: process.env.AMMA_WALLET_NETWORK ?? 'testnet',
    },
  });
}

// Health checks (no rate limit). Use /health for bare-metal probes; /api/v1/health matches the API prefix (e.g. some gateways).
app.get('/health', (_req, res) => {
  sendHealthJson(res);
});
app.get('/api/v1/health', (_req, res) => {
  sendHealthJson(res);
});

// API routes
app.use('/api/v1/auth', authLimiter, authRoutes);
// studentProgressRoutes MUST be mounted before studentsRoutes — the students router applies
// authorize('admin') to all /students/* paths, so /students/me/progress would be blocked for
// non-admin users if studentsRoutes ran first.
app.use('/api/v1', apiLimiter, studentProgressRoutes);
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
app.use('/api/v1', apiLimiter, paymentRoutes);

// Serve uploaded avatars only — submissions/documents served via authenticated endpoints
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads/avatars', express.static(path.join(UPLOAD_DIR, 'avatars')));

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

