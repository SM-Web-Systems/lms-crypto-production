import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { query, queryOne, execute } from "../config/database.js";
import { generateToken } from "../config/jwt.js";
import { AuthRequest, User, ErrorCodes, Student, UserRole } from "../types/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { createUserWallet } from "../services/walletService.js";
import { sendPasswordResetEmail } from "../services/emailService.js";
import {
  buildSsoInitiateUrl,
  validateState,
  verifyAssertion,
  type AmmaWalletSSOUser,
} from "../services/ammaWalletSSOService.js";


/** Emails (comma-separated in ADMIN_EMAILS) that should be granted admin automatically. */
function isAdminEmail(email: string): boolean {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return false;
  const set = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  return set.has(email.toLowerCase());
}

/** Emails (comma-separated in LECTURER_EMAILS) promoted to lecturer on login/register. */
function isLecturerEmail(email: string): boolean {
  const raw = process.env.LECTURER_EMAILS?.trim();
  if (!raw) return false;
  const set = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  return set.has(email.toLowerCase());
}

function getUserCourseCodes(userId: string): string[] {
  try {
    const rows = query<{ course_code: string }>(
      "SELECT course_code FROM user_course_codes WHERE user_id = ? ORDER BY course_code",
      [userId],
    );
    return rows.map((r) => r.course_code);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (
      err?.code === "SQLITE_ERROR" &&
      err?.message?.includes("user_course_codes")
    )
      return [];
    throw e;
  }
}

