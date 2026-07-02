import { Router } from 'express';
import { login, register, googleLogin, logout, getMe } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// POST /auth/register - Create a new account
router.post('/register', register);

// POST /auth/login - Authenticate user
router.post('/login', login);

// POST /auth/google - Sign in with Google (id_token in body)
router.post('/google', googleLogin);

// POST /auth/logout - Logout user (requires auth)
router.post('/logout', authenticate, logout);

// GET /auth/me - Get current user info
router.get('/me', authenticate, getMe);

export default router;

