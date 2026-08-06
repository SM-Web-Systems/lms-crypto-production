import { Router } from 'express';
import {
  login, register, logout, getMe, forgotPassword, resetPassword,
  ammaLogin, ammaCallback,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create a new account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201: { description: Account created }
 *       409: { description: Email already registered }
 */
// POST /auth/register - Create a new account
router.post('/register', register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful, returns JWT token }
 *       401: { description: Invalid credentials }
 */
// POST /auth/login - Authenticate user
router.post('/login', login);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Reset email sent }
 */
// POST /auth/forgot-password - Request a password reset email (no auth required)
router.post('/forgot-password', forgotPassword);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set new password using reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Password reset successful }
 *       400: { description: Invalid or expired token }
 */
// POST /auth/reset-password - Set a new password using a valid reset token (no auth required)
router.post('/reset-password', resetPassword);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Logged out }
 *       401: { description: Unauthorized }
 */
// POST /auth/logout - Logout user (requires auth)
router.post('/logout', authenticate, logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user info
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current user data }
 *       401: { description: Unauthorized }
 */
// GET /auth/me - Get current user info
router.get('/me', authenticate, getMe);

// ── AmmaWallet SSO ────────────────────────────────────────────────────────────
// GET /auth/amma-login    — redirects browser to AmmaWallet SSO login page
// GET /auth/amma-callback — receives assertion from AmmaWallet, issues LMS JWT
/**
 * @openapi
 * /auth/amma-login:
 *   get:
 *     tags: [Auth]
 *     summary: Redirect to AmmaWallet SSO login
 *     responses:
 *       302: { description: Redirects to AmmaWallet SSO }
 */
router.get('/amma-login',    ammaLogin);
/**
 * @openapi
 * /auth/amma-callback:
 *   get:
 *     tags: [Auth]
 *     summary: Receive AmmaWallet SSO assertion
 *     parameters:
 *       - in: query
 *         name: token
 *         schema: { type: string }
 *     responses:
 *       200: { description: SSO login successful }
 *       401: { description: Invalid SSO token }
 */
router.get('/amma-callback', ammaCallback);

export default router;

