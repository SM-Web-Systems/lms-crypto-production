import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { db, query, queryOne, execute, createSession, hashToken } from "../config/database.js";
import { invalidateAuthorization } from '../services/roleSecurityService.js';
import { generateToken } from "../config/jwt.js";
import { AuthRequest, User, ErrorCodes, Student, LegacyRole } from "../types/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { createUserWallet } from "../services/walletService.js";
import { getUserRoles } from "../middleware/rbac.js";
import { getAuthorizationContext } from '../services/authorizationService.js';
import { sendPasswordResetEmail } from "../services/emailService.js";
import {
  buildSsoInitiateUrl,
  validateState,
  verifyAssertion,
  parseSsoIdentity,
  type WalletLinkContext,
  type AmmaWalletSSOUser,
} from "../services/ammaWalletSSOService.js";
import logger from "../utils/logger.js";
import { resolveAmmaAccount, SsoPolicyError } from "../services/ammaAccountService.js";
import { createNotification } from "../services/notificationService.js";
import { createMobileHandoff, consumeMobileHandoff, isMobileSsoContext, MOBILE_SSO_CALLBACK, type MobileSsoContext } from '../services/mobileSsoService.js';


/** Record a login event in the login_history table. Best-effort — never throws. */
function recordLoginHistory(userId: string, req: Request, authMethod: 'local' | 'ammawallet' | 'sso'): void {
  try {
    execute(
      'INSERT INTO login_history (user_id, ip_address, user_agent, auth_method) VALUES (?, ?, ?, ?)',
      [userId, req.ip ?? req.socket?.remoteAddress ?? null, req.get('user-agent') ?? null, authMethod]
    );
  } catch {
    // Best-effort — never block login on history failure
  }
}

/** Initial administrator provisioning for new accounts only. */
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

