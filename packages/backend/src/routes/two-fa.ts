import { FastifyInstance } from "fastify";
import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import crypto from "crypto";
import { send2FACode } from "../lib/mailer";
import { encryptTotpSecret, decryptTotpSecret } from "../lib/totp-crypto";
import { timingSafeCompare } from "../lib/timing-safe";

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  return codes;
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
}

function generateEmailCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function twoFaRoutes(app: FastifyInstance) {
  // ── GET STATUS ──
  app.get("/api/v1/auth/2fa/status", {
      preHandler: authMiddleware,
      schema: {
        description: "Get 2FA status for the authenticated user.",
        tags: ["2FA"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              method: { type: "string", enum: ["none", "totp", "email", "static"] },
            },
          },
        },
      },
    }, async (request) => {
    const userId = request.user!.userId;
    const [user] = await db
      .select({
        twoFaEnabled: schema.users.twoFaEnabled,
        twoFaMethod: schema.users.twoFaMethod,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    return {
      enabled: user?.twoFaEnabled || false,
      method: user?.twoFaMethod || "none",
    };
  });

  // ── SETUP TOTP (Authenticator App) ──
  app.post("/api/v1/auth/2fa/setup", {
      preHandler: authMiddleware,
      schema: {
        description: "Initiate 2FA setup. Choose method: totp (authenticator app), email (code via email), or static (user-chosen 6-digit PIN). Returns setup data to verify.",
        tags: ["2FA"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            method: { type: "string", enum: ["totp", "email", "static"], default: "totp" },
            staticCode: { type: "string", description: "Required for static method — your chosen 6-digit PIN", pattern: "^\\d{6}$" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              method: { type: "string" },
              secret: { type: "string", description: "TOTP base32 secret (totp only)" },
              qrCode: { type: "string", description: "QR code data URL (totp only)" },
              otpauthUrl: { type: "string", description: "otpauth:// URL (totp only)" },
              message: { type: "string", description: "Status message (email/static)" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const userId = request.user!.userId;
    const { method } = (request.body as any) || {};
    const chosenMethod = method || "totp";

    const [user] = await db
      .select({
        email: schema.users.email,
        twoFaEnabled: schema.users.twoFaEnabled,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (user?.twoFaEnabled) {
      return reply.status(400).send({ error: "2FA is already enabled. Disable it first." });
    }

    if (chosenMethod === "totp") {
      const secret = speakeasy.generateSecret({
        name: `AmmaWallet (${user!.email})`,
        issuer: "AmmaWallet",
        length: 20,
      });

      await db.update(schema.users).set({
        twoFaSecret: encryptTotpSecret(secret.base32),
        twoFaMethod: "totp",
        twoFaEnabled: false,
      }).where(eq(schema.users.id, userId));

      const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);

      return {
        method: "totp",
        secret: secret.base32,
        qrCode: qrCodeDataUrl,
        otpauthUrl: secret.otpauth_url,
      };
    }

    if (chosenMethod === "email") {
      await db.update(schema.users).set({
        twoFaMethod: "email",
        twoFaEnabled: false,
      }).where(eq(schema.users.id, userId));

      // Send a test code
      const code = generateEmailCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(schema.emailCodes).values({
        userId,
        code,
        type: "2fa-setup",
        expiresAt,
      });

      const sent = await send2FACode(user!.email, code);
      if (!sent) {
        return reply.status(500).send({ error: "Failed to send verification email. Check SMTP settings." });
      }

      return {
        method: "email",
        message: `Verification code sent to ${user!.email}`,
      };
    }

    if (chosenMethod === "static") {
      const { staticCode } = (request.body as any) || {};

      if (!staticCode || staticCode.length !== 6 || !/^\d{6}$/.test(staticCode)) {
        return reply.status(400).send({ error: "Please provide a 6-digit code" });
      }

      const hashedCode = hashCode(staticCode);

      await db.update(schema.users).set({
        twoFaMethod: "static",
        twoFaEnabled: false,
        twoFaStaticCode: hashedCode,
      }).where(eq(schema.users.id, userId));

      return {
        method: "static",
        message: "Now verify your code to enable 2FA.",
      };
    }

    return reply.status(400).send({ error: "Invalid method. Choose: totp, email, or static" });
  });

  // ── VERIFY (confirm TOTP or email setup) ──
  app.post("/api/v1/auth/2fa/verify", {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
      schema: {
        description: "Verify the 2FA setup by providing a valid code. Enables 2FA and returns backup codes.",
        tags: ["2FA"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", description: "6-digit verification code from authenticator/email/static PIN" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              backupCodes: { type: "array", items: { type: "string" }, description: "10 one-time backup codes — save securely" },
              message: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const userId = request.user!.userId;
    const { token } = request.body as { token: string };

    if (!token) {
      return reply.status(400).send({ error: "Verification code is required" });
    }

    const [user] = await db
      .select({
        twoFaSecret: schema.users.twoFaSecret,
        twoFaEnabled: schema.users.twoFaEnabled,
        twoFaMethod: schema.users.twoFaMethod,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (user?.twoFaEnabled) {
      return reply.status(400).send({ error: "2FA is already enabled." });
    }

    let verified = false;

    if (user?.twoFaMethod === "totp") {
      if (!user.twoFaSecret) {
        return reply.status(400).send({ error: "TOTP setup not initiated." });
      }
      verified = speakeasy.totp.verify({
        secret: decryptTotpSecret(user.twoFaSecret),
        encoding: "base32",
        token: token.replace(/\s/g, ""),
        window: 2,
      });
    } else if (user?.twoFaMethod === "static") {
      const hashedInput = hashCode(token.replace(/\s/g, ""));
      const [userData] = await db
        .select({ twoFaStaticCode: schema.users.twoFaStaticCode })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (userData?.twoFaStaticCode && timingSafeCompare(userData.twoFaStaticCode, hashedInput)) {
        verified = true;
      }
    } else if (user?.twoFaMethod === "email") {
      const [emailCode] = await db
        .select()
        .from(schema.emailCodes)
        .where(
          and(
            eq(schema.emailCodes.userId, userId),
            eq(schema.emailCodes.code, token.replace(/\s/g, "")),
            eq(schema.emailCodes.type, "2fa-setup"),
            eq(schema.emailCodes.used, false)
          )
        )
        .limit(1);

      if (emailCode && new Date(emailCode.expiresAt) > new Date()) {
        verified = true;
        await db.update(schema.emailCodes)
          .set({ used: true })
          .where(eq(schema.emailCodes.id, emailCode.id));
      }
    }

    if (!verified) {
      return reply.status(400).send({ error: "Invalid verification code." });
    }

    // Generate backup codes for TOTP and email methods
    const backupCodes = generateBackupCodes();
    const hashedCodes = backupCodes.map(hashCode);

    await db.update(schema.users).set({
      twoFaEnabled: true,
      twoFaBackupCodes: JSON.stringify(hashedCodes),
      updatedAt: new Date(),
    }).where(eq(schema.users.id, userId));

    return {
      success: true,
      backupCodes,
      message: "2FA enabled successfully. Save your backup codes securely.",
    };
  });

  // ── SEND EMAIL CODE (for login, called by login route) ──
  app.post("/api/v1/auth/2fa/send-email-code", {
      schema: {
        description: "Send a 2FA email code for login (public endpoint). Always returns success to prevent user enumeration.",
        tags: ["2FA"],
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
    }, async (request, reply) => {
    const { email } = request.body as { email: string };
    if (!email) return reply.status(400).send({ error: "Email required" });

    const [user] = await db
      .select({ id: schema.users.id, email: schema.users.email, twoFaEnabled: schema.users.twoFaEnabled, twoFaMethod: schema.users.twoFaMethod })
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user || !user.twoFaEnabled || user.twoFaMethod !== "email") {
      // Don't reveal whether user exists
      return { success: true, message: "If an account exists with email 2FA, a code was sent." };
    }

    const code = generateEmailCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(schema.emailCodes).values({
      userId: user.id,
      code,
      type: "login",
      expiresAt,
    });

    await send2FACode(user.email, code);
    return { success: true, message: "If an account exists with email 2FA, a code was sent." };
  });


  // ── SEND EMAIL CODE (authenticated — for disable flow) ──
  app.post("/api/v1/auth/2fa/send-code", {
      preHandler: authMiddleware,
      schema: {
        description: "Send a 2FA verification code to the authenticated user\'s email (for disable flow).",
        tags: ["2FA"],
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
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const userId = request.user!.userId;

    const [user] = await db
      .select({ email: schema.users.email, twoFaEnabled: schema.users.twoFaEnabled, twoFaMethod: schema.users.twoFaMethod })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user || !user.twoFaEnabled || user.twoFaMethod !== "email") {
      return reply.status(400).send({ error: "Email 2FA is not enabled" });
    }

    const code = generateEmailCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(schema.emailCodes).values({
      userId,
      code,
      type: "login",
      expiresAt,
    });

    const sent = await send2FACode(user.email, code);
    if (!sent) {
      return reply.status(500).send({ error: "Failed to send email" });
    }

    return { success: true, message: "Code sent to your email" };
  });

  // ── DISABLE 2FA ──
  app.post("/api/v1/auth/2fa/disable", {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
      schema: {
        description: "Disable 2FA. Requires password and a valid 2FA code (TOTP/email/static) or backup code.",
        tags: ["2FA"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["password", "token"],
          properties: {
            password: { type: "string", description: "Account password" },
            token: { type: "string", description: "Current 2FA code or 8-char backup code" },
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
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const userId = request.user!.userId;
    const { token, password } = request.body as { token: string; password: string };

    if (!password) {
      return reply.status(400).send({ error: "Password is required to disable 2FA" });
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!user?.twoFaEnabled) {
      return reply.status(400).send({ error: "2FA is not enabled" });
    }

    const { verifyPassword } = await import("../lib/auth");
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({ error: "Invalid password" });
    }

    const cleanToken = token?.replace(/\s/g, "") || "";
    let verified = false;

    if (user.twoFaMethod === "totp") {
      if (cleanToken.length === 6 && /^\d+$/.test(cleanToken)) {
        verified = speakeasy.totp.verify({
          secret: decryptTotpSecret(user.twoFaSecret!),
          encoding: "base32",
          token: cleanToken,
          window: 2,
        });
      }
    } else if (user.twoFaMethod === "static") {
      if (cleanToken.length === 6 && /^\d+$/.test(cleanToken)) {
        const hashedInput = hashCode(cleanToken);
        if (user.twoFaStaticCode && timingSafeCompare(user.twoFaStaticCode, hashedInput)) {
          verified = true;
        }
      }
    } else if (user.twoFaMethod === "email") {
      const [emailCode] = await db.select().from(schema.emailCodes)
        .where(and(
          eq(schema.emailCodes.userId, userId),
          eq(schema.emailCodes.code, cleanToken),
          eq(schema.emailCodes.type, "login"),
          eq(schema.emailCodes.used, false)
        )).limit(1);
      if (emailCode && new Date(emailCode.expiresAt) > new Date()) {
        verified = true;
        await db.update(schema.emailCodes).set({ used: true }).where(eq(schema.emailCodes.id, emailCode.id));
      }
    }

    // Always allow backup codes
    if (!verified && cleanToken.length === 8) {
      const hashedInput = hashCode(cleanToken);
      const storedCodes: string[] = JSON.parse(user.twoFaBackupCodes || "[]");
      const idx = storedCodes.findIndex((c: string) => timingSafeCompare(c, hashedInput));
      if (idx !== -1) {
        verified = true;
        storedCodes.splice(idx, 1);
        await db.update(schema.users).set({ twoFaBackupCodes: JSON.stringify(storedCodes) }).where(eq(schema.users.id, userId));
      }
    }

    if (!verified) {
      return reply.status(400).send({ error: "Invalid 2FA code or backup code" });
    }

    await db.update(schema.users).set({
      twoFaEnabled: false,
      twoFaSecret: null,
      twoFaMethod: "none",
      twoFaBackupCodes: null,
      twoFaStaticCode: null,
      updatedAt: new Date(),
    }).where(eq(schema.users.id, userId));

    return { success: true, message: "2FA has been disabled" };
  });
}
