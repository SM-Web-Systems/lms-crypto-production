/**
 * Admin authentication middleware — Phase 3 Priority 2
 *
 * verifyInternalAdmin: Fastify preHandler that authenticates internal staff.
 *
 * Security properties:
 *   - Uses ADMIN_JWT_SECRET (separate from JWT_SECRET — user tokens are rejected)
 *   - Requires payload.type === "admin" (defence-in-depth against token confusion)
 *   - Confirms is_active in DB on every request (deactivation takes effect immediately)
 *   - All failures return the same 401 (no information leakage)
 *
 * This middleware is the building block for all future admin-only routes.
 * It does NOT handle authorization (role checks) — those are done by individual routes.
 */

import { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminContext {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface AdminJwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  type: string;
  iat?: number;
  exp?: number;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by verifyInternalAdmin preHandler. Undefined on non-admin routes. */
    admin?: AdminContext;
  }
}

// ── Middleware ─────────────────────────────────────────────────────────────────

/**
 * preHandler: Authenticate an internal admin request.
 *
 * Expects: Authorization: Bearer <admin_jwt>
 *
 * On success: attaches request.admin = { id, email, name, role }
 * On any failure: returns 401 { error: "Unauthorized" }
 *   (same message for all failure modes — no information leakage)
 */
export async function verifyInternalAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  let payload: AdminJwtPayload;
  try {
    payload = jwt.verify(token, config.ADMIN_JWT_SECRET) as AdminJwtPayload;
  } catch {
    // Expired, malformed, or wrong secret
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // Defence-in-depth: ensure this token is specifically an admin token.
  // User JWTs do not carry type:"admin" and use a different secret, so
  // this check is redundant but adds a clear explicit guard.
  if (payload.type !== "admin") {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const adminId = parseInt(payload.sub, 10);
  if (!Number.isFinite(adminId)) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  // DB lookup: verify admin still exists and is active.
  // This check intentionally runs on every request so deactivated admins
  // lose access within the current request cycle, not at token expiry.
  const [admin] = await db
    .select({
      id:       schema.internalAdmins.id,
      email:    schema.internalAdmins.email,
      name:     schema.internalAdmins.name,
      role:     schema.internalAdmins.role,
      isActive: schema.internalAdmins.isActive,
    })
    .from(schema.internalAdmins)
    .where(eq(schema.internalAdmins.id, adminId))
    .limit(1);

  if (!admin || !admin.isActive) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  request.admin = {
    id:    admin.id,
    email: admin.email,
    name:  admin.name,
    role:  admin.role,
  };
}
