/**
 * Internal admin routes — Phase 3 P2 + Phase 4 P1 + Phase 4 P2 + Phase 4 P5
 *
 * Routes in this file are for AmmaWallet staff only. They are NOT tenant-facing
 * and NOT end-user-facing. All future admin routes should be added here or in a
 * companion file and protected with the verifyInternalAdmin preHandler.
 *
 * Phase 3 P2 scope: admin authentication (login + /me).
 * Phase 4 P1 scope: tenant listing, billing history, and admin credit.
 * Phase 4 P2 scope: tenant suspension and unsuspension.
 * Phase 4 P5 scope: admin management (list, create, deactivate).
 * Phase 4 P6 scope: admin reactivation.
 * Phase 4 P7 scope: tenant billing policy update.
 * Phase 4 P8 scope: admin password reset (super_admin only).
 */

import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, desc, and } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import { verifyInternalAdmin } from "../middleware/admin-auth";
import { getTenantBalanceSummary, writeBillingCredit, getTenantBillingEventsPage } from "../services/billing.service";
import { auditLog } from "../lib/audit";

// Roles permitted to write credits (super_admin and platform_admin)
const CREDIT_ROLES = ["super_admin", "platform_admin"] as const;

export async function adminRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/internal/auth/login
  // ──────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/internal/auth/login",
    {
      config: {
        // Strict rate limit: admin console is low-volume; brute force must be blocked.
        rateLimit: { max: 5, timeWindow: "15 minutes" },
      },
      schema: {
        tags: ["Internal Admin"],
        description:
          "Authenticate an internal admin. Returns a short-lived admin JWT " +
          "(1 hour, no refresh). All failure cases return the same 401 response " +
          "to prevent email enumeration.",
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email:    { type: "string", format: "email" },
            password: { type: "string", minLength: 1 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              token:     { type: "string" },
              expiresIn: { type: "number", description: "Token lifetime in seconds" },
              admin: {
                type: "object",
                properties: {
                  id:    { type: "number" },
                  email: { type: "string" },
                  name:  { type: "string" },
                  role:  { type: "string" },
                },
              },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      // Lookup admin by email
      const [admin] = await db
        .select({
          id:           schema.internalAdmins.id,
          email:        schema.internalAdmins.email,
          name:         schema.internalAdmins.name,
          role:         schema.internalAdmins.role,
          passwordHash: schema.internalAdmins.passwordHash,
          isActive:     schema.internalAdmins.isActive,
        })
        .from(schema.internalAdmins)
        .where(eq(schema.internalAdmins.email, email))
        .limit(1);

      // Unknown email, wrong password, inactive account → all return the same 401.
      // The bcrypt compare is run even when the admin is not found (dummy hash) to
      // avoid timing-based email enumeration attacks.
      const DUMMY_HASH =
        "$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
      const hashToCheck = admin?.passwordHash ?? DUMMY_HASH;
      const passwordOk  = await bcrypt.compare(password, hashToCheck);

      if (!admin || !passwordOk || !admin.isActive) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Issue admin JWT — signed with ADMIN_JWT_SECRET, not JWT_SECRET
      const token = jwt.sign(
        {
          sub:   String(admin.id),
          email: admin.email,
          name:  admin.name,
          role:  admin.role,
          type:  "admin", // defence-in-depth: distinguishes admin tokens from user tokens
        },
        config.ADMIN_JWT_SECRET,
        { expiresIn: config.ADMIN_JWT_EXPIRES_IN },
      );

      // Update last_login_at (fire-and-forget — not correctness-critical)
      db.update(schema.internalAdmins)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.internalAdmins.id, admin.id))
        .catch(() => {});

      return reply.send({
        token,
        expiresIn: config.ADMIN_JWT_EXPIRES_IN,
        admin: {
          id:    admin.id,
          email: admin.email,
          name:  admin.name,
          role:  admin.role,
        },
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/internal/me
  // ──────────────────────────────────────────────────────────────────────────
  // Minimal "who am I" endpoint — verifies admin JWT and returns identity.
  // Used to validate that a token is working and has not been deactivated.
  app.get(
    "/api/v1/internal/me",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Return the authenticated admin's identity. " +
          "Requires Authorization: Bearer <admin_jwt>. " +
          "Useful for validating a token and confirming is_active status.",
        response: {
          200: {
            type: "object",
            properties: {
              id:    { type: "number" },
              email: { type: "string" },
              name:  { type: "string" },
              role:  { type: "string" },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      // verifyInternalAdmin guarantees request.admin is set
      return reply.send(request.admin);
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/internal/tenants — Phase 4 P1
  // ──────────────────────────────────────────────────────────────────────────
  // List all tenants with billing-relevant fields. Any authenticated admin role.
  app.get(
    "/api/v1/internal/tenants",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "List all tenants with billing-relevant overview (balance, active status). " +
          "Any admin role may call this endpoint.",
        response: {
          200: {
            type: "object",
            properties: {
              tenants: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id:                { type: "number" },
                    slug:              { type: "string" },
                    name:              { type: "string" },
                    contactEmail:      { type: ["string", "null"] },
                    prepaidXlmBalance: { type: "string" },
                    isActive:          { type: "boolean" },
                    suspendedAt:       { type: ["string", "null"], format: "date-time" },
                    suspensionReason:  { type: ["string", "null"] },
                  },
                },
              },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (_request, reply) => {
      const tenants = await db
        .select({
          id:                schema.tenants.id,
          slug:              schema.tenants.slug,
          name:              schema.tenants.name,
          contactEmail:      schema.tenants.contactEmail,
          prepaidXlmBalance: schema.tenants.prepaidXlmBalance,
          isActive:          schema.tenants.isActive,
          suspendedAt:       schema.tenants.suspendedAt,
          suspensionReason:  schema.tenants.suspensionReason,
        })
        .from(schema.tenants)
        .orderBy(schema.tenants.id);

      return reply.send({ tenants });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/internal/tenants/:id/billing — Phase 4 P1
  // ──────────────────────────────────────────────────────────────────────────
  // Full billing summary for one tenant. Any authenticated admin role.
  app.get(
    "/api/v1/internal/tenants/:id/billing",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Return the billing summary and 20 most recent events for a tenant. " +
          "Any admin role may call this endpoint.",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: "^[0-9]+$" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              tenantId:              { type: "number" },
              tenantName:            { type: ["string", "null"] },
              tenantSlug:            { type: "string" },
              balance:               { type: "string" },
              isActive:              { type: "boolean" },
              suspendedAt:           { type: ["string", "null"], format: "date-time" },
              suspensionReason:      { type: ["string", "null"] },
              debtLimit:             { type: ["string", "null"] },
              acquisitionModeEnabled:{ type: ["boolean", "null"] },
              gracePeriodDays:       { type: ["number", "null"] },
              recentEvents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id:            { type: "number" },
                    eventType:     { type: "string" },
                    amountXlm:     { type: "string" },
                    billingPeriod: { type: ["string", "null"] },
                    userId:        { type: ["number", "null"] },
                    createdAt:     { type: "string", format: "date-time" },
                    notes:         { type: ["string", "null"] },
                  },
                },
              },
              eventsHasMore:    { type: "boolean" },
              eventsNextCursor: { type: ["number", "null"] },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const tenantId = parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return reply.status(400).send({ error: "Invalid tenant ID" });
      }

      const summary = await getTenantBalanceSummary(tenantId);
      if (!summary) {
        return reply.status(404).send({ error: "Tenant not found" });
      }

      return reply.send(summary);
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/internal/tenants/:id/events — AW-ADMIN-005
  // ──────────────────────────────────────────────────────────────────────────
  // Cursor-paginated billing events for a tenant. Returns up to 20 events with
  // id < beforeId, ordered newest-first. Used by the "Load older" UI control.
  // Any authenticated admin role may call this endpoint.
  app.get(
    "/api/v1/internal/tenants/:id/events",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Return one page of billing events older than beforeId for cursor pagination. " +
          "Any admin role may call this endpoint.",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: "^[0-9]+$" } },
        },
        querystring: {
          type: "object",
          required: ["beforeId"],
          properties: { beforeId: { type: "string", pattern: "^[0-9]+$" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              events: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id:            { type: "number" },
                    eventType:     { type: "string" },
                    amountXlm:     { type: "string" },
                    billingPeriod: { type: ["string", "null"] },
                    userId:        { type: ["number", "null"] },
                    createdAt:     { type: "string", format: "date-time" },
                    notes:         { type: ["string", "null"] },
                  },
                },
              },
              hasMore:    { type: "boolean" },
              nextCursor: { type: ["number", "null"] },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const tenantId = parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return reply.status(400).send({ error: "Invalid tenant ID" });
      }
      const beforeId = parseInt((request.query as { beforeId: string }).beforeId, 10);
      if (!Number.isFinite(beforeId) || beforeId <= 0) {
        return reply.status(400).send({ error: "Invalid beforeId" });
      }
      const page = await getTenantBillingEventsPage(tenantId, beforeId);
      return reply.send(page);
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/internal/tenants/:id/credit — Phase 4 P1
  // ──────────────────────────────────────────────────────────────────────────
  // Post a credit to a tenant's prepaid balance. Restricted to super_admin
  // and platform_admin. Writes are atomic inside a db.transaction().
  app.post(
    "/api/v1/internal/tenants/:id/credit",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Credit a tenant's prepaid XLM balance. Supports manual_topup and bundle_purchase. " +
          "Restricted to super_admin and platform_admin roles. " +
          "All writes are atomic and auditable via billing_events.",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: "^[0-9]+$" } },
        },
        body: {
          type: "object",
          required: ["type", "amount_xlm"],
          properties: {
            type:              { type: "string", enum: ["manual_topup", "bundle_purchase"] },
            amount_xlm:        { type: "number", exclusiveMinimum: 0, maximum: 100000 },
            notes:             { type: "string", maxLength: 500 },
            bundle_slug:       { type: "string", maxLength: 100 },
            payment_reference: { type: "string", maxLength: 200 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              tenantId:        { type: "number" },
              billingEventId:  { type: "number" },
              bundlePurchaseId:{ type: ["number", "null"] },
              newBalance:      { type: "string" },
              amountCredited:  { type: "string" },
              eventType:       { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      // ── Role guard ────────────────────────────────────────────────────────
      if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
        return reply.status(403).send({
          error: "Forbidden: requires super_admin or platform_admin role",
        });
      }

      const tenantId = parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return reply.status(400).send({ error: "Invalid tenant ID" });
      }

      const {
        type,
        amount_xlm,
        notes,
        bundle_slug,
        payment_reference,
      } = request.body as {
        type: "manual_topup" | "bundle_purchase";
        amount_xlm: number;
        notes?: string;
        bundle_slug?: string;
        payment_reference?: string;
      };

      // ── Extra amount guard (belt-and-suspenders beyond Fastify schema) ────
      const parsedAmount = Number(amount_xlm);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return reply.status(400).send({ error: "amount_xlm must be a positive finite number" });
      }

      // ── Verify tenant exists ──────────────────────────────────────────────
      const [tenant] = await db
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);

      if (!tenant) {
        return reply.status(404).send({ error: "Tenant not found" });
      }

      // ── For bundle_purchase: look up the bundle ───────────────────────────
      let bundle: { id: number; slug: string; name: string; approxUsers: number | null } | null = null;
      if (type === "bundle_purchase") {
        if (!bundle_slug) {
          return reply.status(400).send({ error: "bundle_slug is required for bundle_purchase" });
        }
        const [b] = await db
          .select({
            id:         schema.bundleCatalog.id,
            slug:       schema.bundleCatalog.slug,
            name:       schema.bundleCatalog.name,
            approxUsers:schema.bundleCatalog.approxUsers,
          })
          .from(schema.bundleCatalog)
          .where(eq(schema.bundleCatalog.slug, bundle_slug))
          .limit(1);

        if (!b) {
          return reply.status(400).send({ error: `Bundle '${bundle_slug}' not found in catalog` });
        }
        bundle = b;
      }

      // ── Atomic write ──────────────────────────────────────────────────────
      const amountStr  = parsedAmount.toFixed(7);
      const createdBy  = `admin:${request.admin!.id}`;

      const result = await db.transaction(async (tx) => {
        return writeBillingCredit(tx, {
          tenantId,
          eventType:          type,
          amountXlm:          amountStr,
          notes:              notes ?? null,
          createdBy,
          bundleId:           bundle?.id ?? null,
          bundleSlugSnapshot: bundle?.slug ?? null,
          bundleNameSnapshot: bundle?.name ?? null,
          approxUsersSnapshot:bundle?.approxUsers ?? null,
          paymentReference:   payment_reference ?? null,
          recordedBy:         request.admin!.id,
        });
      });

      await auditLog("admin_credit", { userId: request.admin!.id, detail: { tenantId, amountXlm: amountStr, type }, ip: request.ip });

      return reply.send({
        tenantId,
        billingEventId:   result.billingEventId,
        bundlePurchaseId: result.bundlePurchaseId ?? null,
        newBalance:       result.newBalance,
        amountCredited:   amountStr,
        eventType:        type,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /api/v1/internal/tenants/:id/suspend — Phase 4 P2
  // ──────────────────────────────────────────────────────────────────────────
  // Soft-suspend (is_active stays true) or hard-suspend (is_active=false) a
  // tenant. Restricted to super_admin and platform_admin.
  //
  // suspension_reason is always set to 'manual' (hardcoded) because the DB
  // CHECK constraint (chk_suspension_reason) only allows:
  //   'debt_limit' | 'maintenance_grace_expired' | 'manual'
  // Admin-triggered suspensions always use 'manual'.
  app.patch(
    "/api/v1/internal/tenants/:id/suspend",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Suspend a tenant (soft or hard). Soft suspension blocks new activations " +
          "and onboardings while keeping SSO and reads live. Hard suspension blocks " +
          "everything except SSO reads (is_active=false). Restricted to super_admin " +
          "and platform_admin. suspension_reason is always set to 'manual'.",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: "^[0-9]+$" } },
        },
        body: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string", enum: ["soft", "hard"] },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              tenantId:         { type: "number" },
              type:             { type: "string" },
              isActive:         { type: "boolean" },
              suspendedAt:      { type: "string", format: "date-time" },
              suspensionReason: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      // ── Role guard ────────────────────────────────────────────────────────
      if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
        return reply.status(403).send({
          error: "Forbidden: requires super_admin or platform_admin role",
        });
      }

      const tenantId = parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return reply.status(400).send({ error: "Invalid tenant ID" });
      }

      const { type } = request.body as { type: "soft" | "hard" };

      const now = new Date();
      const [updated] = await db
        .update(schema.tenants)
        .set({
          isActive:         type === "hard" ? false : true,
          suspendedAt:      now,
          suspensionReason: "manual",
        })
        .where(eq(schema.tenants.id, tenantId))
        .returning({
          id:               schema.tenants.id,
          isActive:         schema.tenants.isActive,
          suspendedAt:      schema.tenants.suspendedAt,
          suspensionReason: schema.tenants.suspensionReason,
        });

      if (!updated) {
        return reply.status(404).send({ error: "Tenant not found" });
      }

      await auditLog("admin_suspend", { userId: request.admin!.id, detail: { tenantId, type }, ip: request.ip });

      return reply.send({
        tenantId:         updated.id,
        type,
        isActive:         updated.isActive,
        suspendedAt:      updated.suspendedAt,
        suspensionReason: updated.suspensionReason,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/internal/admins — Phase 4 P5
  // ──────────────────────────────────────────────────────────────────────────
  // List all internal admins. Any authenticated admin role. Never returns
  // password_hash.
  app.get(
    "/api/v1/internal/admins",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "List all AmmaWallet staff accounts. Any admin role may call this. " +
          "Password hashes are never included in the response.",
        response: {
          200: {
            type: "object",
            properties: {
              admins: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id:        { type: "number" },
                    email:     { type: "string" },
                    name:      { type: "string" },
                    role:      { type: "string" },
                    isActive:  { type: "boolean" },
                    createdAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (_request, reply) => {
      const admins = await db
        .select({
          id:        schema.internalAdmins.id,
          email:     schema.internalAdmins.email,
          name:      schema.internalAdmins.name,
          role:      schema.internalAdmins.role,
          isActive:  schema.internalAdmins.isActive,
          createdAt: schema.internalAdmins.createdAt,
        })
        .from(schema.internalAdmins)
        .orderBy(schema.internalAdmins.id);

      return reply.send({ admins });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/internal/admins — Phase 4 P5
  // ──────────────────────────────────────────────────────────────────────────
  // Create a new internal admin account. Restricted to super_admin and
  // platform_admin. platform_admin cannot create super_admin accounts
  // (per commercial-admin-design-final.md Section 5.2).
  app.post(
    "/api/v1/internal/admins",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Create a new AmmaWallet staff account. Restricted to super_admin and " +
          "platform_admin. platform_admin may not create super_admin accounts.",
        body: {
          type: "object",
          required: ["email", "name", "role", "password"],
          properties: {
            email:    { type: "string", format: "email" },
            name:     { type: "string", minLength: 1, maxLength: 200 },
            role:     {
              type: "string",
              enum: ["super_admin", "platform_admin", "account_manager", "support_agent"],
            },
            password: { type: "string", minLength: 12, maxLength: 200 },
          },
          additionalProperties: false,
        },
        response: {
          201: {
            type: "object",
            properties: {
              adminId:   { type: "number" },
              email:     { type: "string" },
              name:      { type: "string" },
              role:      { type: "string" },
              isActive:  { type: "boolean" },
              createdAt: { type: "string", format: "date-time" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          409: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      // ── Role guard ────────────────────────────────────────────────────────
      if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
        return reply.status(403).send({
          error: "Forbidden: requires super_admin or platform_admin role",
        });
      }

      const { email, name, role, password } = request.body as {
        email:    string;
        name:     string;
        role:     string;
        password: string;
      };

      // platform_admin cannot create super_admin (Section 5.2)
      if (request.admin!.role === "platform_admin" && role === "super_admin") {
        return reply.status(403).send({
          error: "platform_admin cannot create super_admin accounts",
        });
      }

      // Check email uniqueness
      const [existing] = await db
        .select({ id: schema.internalAdmins.id })
        .from(schema.internalAdmins)
        .where(eq(schema.internalAdmins.email, email))
        .limit(1);

      if (existing) {
        return reply.status(409).send({ error: "Email already in use" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const now = new Date();

      const [created] = await db
        .insert(schema.internalAdmins)
        .values({
          email,
          name,
          role,
          passwordHash,
          isActive:  true,
          createdAt: now,
          updatedAt: now,
          createdBy: request.admin!.id,
        })
        .returning({
          id:        schema.internalAdmins.id,
          email:     schema.internalAdmins.email,
          name:      schema.internalAdmins.name,
          role:      schema.internalAdmins.role,
          isActive:  schema.internalAdmins.isActive,
          createdAt: schema.internalAdmins.createdAt,
        });

      await auditLog("admin_create", { userId: request.admin!.id, detail: { newAdminId: created.id, email, role }, ip: request.ip });

      return reply.status(201).send({
        adminId:   created.id,
        email:     created.email,
        name:      created.name,
        role:      created.role,
        isActive:  created.isActive,
        createdAt: created.createdAt,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /api/v1/internal/admins/:id/deactivate — Phase 4 P5
  // ──────────────────────────────────────────────────────────────────────────
  // Deactivate an internal admin (set is_active = false). The admin loses
  // access immediately on next request (verifyInternalAdmin does a DB lookup
  // on every call). Restricted to super_admin and platform_admin.
  // platform_admin cannot deactivate super_admin accounts.
  app.patch(
    "/api/v1/internal/admins/:id/deactivate",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Deactivate an AmmaWallet staff account. Access is revoked immediately. " +
          "platform_admin cannot deactivate super_admin accounts. " +
          "An admin cannot deactivate their own account.",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: "^[0-9]+$" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              adminId:  { type: "number" },
              email:    { type: "string" },
              role:     { type: "string" },
              isActive: { type: "boolean" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      // ── Role guard ────────────────────────────────────────────────────────
      if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
        return reply.status(403).send({
          error: "Forbidden: requires super_admin or platform_admin role",
        });
      }

      const adminId = parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(adminId) || adminId <= 0) {
        return reply.status(400).send({ error: "Invalid admin ID" });
      }

      // Cannot deactivate yourself
      if (adminId === request.admin!.id) {
        return reply.status(400).send({ error: "Cannot deactivate your own account" });
      }

      // Look up target admin
      const [target] = await db
        .select({
          id:    schema.internalAdmins.id,
          email: schema.internalAdmins.email,
          role:  schema.internalAdmins.role,
        })
        .from(schema.internalAdmins)
        .where(eq(schema.internalAdmins.id, adminId))
        .limit(1);

      if (!target) {
        return reply.status(404).send({ error: "Admin not found" });
      }

      // platform_admin cannot deactivate super_admin (Section 5.2)
      if (request.admin!.role === "platform_admin" && target.role === "super_admin") {
        return reply.status(403).send({
          error: "platform_admin cannot deactivate super_admin accounts",
        });
      }

      await db
        .update(schema.internalAdmins)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.internalAdmins.id, adminId));

      await auditLog("admin_deactivate", { userId: request.admin!.id, detail: { targetAdminId: adminId, email: target.email }, ip: request.ip });

      return reply.send({
        adminId:  target.id,
        email:    target.email,
        role:     target.role,
        isActive: false,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /api/v1/internal/admins/:id/reactivate — Phase 4 P6
  // ──────────────────────────────────────────────────────────────────────────
  // Reactivate a previously deactivated admin (set is_active = true). The admin
  // regains access on their next login attempt. Idempotent — safe to call on an
  // already-active admin. Restricted to super_admin and platform_admin.
  // platform_admin cannot reactivate super_admin accounts (Section 5.2).
  app.patch(
    "/api/v1/internal/admins/:id/reactivate",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Reactivate a previously deactivated AmmaWallet staff account. " +
          "Idempotent — calling on an already-active admin is safe. " +
          "platform_admin cannot reactivate super_admin accounts.",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: "^[0-9]+$" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              adminId:  { type: "number" },
              email:    { type: "string" },
              role:     { type: "string" },
              isActive: { type: "boolean" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      // ── Role guard ────────────────────────────────────────────────────────
      if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
        return reply.status(403).send({
          error: "Forbidden: requires super_admin or platform_admin role",
        });
      }

      const adminId = parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(adminId) || adminId <= 0) {
        return reply.status(400).send({ error: "Invalid admin ID" });
      }

      // Look up target admin
      const [target] = await db
        .select({
          id:       schema.internalAdmins.id,
          email:    schema.internalAdmins.email,
          role:     schema.internalAdmins.role,
          isActive: schema.internalAdmins.isActive,
        })
        .from(schema.internalAdmins)
        .where(eq(schema.internalAdmins.id, adminId))
        .limit(1);

      if (!target) {
        return reply.status(404).send({ error: "Admin not found" });
      }

      // platform_admin cannot reactivate super_admin (Section 5.2)
      if (request.admin!.role === "platform_admin" && target.role === "super_admin") {
        return reply.status(403).send({
          error: "platform_admin cannot reactivate super_admin accounts",
        });
      }

      // Idempotent: already active — return current state without writing
      if (target.isActive) {
        return reply.send({
          adminId:  target.id,
          email:    target.email,
          role:     target.role,
          isActive: true,
        });
      }

      await db
        .update(schema.internalAdmins)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(schema.internalAdmins.id, adminId));

      await auditLog("admin_reactivate", { userId: request.admin!.id, detail: { targetAdminId: adminId, email: target.email }, ip: request.ip });

      return reply.send({
        adminId:  target.id,
        email:    target.email,
        role:     target.role,
        isActive: true,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /api/v1/internal/tenants/:id/unsuspend — Phase 4 P2
  // ──────────────────────────────────────────────────────────────────────────
  // Restore a tenant to full normal operation. Clears is_active, suspended_at,
  // and suspension_reason. Idempotent — no-op if already active.
  // Restricted to super_admin and platform_admin.
  app.patch(
    "/api/v1/internal/tenants/:id/unsuspend",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Restore a tenant to normal operation. Clears suspended_at, " +
          "suspension_reason, and sets is_active=true. Idempotent — calling on " +
          "an already-active tenant is safe and returns 200. Restricted to " +
          "super_admin and platform_admin.",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: "^[0-9]+$" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              tenantId:         { type: "number" },
              isActive:         { type: "boolean" },
              suspendedAt:      { type: ["string", "null"] },
              suspensionReason: { type: ["string", "null"] },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      // ── Role guard ────────────────────────────────────────────────────────
      if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
        return reply.status(403).send({
          error: "Forbidden: requires super_admin or platform_admin role",
        });
      }

      const tenantId = parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return reply.status(400).send({ error: "Invalid tenant ID" });
      }

      const [updated] = await db
        .update(schema.tenants)
        .set({ isActive: true, suspendedAt: null, suspensionReason: null })
        .where(eq(schema.tenants.id, tenantId))
        .returning({
          id:               schema.tenants.id,
          isActive:         schema.tenants.isActive,
          suspendedAt:      schema.tenants.suspendedAt,
          suspensionReason: schema.tenants.suspensionReason,
        });

      if (!updated) {
        return reply.status(404).send({ error: "Tenant not found" });
      }

      await auditLog("admin_unsuspend", { userId: request.admin!.id, detail: { tenantId }, ip: request.ip });

      return reply.send({
        tenantId:         updated.id,
        isActive:         updated.isActive,
        suspendedAt:      updated.suspendedAt ?? null,
        suspensionReason: updated.suspensionReason ?? null,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /api/v1/internal/tenants/:id/billing-policy — Phase 4 P7
  // ──────────────────────────────────────────────────────────────────────────
  // Update the per-tenant billing policy (in-place update of isCurrent=true row).
  // All body fields are optional; at least one must be present.
  // Restricted to super_admin and platform_admin.
  app.patch(
    "/api/v1/internal/tenants/:id/billing-policy",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        tags: ["Internal Admin"],
        description:
          "Update per-tenant billing configuration. " +
          "All fields are optional — only provided fields are updated. " +
          "At least one field must be included. " +
          "Restricted to super_admin and platform_admin.",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: "^[0-9]+$" } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            gracePeriodDays:          { type: "integer", minimum: 1 },
            acquisitionModeEnabled:   { type: "boolean" },
            acquisitionDebtLimitXlm:  { type: "number", maximum: 0 },
            monthlyMaintenanceEnabled:{ type: "boolean" },
            monthlyFeePerActiveUser:  { type: "number", minimum: 0 },
            activityWindowDays:       { type: "integer", minimum: 1 },
            onboardingFeeXlm:         { type: "number", minimum: 0 },
            walletFundingEnabled:     { type: "boolean" },
            walletFundingMode:        { type: "string", enum: ["auto", "manual", "batch"] },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              policyId:                  { type: "number" },
              tenantId:                  { type: "number" },
              gracePeriodDays:           { type: "number" },
              acquisitionModeEnabled:    { type: "boolean" },
              acquisitionDebtLimitXlm:   { type: "string" },
              monthlyMaintenanceEnabled: { type: "boolean" },
              monthlyFeePerActiveUser:   { type: "string" },
              activityWindowDays:        { type: "number" },
              onboardingFeeXlm:          { type: "string" },
              walletFundingEnabled:      { type: "boolean" },
              walletFundingMode:         { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      // ── Role guard ────────────────────────────────────────────────────────
      if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
        return reply.status(403).send({
          error: "Forbidden: requires super_admin or platform_admin role",
        });
      }

      const tenantId = parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return reply.status(400).send({ error: "Invalid tenant ID" });
      }

      // Build the SET object from only the fields present in the request body
      const body = request.body as {
        gracePeriodDays?:          number;
        acquisitionModeEnabled?:   boolean;
        acquisitionDebtLimitXlm?:  number;
        monthlyMaintenanceEnabled?:boolean;
        monthlyFeePerActiveUser?:  number;
        activityWindowDays?:       number;
        onboardingFeeXlm?:         number;
        walletFundingEnabled?:     boolean;
        walletFundingMode?:        string;
      };

      const updates: Record<string, unknown> = {};
      if (body.gracePeriodDays          !== undefined) updates.gracePeriodDays          = body.gracePeriodDays;
      if (body.acquisitionModeEnabled   !== undefined) updates.acquisitionModeEnabled   = body.acquisitionModeEnabled;
      if (body.acquisitionDebtLimitXlm  !== undefined) updates.acquisitionDebtLimitXlm  = body.acquisitionDebtLimitXlm.toString();
      if (body.monthlyMaintenanceEnabled !== undefined) updates.monthlyMaintenanceEnabled = body.monthlyMaintenanceEnabled;
      if (body.monthlyFeePerActiveUser  !== undefined) updates.monthlyFeePerActiveUser  = body.monthlyFeePerActiveUser.toString();
      if (body.activityWindowDays       !== undefined) updates.activityWindowDays       = body.activityWindowDays;
      if (body.onboardingFeeXlm         !== undefined) updates.onboardingFeeXlm         = body.onboardingFeeXlm.toString();
      if (body.walletFundingEnabled     !== undefined) updates.walletFundingEnabled     = body.walletFundingEnabled;
      if (body.walletFundingMode        !== undefined) updates.walletFundingMode        = body.walletFundingMode;

      // Fastify's minProperties:1 schema guard handles empty-body case,
      // but belt-and-suspenders in case schema validation is bypassed in tests:
      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: "No updatable fields provided" });
      }

      const [updated] = await db
        .update(schema.tenantBillingPolicy)
        .set(updates)
        .where(
          and(
            eq(schema.tenantBillingPolicy.tenantId, tenantId),
            eq(schema.tenantBillingPolicy.isCurrent, true),
          ),
        )
        .returning({
          id:                       schema.tenantBillingPolicy.id,
          tenantId:                 schema.tenantBillingPolicy.tenantId,
          gracePeriodDays:          schema.tenantBillingPolicy.gracePeriodDays,
          acquisitionModeEnabled:   schema.tenantBillingPolicy.acquisitionModeEnabled,
          acquisitionDebtLimitXlm:  schema.tenantBillingPolicy.acquisitionDebtLimitXlm,
          monthlyMaintenanceEnabled:schema.tenantBillingPolicy.monthlyMaintenanceEnabled,
          monthlyFeePerActiveUser:  schema.tenantBillingPolicy.monthlyFeePerActiveUser,
          activityWindowDays:       schema.tenantBillingPolicy.activityWindowDays,
          onboardingFeeXlm:         schema.tenantBillingPolicy.onboardingFeeXlm,
          walletFundingEnabled:     schema.tenantBillingPolicy.walletFundingEnabled,
          walletFundingMode:        schema.tenantBillingPolicy.walletFundingMode,
        });

      if (!updated) {
        return reply.status(404).send({ error: "Tenant billing policy not found" });
      }

      await auditLog("admin_billing_policy", { userId: request.admin!.id, detail: { tenantId, fields: Object.keys(updates) }, ip: request.ip });

      return reply.send({
        policyId:                  updated.id,
        tenantId:                  updated.tenantId,
        gracePeriodDays:           updated.gracePeriodDays,
        acquisitionModeEnabled:    updated.acquisitionModeEnabled,
        acquisitionDebtLimitXlm:   updated.acquisitionDebtLimitXlm,
        monthlyMaintenanceEnabled: updated.monthlyMaintenanceEnabled,
        monthlyFeePerActiveUser:   updated.monthlyFeePerActiveUser,
        activityWindowDays:        updated.activityWindowDays,
        onboardingFeeXlm:          updated.onboardingFeeXlm,
        walletFundingEnabled:      updated.walletFundingEnabled,
        walletFundingMode:         updated.walletFundingMode,
      });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/internal/admins/:id/reset-password — Phase 4 P8
  // ──────────────────────────────────────────────────────────────────────────
  // super_admin only. Cannot reset own password. bcrypt cost 12.
  // Returns { adminId, email, role } — passwordHash never in response.
  // ──────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/internal/admins/:id/reset-password",
    {
      preHandler: verifyInternalAdmin,
      schema: {
        body: {
          type: "object",
          required: ["newPassword"],
          additionalProperties: false,
          properties: {
            newPassword: { type: "string", minLength: 12 },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.admin!.role !== "super_admin") {
        return reply.status(403).send({
          error: "Forbidden: requires super_admin role",
        });
      }

      const adminId = parseInt((request.params as { id: string }).id, 10);
      if (!Number.isFinite(adminId) || adminId <= 0) {
        return reply.status(400).send({ error: "Invalid admin ID" });
      }

      if (adminId === request.admin!.id) {
        return reply.status(403).send({
          error: "Cannot reset your own password via this route",
        });
      }

      const [target] = await db
        .select({
          id:    schema.internalAdmins.id,
          email: schema.internalAdmins.email,
          role:  schema.internalAdmins.role,
        })
        .from(schema.internalAdmins)
        .where(eq(schema.internalAdmins.id, adminId))
        .limit(1);

      if (!target) {
        return reply.status(404).send({ error: "Admin not found" });
      }

      const { newPassword } = request.body as { newPassword: string };
      const passwordHash = await bcrypt.hash(newPassword, 12);

      await db
        .update(schema.internalAdmins)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(schema.internalAdmins.id, adminId));

      await auditLog("admin_reset_password", { userId: request.admin!.id, detail: { targetAdminId: adminId, email: target.email }, ip: request.ip });

      return reply.send({
        adminId: target.id,
        email:   target.email,
        role:    target.role,
      });
    },
  );
}