/** Initial lecturer provisioning for new accounts only. */
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

    // Existing accounts are governed by role management, not provisioning lists.
    // Reapplying ADMIN_EMAILS here would undo an intentional demotion on login.
    const role = user.role;

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
      roles: getUserRoles(user.id),
      studentId,
    });

    recordLoginHistory(user.id, req, 'local');
    try { createSession(user.id, token, req); } catch { /* best-effort */ }

    // F6: Notify linked parents of student login (best-effort)
    try {
      const parentLinks = query<{ parent_user_id: string }>(
        "SELECT parent_user_id FROM user_links WHERE child_user_id = ? AND link_type = 'parent'",
        [user.id],
      );
      for (const link of parentLinks) {
        createNotification({
          userId: link.parent_user_id,
          type: 'student_login',
          title: 'Student Login',
          body: `${user.name} has logged in.`,
        });
      }
    } catch { /* best-effort */ }

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
          authProvider: user.auth_provider ?? 'local',
          courseCodes: getUserCourseCodes(user.id),
          ...getAuthorizationContext(user.id),
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
    if (name.length > 200) {
      throw new AppError(
        "Name must be 200 characters or fewer",
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

    const role: LegacyRole = isAdminEmail(email) ? "admin" : isLecturerEmail(email) ? "lecturer" : "student";
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
      logger.warn({ module: 'authController', action: 'register', code: e?.code ?? 'UNKNOWN' }, 'Wallet creation failed');
    }
    const maskedEmail = email.replace(/^(.).*@/, '$1***@');
    logger.info({ module: 'authController', action: 'register', userId, email: maskedEmail, transition: `none→${walletLinkingStatus}` }, 'User registered');

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

    const token = generateToken({ userId, email, role, roles: getUserRoles(userId), studentId });

    recordLoginHistory(userId, req, 'local');
    try { createSession(userId, token, req); } catch { /* best-effort */ }

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
          ...getAuthorizationContext(userId),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  const token = req.headers.authorization!.slice(7);
  const expiresAt = new Date((req.user!.exp ?? Math.floor(Date.now() / 1000) + 86400) * 1000).toISOString();
  execute(`INSERT INTO active_sessions (id,user_id,token_hash,expires_at,revoked_at)
    VALUES (?,?,?,?,datetime('now')) ON CONFLICT(token_hash) DO UPDATE SET revoked_at = datetime('now')`,
    [uuidv4(),req.user!.userId,hashToken(token),expiresAt]);
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
      "SELECT * FROM users WHERE id = ?",
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
        authProvider: user.auth_provider ?? 'local',
        courseCodes: getUserCourseCodes(user.id),
        ...getAuthorizationContext(user.id),
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

    db.transaction(() => {
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
      // Versions also invalidate tokens issued in the same second as this reset.
      invalidateAuthorization(user.id);
    })();

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

/** POST /auth/amma-link. Target and session are derived exclusively from authentication. */
export async function ammaLink(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = queryOne<User & {authorization_version: number}>('SELECT * FROM users WHERE id = ?', [req.user!.userId]);
    if (!user) throw new AppError('Account unavailable', 401, ErrorCodes.UNAUTHORIZED);
    if (!user.ammawallet_user_id) {
      const password = req.body?.password;
      if (typeof password !== 'string' || password.length > 1024 || !user.password_hash || user.password_hash === '$sso$'
        || !await bcrypt.compare(password, user.password_hash)) {
        throw new AppError('Confirm your current LMS password to connect AmmaWallet.', 400, ErrorCodes.INVALID_CREDENTIALS);
      }
    }
    // Password comparison is asynchronous; recheck version and revocation before issuing state.
    const current = queryOne<{authorization_version: number}>('SELECT authorization_version FROM users WHERE id = ?', [user.id]);
    const sessionHash = hashToken(req.headers.authorization!.slice(7));
    const session = queryOne<{revoked_at: string | null; expired: number}>(
      "SELECT revoked_at, datetime(expires_at) <= datetime('now') AS expired FROM active_sessions WHERE token_hash = ?", [sessionHash]);
    if (!current || current.authorization_version !== (req.user!.authorizationVersion ?? 0) || session?.revoked_at || session?.expired) {
      throw new AppError('Session changed. Please sign in again.', 401, ErrorCodes.UNAUTHORIZED);
    }
    const frontendUrl = (process.env.FRONTEND_URL || 'https://lms.smwebsystems.com').replace(/\/$/, '');
    const url = buildSsoInitiateUrl(`${frontendUrl}/api/v1/auth/amma-callback`, {
      client: 'link', userId: user.id, authorizationVersion: current.authorization_version,
      sessionHash, sessionExpires: req.user!.exp!,
    });
    res.json({success: true, data: {url}});
  } catch (error) { next(error); }
}

/**
 * GET /api/v1/auth/amma-login
 * Redirects the browser to the AmmaWallet SSO login page with a signed state
 * nonce and the LMS callback URL.
 */
