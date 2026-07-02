import express, { type Response } from 'express';
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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Honor X-Forwarded-* when deployed behind a reverse proxy (needed for correct IP-based rate limits).
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

if (process.env.NODE_ENV !== 'test') {
  const mins = RATE_WINDOW_MS / 60_000;
  console.log(
    `⏱️  Rate limits: writes ${writeMax} req / ${mins} min per IP | auth ${authMax} / ${mins} min per IP | reads unlimited` +
      (app.get('trust proxy') ? ' (trust proxy on)' : '')
  );
}

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function sendHealthJson(res: Response): void {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
app.use('/api/v1/students', apiLimiter, studentsRoutes);
app.use('/api/v1/submissions', apiLimiter, submissionsRoutes);
app.use('/api/v1/analytics', apiLimiter, analyticsRoutes);
app.use('/api/v1/documents', apiLimiter, documentsRoutes);
app.use('/api/v1/forum', apiLimiter, forumRoutes);
app.use('/api/v1/courses', apiLimiter, coursesRoutes);
app.use('/api/v1/messages', apiLimiter, messagesRoutes);
app.use('/api/v1/profile', apiLimiter, profileRoutes);
app.use('/api/v1/users', apiLimiter, usersRoutes);
app.use('/api/v1/quizzes', apiLimiter, quizzesRoutes);
app.use('/api/v1', apiLimiter, invitesRoutes);
app.use('/api/v1/announcements', apiLimiter, announcementsRoutes);

// Serve uploaded avatars (and other uploads) as static files
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

