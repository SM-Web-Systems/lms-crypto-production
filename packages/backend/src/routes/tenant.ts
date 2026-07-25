/**
 * Tenant-facing API routes (authenticated via tenant API key).
 *
 * Phase 2: GET /api/v1/tenant/balance
 *   Returns the current balance state, debt limit, and the 20 most recent
 *   billing events for the requesting tenant.
 *   Does NOT expose other tenants' data or platform internals.
 */

import { FastifyInstance } from "fastify";
import { requireTenantApiKey, requireScope } from "../middleware/tenant-api-key";
import { getTenantBalanceSummary } from "../services/billing.service";

export async function tenantRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/v1/tenant/balance
  // ──────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/v1/tenant/balance",
    {
      preHandler: [requireTenantApiKey, requireScope("funding:read")],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["Tenant"],
        description:
          "Return the current XLM balance and billing summary for the authenticated tenant. " +
          "Requires x-api-key header with a DB-backed tenant API key with funding:read scope.",
        security: [{ apiKey: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              tenantId: { type: "number" },
              balance: { type: "string", description: "Current prepaid XLM balance (may be negative)" },
              isActive: { type: "boolean" },
              suspendedAt: { type: ["string", "null"], format: "date-time" },
              suspensionReason: { type: ["string", "null"] },
              debtLimit: { type: ["string", "null"], description: "Acquisition debt limit (negative XLM)" },
              acquisitionModeEnabled: { type: ["boolean", "null"] },
              gracePeriodDays: { type: ["number", "null"] },
              recentEvents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "number" },
                    eventType: { type: "string" },
                    amountXlm: { type: "string" },
                    billingPeriod: { type: ["string", "null"] },
                    userId: { type: ["number", "null"] },
                    createdAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const ctx = request.tenantApiKeyContext!;

      // requireTenantApiKey guarantees ctx is set; but env-var keys have no tenantId
      if (!ctx.tenantId) {
        return reply.status(403).send({
          error: "Balance endpoint requires a tenant API key (not a legacy env-var key)",
        });
      }

      const summary = await getTenantBalanceSummary(ctx.tenantId);

      if (!summary) {
        return reply.status(404).send({ error: "Tenant not found" });
      }

      return summary;
    },
  );
}