export function ammaLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    let mobile: MobileSsoContext | undefined;
    const nativeParameters = ['client','code_challenge','code_challenge_method','app_state','redirect_uri'];
    if (nativeParameters.some(key => req.query[key] !== undefined)) {
      const candidate = {client: req.query.client, codeChallenge: req.query.code_challenge, appState: req.query.app_state};
      if (req.query.redirect_uri !== undefined || req.query.code_challenge_method !== 'S256' || !isMobileSsoContext(candidate)) {
        throw new AppError('Invalid mobile sign-in request',400,ErrorCodes.VALIDATION_ERROR);
      }
      mobile = candidate;
    }
    const frontendUrl = (process.env.FRONTEND_URL || 'https://lms.smwebsystems.com').replace(/\/$/, '');
    // The callback target is the LMS API endpoint (not the frontend SPA route)
    const callbackUrl = `${frontendUrl}/api/v1/auth/amma-callback`;
    const redirectUrl = buildSsoInitiateUrl(callbackUrl, mobile);
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
  let mobile: MobileSsoContext | undefined;
  let link: WalletLinkContext | undefined;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  const safeRedirectError = (code: string) => {
    if (mobile) {
      const destination = new URL(MOBILE_SSO_CALLBACK);
      destination.searchParams.set('error',code);
      destination.searchParams.set('state',mobile.appState);
      return res.redirect(302,destination.toString());
    }
    if (link && code !== 'link_expired') return res.redirect(302, `${frontendUrl}/profile?wallet_error=${code}`);
    return res.redirect(302, `${frontendUrl}/login?sso_error=${code}`);
  };

  try {
    const assertion = typeof req.query.assertion === 'string' ? req.query.assertion : '';
    const state     = typeof req.query.state     === 'string' ? req.query.state     : '';

    if (!state) {
      return safeRedirectError('missing_params');
    }

    // 1. Validate the state JWT (CSRF / replay protection)
    try {
      const context = validateState(state);
      if (context?.client === 'mobile') mobile = context;
      else if (context?.client === 'link') link = context;
    } catch (err) {
      logger.warn({ module: 'ammaCallback', err }, 'Invalid state');
      return safeRedirectError('invalid_state');
    }

    if (!assertion) return safeRedirectError(req.query.error === 'access_denied' ? 'cancelled' : 'missing_params');

    // 2. Exchange assertion for AmmaWallet user identity (server-to-server)
    let ammaUser: AmmaWalletSSOUser;
    try {
      ammaUser = parseSsoIdentity(await verifyAssertion(assertion));
    } catch (err) {
      logger.error({ module: 'ammaCallback', err }, 'SSO verify error');
      return safeRedirectError('verify_failed');
    }

    const verifiedEmail = ammaUser.email?.trim().toLowerCase() ?? '';
    const initialRole: LegacyRole = isAdminEmail(verifiedEmail) ? 'admin' : isLecturerEmail(verifiedEmail) ? 'lecturer' : 'student';
    let resolved: ReturnType<typeof resolveAmmaAccount>;
    try {
      resolved = resolveAmmaAccount(ammaUser, initialRole, link);
    } catch (error) {
      if (error instanceof SsoPolicyError) return safeRedirectError(error.code);
      throw error;
    }
    const {user, studentId} = resolved;
    const {id: userId, email, role} = user;

    // Native clients receive only a short-lived proof-bound code. The access
    // token is issued through HTTPS after the app proves possession of its verifier.
    if (mobile) {
      const version = queryOne<{authorization_version:number}>('SELECT authorization_version FROM users WHERE id=?',[userId])!.authorization_version;
      return void res.redirect(302,createMobileHandoff(userId,version,mobile));
    }

    // 4. Issue LMS session JWT
    const token = generateToken({ userId, email, role, roles: getUserRoles(userId), studentId });

    recordLoginHistory(userId, req, 'sso');
    createSession(userId, token, req);

    // 5. Hand token to the frontend via hash fragment (not visible to server logs)
    const ssoCallbackUrl = `${frontendUrl}/sso-callback#token=${encodeURIComponent(token)}`;
    res.redirect(302, ssoCallbackUrl);
  } catch (error) {
    next(error);
  }
}

/** POST /auth/amma-mobile-session — public, rate-limited PKCE code exchange. */
export function ammaMobileSession(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control','no-store');
  try {
    const handoff = consumeMobileHandoff(req.body?.code,req.body?.code_verifier);
    const user = handoff ? queryOne<User & {authorization_version:number}>('SELECT * FROM users WHERE id=?',[handoff.userId]) : null;
    if (!handoff || !user || user.authorization_version !== handoff.authorizationVersion || user.auth_provider !== 'ammawallet') {
      throw new AppError('Sign-in has expired or is invalid. Please sign in with AmmaWallet again.',401,ErrorCodes.INVALID_CREDENTIALS);
    }
    const studentId = queryOne<{id:string}>('SELECT id FROM students WHERE user_id=?',[user.id])?.id;
    const token = generateToken({userId:user.id,email:user.email,role:user.role,roles:getUserRoles(user.id),studentId});
    createSession(user.id,token,req);
    recordLoginHistory(user.id,req,'sso');
    res.json({success:true,data:{token,user:{
      id:user.id,name:user.name,email:user.email,role:user.role,
      walletAddress:user.walletAddress,walletLinkingStatus:user.wallet_linking_status,authProvider:user.auth_provider ?? 'local',
      courseCodes:getUserCourseCodes(user.id),...getAuthorizationContext(user.id),
    }}});
  } catch (error) { next(error); }
}

// Helper function to create a user (for seeding/registration)
export async function createUser(
  name: string,
  email: string,
  password: string,
  role: LegacyRole,
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
