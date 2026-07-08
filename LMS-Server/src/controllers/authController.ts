import { Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { v4 as uuidv4 } from "uuid";
import { query, queryOne, execute } from "../config/database.js";
import { generateToken } from "../config/jwt.js";
import { AuthRequest, User, ErrorCodes, Student } from "../types/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { createUserWallet, getUserNfts, type GetNFTResponse } from "../services/walletService.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const AMMA_WALLET_URL = process.env.DATABASE_URL || "http://localhost:3001/";

interface LoginAmmaResponse {
  user: {
    id: 0,
    email: string,
    phoneNumber: string,
    firstName: string,
    lastName: string,
    avatar: string,
    preferredLanguage: string,
    preferredNetwork: string
  },
  accessToken: string,
  refreshToken: string,
  twoFaRequired: boolean,
  twoFaMethod: string,
  message: string
}


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

    // Reject accounts without a usable password (e.g. legacy SSO-only rows)
    if (!user.password_hash) {
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

    // Auto-promote listed admin emails so the role stays in sync on each login.
    let role = user.role;
    if (role !== "admin" && isAdminEmail(user.email)) {
      execute(
        "UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE id = ?",
        [user.id],
      );
      role = "admin";
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

    // LOG IN TO AMMA WALLET AS WELL
    const loginRes = await fetch(`${AMMA_WALLET_URL}api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        phoneNumber: "",
        password: password,
        turnstileToken: "",
        twoFaToken: ""
      }),
    });

    if (!loginRes.ok) {
      throw new Error(`Amma login failed (${loginRes.status})`);
    }

    const result = (await loginRes.json())as LoginAmmaResponse;

    const accessToken = result.accessToken;
    console.log("Amma Wallet Access Token:", accessToken);

    let userNfts: GetNFTResponse | undefined;

    userNfts = await getUserNfts(user.walletAddress);

    console.log("User NFTs:", userNfts.indexed.tokens);

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
          courseCodes: getUserCourseCodes(user.id),
        },
        usernfts: userNfts,
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

    const role: "student" | "admin" = isAdminEmail(email) ? "admin" : "student";
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const walletAddress = await createUserWallet(email, password);

    execute(
      "INSERT INTO users (id, name, email, password_hash, role, walletAddress) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, name, email, passwordHash, role, walletAddress],
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
          courseCodes: getUserCourseCodes(userId),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function googleLogin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_token } = req.body;
    if (!id_token) {
      throw new AppError(
        "id_token is required",
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new AppError(
        "Google sign-in is not configured",
        500,
        ErrorCodes.INTERNAL_ERROR,
      );
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new AppError(
        "Invalid Google token",
        401,
        ErrorCodes.INVALID_CREDENTIALS,
      );
    }

    const email = payload.email.toLowerCase();
    const name = (payload.name || payload.email.split("@")[0] || "User").trim();

    let user = queryOne<User>("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
      const id = uuidv4();
      execute(
        "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
        [id, name, email, "", "student"],
      );
      user = queryOne<User>("SELECT * FROM users WHERE id = ?", [id]);
    }

    if (!user) {
      throw new AppError(
        "Could not find or create user",
        500,
        ErrorCodes.INTERNAL_ERROR,
      );
    }

    let studentId: string | undefined;
    if (user.role === "student") {
      const student = queryOne<Student>(
        "SELECT id FROM students WHERE user_id = ?",
        [user.id],
      );
      studentId = student?.id;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
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
          role: user.role,
          courseCodes: getUserCourseCodes(user.id),
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
      "SELECT id, name, email, role, walletAddress FROM users WHERE id = ?",
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
        courseCodes: getUserCourseCodes(user.id),
      },
    });
  } catch (error) {
    next(error);
  }
}

// Helper function to create a user (for seeding/registration)
export async function createUser(
  name: string,
  email: string,
  password: string,
  role: "student" | "admin",
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
