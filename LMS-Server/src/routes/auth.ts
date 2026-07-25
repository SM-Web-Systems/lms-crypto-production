import { Router } from 'express';
import {
  login, register, logout, getMe, forgotPassword, resetPassword,
  ammaLogin, ammaCallback,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// POST /auth/register - Create a new account
router.post('/register', register);

// POST /auth/login - Authenticate user
router.post('/login', login);

// POST /auth/forgot-password - Request a password reset email (no auth required)
router.post('/forgot-password', forgotPassword);

// POST /auth/reset-password - Set a new password using a valid reset token (no auth required)
router.post('/reset-password', resetPassword);

// POST /auth/logout - Logout user (requires auth)
router.post('/logout', authenticate, logout);

// GET /auth/me - Get current user info
router.get('/me', authenticate, getMe);

// ── AmmaWallet SSO ────────────────────────────────────────────────────────────
// GET /auth/amma-login    — redirects browser to AmmaWallet SSO login page
// GET /auth/amma-callback — receives assertion from AmmaWallet, issues LMS JWT
router.get('/amma-login',    ammaLogin);
router.get('/amma-callback', ammaCallback);

export default router;

