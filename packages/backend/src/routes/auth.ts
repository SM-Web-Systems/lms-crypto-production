import { FastifyInstance } from "fastify";
import { db, schema } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  validateStoredRefreshToken,
  verifyRefreshToken,
} from "../lib/auth";
import { authMiddleware } from "../middleware/auth";
import { auditLog } from "../lib/audit";
import speakeasy from "speakeasy";
import { randomBytes } from "crypto";
import crypto from "crypto";
import { verifyTurnstile } from "../middleware/turnstile";
import { sendVerificationEmail } from "../lib/email";

import { validatePhoneNumber } from "../lib/phone-validation";
import { sendSmsVerification, checkSmsVerification } from "../lib/sms";
import { decryptTotpSecret } from "../lib/totp-crypto";

export async function authRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────
  // REGISTER
  // ──────────────────────────────────────────
  app.post(
    "/api/v1/auth/register",
    {
      preHandler: verifyTurnstile,
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
      schema: {
        tags: ["Auth"],
        description:
          "Register a new user account with email and/or phone number. At least one identifier (email or phoneNumber) is required. Returns JWT tokens and user profile.",
        body: {
          type: "object",
          required: ["password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              description: "User email address",
            },
            password: {
              type: "string",
              minLength: 8,
              description: "Password (min 8 characters)",
            },
            phoneNumber: {
              type: "string",
              pattern: "^\\+[1-9]\\d{6,14}$",
              description: "Phone number in E.164 format (e.g. +14155552671)",
            },
            firstName: { type: "string", description: "First name (optional)" },
            lastName: { type: "string", description: "Last name (optional)" },
            turnstileToken: {
              type: "string",
              description: "Cloudflare Turnstile token",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  email: { type: "string", nullable: true },
                  phoneNumber: { type: "string", nullable: true },
                  firstName: { type: "string", nullable: true },
                  lastName: { type: "string", nullable: true },
                },
              },
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          409: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { email, password, phoneNumber, firstName, lastName } =
        request.body as {
          email?: string;
          password: string;
          phoneNumber?: string;
          firstName?: string;
          lastName?: string;
        };

      // ── Require at least one identifier ──
      if (!email && !phoneNumber) {
        return reply
          .status(400)
          .send({ error: "Email or phone number is required" });
      }

      // ── Validate E.164 phone format if provided ──
      if (phoneNumber && !/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
        return reply.status(400).send({
          error: "Phone number must be in E.164 format (e.g. +14155552671)",
        });
      }

      // ── Check for duplicates ──
      if (email) {
        const [existingByEmail] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, email.toLowerCase().trim()))
          .limit(1);
        if (existingByEmail) {
          return reply.status(409).send({ error: "Email already registered" });
        }
      }

      if (phoneNumber) {
        const [existingByPhone] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.phoneNumber, phoneNumber))
          .limit(1);
        if (existingByPhone) {
          return reply
            .status(409)
            .send({ error: "Phone number already registered" });
        }
      }

      // ── Create user ──
      const passwordHash = await hashPassword(password);

      const [newUser] = await db
        .insert(schema.users)
        .values({
          email: email ? email.toLowerCase().trim() : null,
          phoneNumber: phoneNumber || null,
          passwordHash,
          firstName: firstName || null,
          lastName: lastName || null,
        })
        .returning();

      // ── Generate tokens ──

      const accessToken = generateAccessToken({
        userId: newUser.id,
        email: newUser.email,
      });
      const refreshToken = generateRefreshToken({
        userId: newUser.id,
        email: newUser.email,
      });
      await storeRefreshToken(newUser.id, refreshToken);
      await auditLog("register", {
        userId: newUser.id,
        ip: request.ip,
        detail: {
          email: newUser.email || null,
          phone: newUser.phoneNumber || null,
        },
      });

      // ── Send verification email if email provided ──
      if (email) {
        try {
          const verifyToken = randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
          await db.execute(
            sql`INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (${newUser.id}, ${verifyToken}, ${expiresAt})`,
          );
          await sendVerificationEmail(newUser.email!, verifyToken);
        } catch (err: any) {
          console.error(
            "[register] Failed to send verification email:",
            err.message,
          );
          // Non-fatal — user is still registered
        }
      }

      return reply.send({
        user: {
          id: newUser.id,
          email: newUser.email,
          phoneNumber: newUser.phoneNumber,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        },
        accessToken,
        refreshToken,
      });
    },
  );

  // ──────────────────────────────────────────
  // LOGIN
  // ──────────────────────────────────────────
  app.post(
    "/api/v1/auth/login",
    {
      preHandler: verifyTurnstile,
      config: { rateLimit: { max: 10, timeWindow: "5 minutes" } },
      schema: {
        description:
          "Authenticate with email or phone number. If 2FA is enabled, first call returns twoFaRequired:true, then re-call with twoFaToken.",
        tags: ["Auth"],
        body: {
          type: "object",
          required: ["password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              description: "Login with email",
            },
            phoneNumber: {
              type: "string",
              description:
                "Login with phone number (E.164 format, alternative to email)",
            },
            password: { type: "string" },
            turnstileToken: {
              type: "string",
              description: "Cloudflare Turnstile token",
            },
            twoFaToken: {
              type: "string",
              description:
                "6-digit TOTP/email/static code or 8-char backup code (required if 2FA enabled)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  email: { type: "string", nullable: true },
                  phoneNumber: { type: "string", nullable: true },
                  firstName: { type: "string", nullable: true },
                  lastName: { type: "string", nullable: true },
                  avatar: { type: "string", nullable: true },
                  preferredLanguage: { type: "string" },
                  preferredNetwork: { type: "string" },
                },
              },
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
              twoFaRequired: {
                type: "boolean",
                description: "True if 2FA code is needed",
              },
              twoFaMethod: {
                type: "string",
                enum: ["totp", "email", "static"],
                description: "Which 2FA method is active",
              },
              message: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { email, phoneNumber, password } = request.body as {
        email?: string;
        phoneNumber?: string;
        password: string;
      };

      // ── Require at least one identifier ──
      if (!email && !phoneNumber) {
        return reply
          .status(400)
          .send({ error: "Email or phone number is required" });
      }

      if (!password) {
        return reply.status(400).send({ error: "Password is required" });
      }

      // ── Look up user by email or phone ──
      let user;
      if (email) {
        [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email.toLowerCase().trim()))
          .limit(1);
      } else {
        [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.phoneNumber, phoneNumber!))
          .limit(1);
      }

      if (!user) {
        await auditLog("login_failed", {
          userId: undefined,
          ip: request.ip,
          detail: { identifier: email || phoneNumber },
        });
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Check account lockout
      const MAX_FAILED_ATTEMPTS = 10;
      const LOCKOUT_MINUTES = 30;
      if (
        user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS &&
        user.lastFailedLogin
      ) {
        const lockoutUntil = new Date(
          new Date(user.lastFailedLogin).getTime() +
            LOCKOUT_MINUTES * 60 * 1000,
        );
        if (new Date() < lockoutUntil) {
          await auditLog("login_locked", { userId: user.id, ip: request.ip });
          return reply
            .status(423)
            .send({ error: "Account temporarily locked. Try again later." });
        }
        await db
          .update(schema.users)
          .set({ failedLoginAttempts: 0 })
          .where(eq(schema.users.id, user.id));
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        await db
          .update(schema.users)
          .set({
            failedLoginAttempts: (user.failedLoginAttempts || 0) + 1,
            lastFailedLogin: new Date(),
          })
          .where(eq(schema.users.id, user.id));
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Reset failed attempts on successful login
      if (user.failedLoginAttempts > 0) {
        await db
          .update(schema.users)
          .set({ failedLoginAttempts: 0, lastFailedLogin: null })
          .where(eq(schema.users.id, user.id));
      }

      // ── 2FA check ──
      if (user.twoFaEnabled) {
        const { twoFaToken } = request.body as any;
        const method = user.twoFaMethod || "totp";

        if (!twoFaToken) {
          // For email method, send a code automatically
          if (method === "email" && user.email) {
            const { send2FACode } = await import("../lib/mailer");
            const code = crypto.randomInt(100000, 1000000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            await db.insert(schema.emailCodes).values({
              userId: user.id,
              code,
              type: "login",
              expiresAt,
            });
            await send2FACode(user.email, code);
          }

          return reply.status(200).send({
            twoFaRequired: true,
            twoFaMethod: method,
            message:
              method === "email"
                ? "A verification code has been sent to your email"
                : method === "static"
                  ? "Enter your 6-digit PIN"
                  : "Enter the code from your authenticator app",
          });
        }

        const cleanToken = twoFaToken.replace(/\s/g, "");
        let twoFaValid = false;

        if (
          method === "totp" &&
          cleanToken.length === 6 &&
          /^\d+$/.test(cleanToken)
        ) {
          twoFaValid = speakeasy.totp.verify({
            secret: decryptTotpSecret(user.twoFaSecret!),
            encoding: "base32",
            token: cleanToken,
            window: 2,
          });
        } else if (method === "email") {
          const { and: andOp } = await import("drizzle-orm");
          const [emailCode] = await db
            .select()
            .from(schema.emailCodes)
            .where(
              andOp(
                eq(schema.emailCodes.userId, user.id),
                eq(schema.emailCodes.code, cleanToken),
                eq(schema.emailCodes.type, "login"),
                eq(schema.emailCodes.used, false),
              ),
            )
            .limit(1);
          if (emailCode && new Date(emailCode.expiresAt) > new Date()) {
            twoFaValid = true;
            await db
              .update(schema.emailCodes)
              .set({ used: true })
              .where(eq(schema.emailCodes.id, emailCode.id));
          }
        } else if (
          method === "static" &&
          cleanToken.length === 6 &&
          /^\d+$/.test(cleanToken)
        ) {
          const hashedInput = crypto
            .createHash("sha256")
            .update(cleanToken)
            .digest("hex");
          if (user.twoFaStaticCode === hashedInput) {
            twoFaValid = true;
          }
        }

        // Always allow backup codes as fallback for any method
        if (!twoFaValid && cleanToken.length === 8 && method !== "static") {
          const hashedInput = crypto
            .createHash("sha256")
            .update(cleanToken.toUpperCase())
            .digest("hex");
          const storedCodes: string[] = JSON.parse(
            user.twoFaBackupCodes || "[]",
          );
          const idx = storedCodes.indexOf(hashedInput);
          if (idx !== -1) {
            twoFaValid = true;
            storedCodes.splice(idx, 1);
            await db
              .update(schema.users)
              .set({ twoFaBackupCodes: JSON.stringify(storedCodes) })
              .where(eq(schema.users.id, user.id));
          }
        }

        if (!twoFaValid) {
          return reply.status(401).send({ error: "Invalid 2FA code" });
        }
      }

      // ── Update last login ──
      await db
        .update(schema.users)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.users.id, user.id));

      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
      });
      const refreshToken = generateRefreshToken({
        userId: user.id,
        email: user.email,
      });
      await storeRefreshToken(user.id, refreshToken);

      await auditLog("login", { userId: user.id, ip: request.ip });

      return {
        user: {
          id: user.id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          preferredLanguage: user.preferredLanguage,
          preferredNetwork: user.preferredNetwork,
        },
        accessToken,
        refreshToken,
      };
    },
  );

  // ──────────────────────────────────────────
  // REFRESH TOKEN
  // ──────────────────────────────────────────
  app.post(
    "/api/v1/auth/refresh",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        description:
          "Exchange a refresh token for a new access/refresh token pair. Old refresh token is revoked.",
        tags: ["Auth"],
        body: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: {
              type: "string",
              description: "Current refresh token",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body as { refreshToken: string };

      if (!refreshToken) {
        return reply.status(400).send({ error: "Refresh token required" });
      }

      const valid = await validateStoredRefreshToken(refreshToken);
      if (!valid) {
        return reply.status(401).send({ error: "Invalid refresh token" });
      }

      try {
        const payload = verifyRefreshToken(refreshToken);

        // Revoke old token, issue new pair
        await revokeRefreshToken(refreshToken);

        const newAccessToken = generateAccessToken({
          userId: payload.userId,
          email: payload.email,
        });
        const newRefreshToken = generateRefreshToken({
          userId: payload.userId,
          email: payload.email,
        });
        await storeRefreshToken(payload.userId, newRefreshToken);

        return {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        };
      } catch {
        return reply.status(401).send({ error: "Invalid refresh token" });
      }
    },
  );

  // ──────────────────────────────────────────
  // LOGOUT
  // ──────────────────────────────────────────
  app.post(
    "/api/v1/auth/logout",
    {
      preHandler: authMiddleware,
      schema: {
        description: "Revoke a refresh token, ending the session.",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            refreshToken: { type: "string" },
          },
        },
        response: {
          200: { type: "object", properties: { ok: { type: "boolean" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { refreshToken } = request.body as { refreshToken: string };
      if (refreshToken) {
        await revokeRefreshToken(refreshToken);
      } else {
        // No specific token provided — revoke all user sessions (P0-1-F10)
        await revokeAllUserTokens(userId);
      }
      await auditLog("logout", { userId, ip: request.ip });

      return { ok: true };
    },
  );

  // ──────────────────────────────────────────
  // GET CURRENT USER (protected)
  // ──────────────────────────────────────────
  app.get(
    "/api/v1/auth/me",
    {
      preHandler: authMiddleware,
      schema: {
        description:
          "Get current authenticated user profile with their wallets.",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              email: { type: "string", nullable: true },
              phoneNumber: { type: "string", nullable: true },
              firstName: { type: "string", nullable: true },
              lastName: { type: "string", nullable: true },
              avatar: { type: "string", nullable: true },
              preferredLanguage: { type: "string" },
              preferredNetwork: { type: "string" },
              createdAt: { type: "string", format: "date-time" },
              wallets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "number" },
                    name: { type: "string" },
                    publicKey: { type: "string" },
                    network: { type: "string" },
                    isActive: { type: "boolean" },
                    createdAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const [user] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          phoneNumber: schema.users.phoneNumber,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          avatar: schema.users.avatar,
          preferredLanguage: schema.users.preferredLanguage,
          preferredNetwork: schema.users.preferredNetwork,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Get user's wallets
      const wallets = await db
        .select({
          id: schema.userWallets.id,
          name: schema.userWallets.name,
          publicKey: schema.userWallets.publicKey,
          network: schema.userWallets.network,
          isActive: schema.userWallets.isActive,
          createdAt: schema.userWallets.createdAt,
        })
        .from(schema.userWallets)
        .where(eq(schema.userWallets.userId, userId));

      return { ...user, wallets };
    },
  );

  // ──────────────────────────────────────────
  // UPDATE PROFILE (protected)
  // ──────────────────────────────────────────
  app.patch(
    "/api/v1/auth/profile",
    {
      preHandler: authMiddleware,
      schema: {
        description:
          "Update user profile fields (name, avatar, language, network, phone number).",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            avatar: { type: "string" },
            phoneNumber: {
              type: "string",
              pattern: "^\\+[1-9]\\d{6,14}$",
              description: "Update phone number (E.164 format)",
            },
            preferredLanguage: {
              type: "string",
              enum: ["en", "fr", "es", "pt", "zh"],
            },
            preferredNetwork: { type: "string", enum: ["testnet", "mainnet"] },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "number" },
              email: { type: "string", nullable: true },
              phoneNumber: { type: "string", nullable: true },
              firstName: { type: "string", nullable: true },
              lastName: { type: "string", nullable: true },
              avatar: { type: "string", nullable: true },
              preferredLanguage: { type: "string" },
              preferredNetwork: { type: "string" },
            },
          },
          409: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const {
        firstName,
        lastName,
        avatar,
        phoneNumber,
        preferredLanguage,
        preferredNetwork,
      } = request.body as any;

      const updates: any = { updatedAt: new Date() };
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (avatar !== undefined) updates.avatar = avatar;
      if (preferredLanguage !== undefined)
        updates.preferredLanguage = preferredLanguage;
      if (preferredNetwork !== undefined)
        updates.preferredNetwork = preferredNetwork;

      // ── Phone number update with uniqueness check ──
      if (phoneNumber !== undefined) {
        if (phoneNumber && !/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
          return reply
            .status(400)
            .send({ error: "Phone number must be in E.164 format" });
        }
        if (phoneNumber) {
          const [existing] = await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.phoneNumber, phoneNumber))
            .limit(1);
          if (existing && existing.id !== userId) {
            return reply.status(409).send({
              error: "Phone number already in use by another account",
            });
          }
        }
        updates.phoneNumber = phoneNumber || null;
        updates.phoneVerified = false; // Reset verification when phone changes
      }

      const [updated] = await db
        .update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, userId))
        .returning({
          id: schema.users.id,
          email: schema.users.email,
          phoneNumber: schema.users.phoneNumber,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          avatar: schema.users.avatar,
          preferredLanguage: schema.users.preferredLanguage,
          preferredNetwork: schema.users.preferredNetwork,
        });

      return updated;
    },
  );

  // ──────────────────────────────────────────
  // CHANGE PASSWORD (protected)
  // ──────────────────────────────────────────
  app.post(
    "/api/v1/auth/change-password",
    {
      preHandler: authMiddleware,
      schema: {
        description:
          "Change user password. Revokes all refresh tokens, forcing re-login on all devices.",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string" },
            newPassword: { type: "string", minLength: 8 },
          },
        },
        response: {
          200: { type: "object", properties: { ok: { type: "boolean" } } },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { currentPassword, newPassword } = request.body as {
        currentPassword: string;
        newPassword: string;
      };

      if (!currentPassword || !newPassword || newPassword.length < 8) {
        return reply.status(400).send({ error: "Invalid passwords" });
      }

      const [user] = await db
        .select({ passwordHash: schema.users.passwordHash })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        return reply
          .status(401)
          .send({ error: "Current password is incorrect" });
      }

      const newHash = await hashPassword(newPassword);
      await db
        .update(schema.users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));

      // Revoke all refresh tokens (force re-login everywhere)
      await revokeAllUserTokens(userId);

      await auditLog("password_change", { userId, ip: request.ip });

      return { ok: true };
    },
  );

  // ──────────────────────────────────────────
  // FORGOT PASSWORD
  // ──────────────────────────────────────────
  app.post(
    "/api/v1/auth/forgot-password",
    {
      config: { rateLimit: { max: 3, timeWindow: "15 minutes" } },
      schema: {
        description: "Request a password reset link. Works with email only.",
        tags: ["Auth"],
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };

      if (!email) {
        return reply.status(400).send({ error: "Email is required" });
      }

      // Always return success to prevent email enumeration
      const successResponse = {
        success: true,
        message: "If that email is registered, a reset link has been sent",
      };
      await auditLog("password_reset_request", {
        ip: request.ip,
        detail: { email: email || null },
      });

      const [user] = await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.email, email.toLowerCase().trim()))
        .limit(1);

      if (!user) {
        return successResponse;
      }

      try {
        const resetToken = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
        await db.execute(
          sql`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (${user.id}, ${resetToken}, ${expiresAt})`,
        );

        // Import and send password reset email
        const { sendPasswordResetEmail } = await import("../lib/email");
        await sendPasswordResetEmail(user.email!, resetToken);
      } catch (err: any) {
        console.error("[forgot-password] Error:", err.message);
        // Still return success to prevent enumeration
      }

      return successResponse;
    },
  );

  // ──────────────────────────────────────────
  // RESET PASSWORD
  // ──────────────────────────────────────────
  app.post(
    "/api/v1/auth/reset-password",
    {
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
      schema: {
        description: "Reset password using token from forgot-password email.",
        tags: ["Auth"],
        body: {
          type: "object",
          required: ["token", "newPassword"],
          properties: {
            token: { type: "string", description: "Reset token from email" },
            newPassword: { type: "string", minLength: 8 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { token, newPassword } = request.body as {
        token: string;
        newPassword: string;
      };

      if (!token || !newPassword || newPassword.length < 8) {
        return reply
          .status(400)
          .send({ error: "Valid token and password (min 8 chars) required" });
      }

      try {
        const result = await db.execute(
          sql`SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = ${token} LIMIT 1`,
        );
        const record = (result as any).rows?.[0] || (result as any)[0];

        if (!record) {
          return reply
            .status(400)
            .send({ error: "Invalid or expired reset token" });
        }
        if (record.used_at) {
          return reply
            .status(400)
            .send({ error: "Reset token has already been used" });
        }
        if (new Date(record.expires_at) < new Date()) {
          return reply.status(400).send({ error: "Reset token has expired" });
        }

        const newHash = await hashPassword(newPassword);
        await db
          .update(schema.users)
          .set({ passwordHash: newHash, updatedAt: new Date() })
          .where(eq(schema.users.id, record.user_id));

        // Mark token as used
        await db.execute(
          sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${record.id}`,
        );

        // Revoke all refresh tokens
        await revokeAllUserTokens(record.user_id);

        await auditLog("password_reset", {
          userId: record.user_id,
          ip: request.ip,
        });
        return {
          success: true,
          message: "Password reset successfully. Please log in.",
        };
      } catch (err: any) {
        console.error("[reset-password] Error:", err.message);
        return reply.status(500).send({ error: "Password reset failed" });
      }
    },
  );

  // ──────────────────────────────────────────
  // VERIFY EMAIL
  // ──────────────────────────────────────────
  app.get(
    "/api/v1/auth/verify-email",
    {
      schema: {
        description:
          "Verify email address using token from verification email.",
        tags: ["Auth"],
        querystring: {
          type: "object",
          required: ["token"],
          properties: {
            token: {
              type: "string",
              description: "64-char hex verification token",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query as { token: string };

      if (!token) {
        return reply.status(400).send({ error: "Token is required" });
      }

      try {
        const result = await db.execute(
          sql`SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token = ${token} LIMIT 1`,
        );
        const record = (result as any).rows?.[0] || (result as any)[0];

        if (!record) {
          return reply
            .status(400)
            .send({ error: "Invalid verification token" });
        }

        if (record.used_at) {
          return { success: true, message: "Email already verified" };
        }

        if (new Date(record.expires_at) < new Date()) {
          return reply.status(400).send({
            error: "Verification token has expired. Please request a new one.",
          });
        }

        // Mark email as verified
        await db
          .update(schema.users)
          .set({ isEmailVerified: true })
          .where(eq(schema.users.id, record.user_id));

        // Mark token as used
        await db.execute(
          sql`UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ${record.id}`,
        );

        return { success: true, message: "Email verified successfully!" };
      } catch (err: any) {
        console.error("[verify-email] Error:", err.message);
        return reply.status(500).send({ error: "Verification failed" });
      }
    },
  );

  // ──────────────────────────────────────────
  // RESEND VERIFICATION EMAIL
  // ──────────────────────────────────────────
  app.post(
    "/api/v1/auth/resend-verification",
    {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 3, timeWindow: "15 minutes" } },
      schema: {
        description:
          "Resend email verification link to the authenticated user.",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      const [user] = await db
        .select({
          email: schema.users.email,
          isEmailVerified: schema.users.isEmailVerified,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      if (!user.email) {
        return reply
          .status(400)
          .send({ error: "No email address on this account" });
      }

      if (user.isEmailVerified) {
        return { success: true, message: "Email is already verified" };
      }

      try {
        const verifyToken = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await db.execute(
          sql`INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (${userId}, ${verifyToken}, ${expiresAt})`,
        );
        await sendVerificationEmail(user.email, verifyToken);
        return { success: true, message: "Verification email sent" };
      } catch (err: any) {
        console.error("[resend-verification] Error:", err.message);
        return reply
          .status(500)
          .send({ error: "Failed to send verification email" });
      }
    },
  );

  // ── Phone Verification ─────────────────────────────────────

  app.post(
    "/api/v1/auth/send-phone-code",
    {
      schema: {
        tags: ["Auth"],
        description:
          "Send SMS verification code to authenticated user's phone number. Requires SMS to be enabled.",
        body: {
          type: "object" as const,
          properties: {},
        },
        response: {
          200: {
            type: "object" as const,
            properties: {
              success: { type: "boolean" as const },
              message: { type: "string" as const },
            },
          },
        },
        security: [{ bearerAuth: [] }],
      },
      preHandler: [authMiddleware],
    },
    async (request: any, reply) => {
      const userId = request.user!.userId;
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (!user || !user.phoneNumber) {
        return reply.status(400).send({ error: "No phone number on file" });
      }
      if (user.phoneVerified) {
        return reply.status(400).send({ error: "Phone already verified" });
      }
      const result = await sendSmsVerification(user.phoneNumber);
      if (!result.success) {
        return reply
          .status(503)
          .send({ error: result.error || "SMS service unavailable" });
      }
      return { success: true, message: "Verification code sent" };
    },
  );

  app.post(
    "/api/v1/auth/verify-phone",
    {
      schema: {
        tags: ["Auth"],
        description: "Verify phone number with OTP code received via SMS.",
        body: {
          type: "object" as const,
          required: ["code"] as const,
          properties: {
            code: { type: "string" as const, description: "6-digit OTP code" },
          },
        },
        response: {
          200: {
            type: "object" as const,
            properties: {
              success: { type: "boolean" as const },
              message: { type: "string" as const },
            },
          },
        },
        security: [{ bearerAuth: [] }],
      },
      preHandler: [authMiddleware],
    },
    async (request: any, reply) => {
      const userId = request.user!.userId;
      const body = request.body as { code: string };
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (!user || !user.phoneNumber) {
        return reply.status(400).send({ error: "No phone number on file" });
      }
      if (user.phoneVerified) {
        return reply.status(400).send({ error: "Phone already verified" });
      }
      const result = await checkSmsVerification(user.phoneNumber, body.code);
      if (!result.success) {
        return reply
          .status(400)
          .send({ error: result.error || "Invalid code" });
      }
      await db
        .update(schema.users)
        .set({ phoneVerified: true })
        .where(eq(schema.users.id, userId));
      return { success: true, message: "Phone number verified" };
    },
  );

  app.post(
    "/api/v1/auth/forgot-password-sms",
    {
      config: { rateLimit: { max: 3, timeWindow: "15 minutes" } },
      schema: {
        tags: ["Auth"],
        description:
          "Request password reset via SMS OTP. For users who registered with phone only.",
        body: {
          type: "object" as const,
          required: ["phoneNumber"] as const,
          properties: {
            phoneNumber: {
              type: "string" as const,
              description: "Phone number in E.164 format",
            },
          },
        },
        response: {
          200: {
            type: "object" as const,
            properties: {
              success: { type: "boolean" as const },
              message: { type: "string" as const },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { phoneNumber } = request.body as { phoneNumber: string };
      const pv = validatePhoneNumber(phoneNumber);
      if (!pv.isValid) {
        // Always return success to prevent enumeration
        return {
          success: true,
          message: "If that number is registered, a code has been sent.",
        };
      }
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.phoneNumber, pv.phoneNumber))
        .limit(1);
      if (!user) {
        return {
          success: true,
          message: "If that number is registered, a code has been sent.",
        };
      }
      const result = await sendSmsVerification(pv.phoneNumber);
      if (!result.success) {
        // Still return success to prevent enumeration
        console.error("[auth] SMS forgot-password send failed:", result.error);
      }
      return {
        success: true,
        message: "If that number is registered, a code has been sent.",
      };
    },
  );

  app.post(
    "/api/v1/auth/reset-password-sms",
    {
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
      schema: {
        tags: ["Auth"],
        description:
          "Reset password using SMS OTP code. Phone must be verified first via forgot-password-sms.",
        body: {
          type: "object" as const,
          required: ["phoneNumber", "code", "newPassword"] as const,
          properties: {
            phoneNumber: { type: "string" as const },
            code: {
              type: "string" as const,
              description: "6-digit OTP from SMS",
            },
            newPassword: { type: "string" as const, minLength: 8 },
          },
        },
        response: {
          200: {
            type: "object" as const,
            properties: {
              success: { type: "boolean" as const },
              message: { type: "string" as const },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { phoneNumber, code, newPassword } = request.body as {
        phoneNumber: string;
        code: string;
        newPassword: string;
      };
      const pv = validatePhoneNumber(phoneNumber);
      if (!pv.isValid) {
        return reply.status(400).send({ error: "Invalid phone number" });
      }
      // Verify the OTP code
      const check = await checkSmsVerification(pv.phoneNumber, code);
      if (!check.success) {
        return reply
          .status(400)
          .send({ error: check.error || "Invalid or expired code" });
      }
      // Find user
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.phoneNumber, pv.phoneNumber))
        .limit(1);
      if (!user) {
        return reply.status(400).send({ error: "User not found" });
      }
      // Hash new password
      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await db
        .update(schema.users)
        .set({ passwordHash: hashedPassword })
        .where(eq(schema.users.id, user.id));
      // Revoke all refresh tokens
      await db
        .delete(schema.refreshTokens)
        .where(eq(schema.refreshTokens.userId, user.id));
      // Mark phone as verified (they proved ownership)
      if (!user.phoneVerified) {
        await db
          .update(schema.users)
          .set({ phoneVerified: true })
          .where(eq(schema.users.id, user.id));
      }
      await auditLog("password_reset", {
        userId: user.id,
        ip: request.ip,
        detail: { method: "sms" },
      });
      return {
        success: true,
        message:
          "Password has been reset. Please login with your new password.",
      };
    },
  );
}