export async function login(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      throw new AppError(
        "Email and password are required",
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // Find user by email
    const user = queryOne<User>("SELECT * FROM users WHERE email = ?", [
      email.toLowerCase(),
    ]);

    if (!user) {
      throw new AppError(
        "Invalid email or password",
        401,
        ErrorCodes.INVALID_CREDENTIALS,
      );
    }

    // AmmaWallet SSO users must authenticate via AmmaWallet, not local password
    if (user.auth_provider === 'ammawallet') {
      throw new AppError(
        "Your account is managed by AmmaWallet. Please use 'Sign in with AmmaWallet' to continue.",
        401,
        ErrorCodes.SSO_REQUIRED,
      );
    }

    // Reject accounts without a usable local password
    if (!user.password_hash || user.password_hash === '$sso$') {
      throw new AppError(
        "Invalid email or password",
        401,
        ErrorCodes.INVALID_CREDENTIALS,
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new AppError(
        "Invalid email or password",
        401,
        ErrorCodes.INVALID_CREDENTIALS,
      );
    }

    // Auto-promote listed admin/lecturer emails so the role stays in sync on each login.
    let role = user.role;
    if (role !== "admin" && isAdminEmail(user.email)) {
      execute(
        "UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE id = ?",
        [user.id],
      );
      role = "admin";
    } else if (role === "student" && isLecturerEmail(user.email)) {
      execute(
        "UPDATE users SET role = 'lecturer', updated_at = datetime('now') WHERE id = ?",
        [user.id],
      );
      role = "lecturer";
    }

    // Get studentId if user is a student
    let studentId: string | undefined;
    if (role === "student") {
      const student = queryOne<Student>(
        "SELECT id FROM students WHERE user_id = ?",
        [user.id],
      );
      studentId = student?.id;
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role,
      studentId,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role,
          walletAddress: user.walletAddress,
          walletLinkingStatus: user.wallet_linking_status,
          courseCodes: getUserCourseCodes(user.id)
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    // Validate input
    if (!name || !email || !password) {
      throw new AppError(
        "Name, email and password are required",
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (!EMAIL_RE.test(email)) {
      throw new AppError(
        "Please enter a valid email address",
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (password.length < 8) {
      throw new AppError(
        "Password must be at least 8 characters",
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // Reject duplicate accounts
    const existing = queryOne<User>("SELECT id FROM users WHERE email = ?", [
      email,
    ]);
    if (existing) {
      throw new AppError(
        "An account with this email already exists",
        409,
        ErrorCodes.DUPLICATE_ENTRY,
      );
    }

    const role: UserRole = isAdminEmail(email) ? "admin" : isLecturerEmail(email) ? "lecturer" : "student";
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    let walletAddress: string | null = null;
    let walletLinkingStatus: 'none' | 'linked' | 'existing_account' = 'none';
    try {
      walletAddress = await createUserWallet(email, password, userId);
      walletLinkingStatus = 'linked';
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e?.code === 'AMMA_EMAIL_EXISTS') {
        // This email already exists on AmmaWallet — block local registration.
        // The user must sign in with AmmaWallet SSO instead.
        throw new AppError(
          "This email is already registered with AmmaWallet. Please use 'Sign in with AmmaWallet' to access your account.",
          409,
          ErrorCodes.SSO_REQUIRED,
        );
      }
      walletLinkingStatus = 'none';
      console.warn('[register] wallet creation:', e?.message ?? String(err));
    }
    const maskedEmail = email.replace(/^(.).*@/, '$1***@');
    console.log(`[authController:register] userId=${userId} email=${maskedEmail} transition=none→${walletLinkingStatus}`);

    execute(
      "INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [userId, name, email, passwordHash, role, walletAddress, walletLinkingStatus],
    );

    // Students get a profile row so submissions/enrollment work immediately.
    let studentId: string | undefined;
    if (role === "student") {
      studentId = uuidv4();
      const enrollmentNumber = `REG-${userId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
      execute(
        `INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
         VALUES (?, ?, ?, ?, ?, 'General', 1)`,
        [studentId, userId, name, email, enrollmentNumber],
      );
    }

    const token = generateToken({ userId, email, role, studentId });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: userId,
          name,
          email,
          role,
          walletAddress,
          walletLinkingStatus,
          courseCodes: getUserCourseCodes(userId),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(_req: AuthRequest, res: Response): Promise<void> {
  // For stateless JWT, logout is handled client-side
  res.json({
    success: true,
    message: "Logged out successfully",
  });
}

export async function getMe(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(
        "Authentication required",
        401,
        ErrorCodes.UNAUTHORIZED,
      );
    }

    const user = queryOne<User>(
      "SELECT id, name, email, role, walletAddress, wallet_linking_status FROM users WHERE id = ?",
      [req.user.userId],
    );

    if (!user) {
      throw new AppError("User not found", 404, ErrorCodes.NOT_FOUND);
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress,
        walletLinkingStatus: user.wallet_linking_status,
        courseCodes: getUserCourseCodes(user.id),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    // Always return the same response to prevent user enumeration
    const genericResponse = {
      success: true,
      message:
        "If that email is registered, you will receive a reset link shortly.",
    };

    if (!email) {
      res.json(genericResponse);
      return;
    }

    const user = queryOne<{ id: string; name: string; email: string; auth_provider: string }>(
      "SELECT id, name, email, auth_provider FROM users WHERE email = ?",
      [email],
    );

    if (user) {
      // SSO users reset passwords through AmmaWallet, not LMS
      if (user.auth_provider === 'ammawallet') {
        // Return the generic response — the frontend checks SSO status separately
        res.json(genericResponse);
        return;
      }

      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const frontendUrl = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

      execute(
        `UPDATE users SET
           password_reset_token = ?,
           password_reset_expires_at = datetime('now', '+1 hour'),
           updated_at = datetime('now')
         WHERE id = ?`,
        [tokenHash, user.id],
      );

      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
    }

    res.json(genericResponse);
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token =
      typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!token) {
      throw new AppError(
        "Reset token is required.",
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (!password || password.length < 8) {
      throw new AppError(
        "Password must be at least 8 characters.",
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const user = queryOne<{ id: string }>(
      `SELECT id FROM users
       WHERE password_reset_token = ?
         AND password_reset_expires_at > datetime('now')`,
      [tokenHash],
    );

    if (!user) {
      throw new AppError(
        "This reset link is invalid or has expired. Please request a new one.",
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    execute(
      `UPDATE users SET
         password_hash = ?,
         password_reset_token = NULL,
         password_reset_expires_at = NULL,
         password_changed_at = datetime('now'),
         updated_at = datetime('now')
       WHERE id = ?`,
      [passwordHash, user.id],
    );

    res.json({
      success: true,
      message: "Password updated. Please log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AmmaWallet SSO — initiate + callback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/auth/amma-login
 * Redirects the browser to the AmmaWallet SSO login page with a signed state
 * nonce and the LMS callback URL.
 */
export function ammaLogin(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const frontendUrl = (process.env.FRONTEND_URL || 'https://lms.smwebsystems.com').replace(/\/$/, '');
    // The callback target is the LMS API endpoint (not the frontend SPA route)
    const callbackUrl = `${frontendUrl}/api/v1/auth/amma-callback`;
    const redirectUrl = buildSsoInitiateUrl(callbackUrl);
    res.redirect(302, redirectUrl);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/auth/amma-callback?assertion=<token>&state=<state-jwt>
 * Validates state, verifies assertion with AmmaWallet, finds-or-creates LMS
 * profile, issues LMS JWT, redirects to frontend /sso-callback with token.
 */
export async function ammaCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const frontendUrl = (process.env.FRONTEND_URL || 'https://lms.smwebsystems.com').replace(/\/$/, '');

  const safeRedirectError = (code: string) =>
    res.redirect(302, `${frontendUrl}/login?sso_error=${code}`);

  try {
    const assertion = typeof req.query.assertion === 'string' ? req.query.assertion : '';
    const state     = typeof req.query.state     === 'string' ? req.query.state     : '';

    if (!assertion || !state) {
      return safeRedirectError('missing_params');
    }

    // 1. Validate the state JWT (CSRF / replay protection)
    try {
      validateState(state);
    } catch (err) {
      console.warn('[ammaCallback] Invalid state:', (err as Error).message);
      return safeRedirectError('invalid_state');
    }

    // 2. Exchange assertion for AmmaWallet user identity (server-to-server)
    let ammaUser: AmmaWalletSSOUser;
    try {
      ammaUser = await verifyAssertion(assertion);
    } catch (err) {
      console.error('[ammaCallback] SSO verify error:', (err as Error).message);
      return safeRedirectError('verify_failed');
    }

    const email = ammaUser.email.toLowerCase();
    const maskedEmail = email.replace(/^(.).*@/, '$1***@');
    console.log(`[ammaCallback] SSO userId=${ammaUser.userId} email=${maskedEmail}`);

    // 3. Find-or-create LMS user profile
    // Prefer lookup by ammawallet_user_id (stable), fall back to email
    let user = queryOne<User>(
      "SELECT * FROM users WHERE ammawallet_user_id = ?",
      [ammaUser.userId],
    ) ?? queryOne<User>(
      "SELECT * FROM users WHERE email = ?",
      [email],
    );

    const role: UserRole = isAdminEmail(email) ? 'admin' : isLecturerEmail(email) ? 'lecturer' : (user?.role ?? 'student');
    let userId: string;
    let studentId: string | undefined;

    if (user) {
      userId = user.id;

      // Migrate existing local-password account to SSO; propagate wallet if present
      if (ammaUser.mainnetWalletAddress) {
        execute(
          `UPDATE users SET
             auth_provider         = 'ammawallet',
             ammawallet_user_id    = ?,
             walletAddress         = ?,
             wallet_linking_status = 'linked',
             updated_at            = datetime('now')
           WHERE id = ?`,
          [ammaUser.userId, ammaUser.mainnetWalletAddress, userId],
        );
        console.log(`[ammaCallback] wallet linked: ${ammaUser.mainnetWalletAddress.slice(0, 8)}...`);
      } else {
        execute(
          `UPDATE users SET
             auth_provider      = 'ammawallet',
             ammawallet_user_id = ?,
             updated_at         = datetime('now')
           WHERE id = ?`,
          [ammaUser.userId, userId],
        );
      }

      // Auto-promote to admin/lecturer if email matches ADMIN_EMAILS / LECTURER_EMAILS
      if (role !== user.role) {
        execute(
          "UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?",
          [role, userId],
        );
      }

      // Resolve studentId for existing student
      if (role === 'student') {
        const student = queryOne<Student>('SELECT id FROM students WHERE user_id = ?', [userId]);
        studentId = student?.id;
      }

      console.log(`[ammaCallback] Found existing user id=${userId} email=${maskedEmail} — migrated to SSO wallet=${ammaUser.mainnetWalletAddress ? 'linked' : 'none'}`);
    } else {
      // Provision new LMS user (SSO-only, no local password)
      userId = uuidv4();
      const name = [ammaUser.firstName, ammaUser.lastName].filter(Boolean).join(' ')
        || email.split('@')[0];

      execute(
        `INSERT INTO users
           (id, name, email, password_hash, role, auth_provider, ammawallet_user_id,
            walletAddress, wallet_linking_status)
         VALUES (?, ?, ?, '$sso$', ?, 'ammawallet', ?, ?, ?)`,
        [
          userId, name, email, role, ammaUser.userId,
          ammaUser.mainnetWalletAddress ?? null,
          ammaUser.mainnetWalletAddress ? 'linked' : 'none',
        ],
      );

      if (role === 'student') {
        studentId = uuidv4();
        const enrollmentNumber = `REG-${userId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
        execute(
          `INSERT INTO students
             (id, user_id, name, email, enrollment_number, department, semester)
           VALUES (?, ?, ?, ?, ?, 'General', 1)`,
          [studentId, userId, name, email, enrollmentNumber],
        );
      }

      console.log(`[ammaCallback] Created new SSO user id=${userId} email=${maskedEmail}`);
    }

    // 4. Issue LMS session JWT
    const token = generateToken({ userId, email, role, studentId });

    // 5. Hand token to the frontend via hash fragment (not visible to server logs)
    const ssoCallbackUrl = `${frontendUrl}/sso-callback#token=${encodeURIComponent(token)}&role=${role}`;
    res.redirect(302, ssoCallbackUrl);
  } catch (error) {
    next(error);
  }
}

// Helper function to create a user (for seeding/registration)
export async function createUser(
  name: string,
  email: string,
  password: string,
  role: UserRole,
): Promise<User> {
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);

  const stmt = `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`;
  query(stmt, [id, name, email.toLowerCase(), passwordHash, role]);

  const user = queryOne<User>("SELECT * FROM users WHERE id = ?", [id]);
  if (!user) {
    throw new Error("Failed to create user");
  }

  return user;
}
