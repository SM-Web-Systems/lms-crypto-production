/**
 * Phase 1 — Tenant API key middleware
 * Phase 3 — Per-key rate limiting and scope enforcement
 *
 * Resolves an incoming x-api-key header against:
 *   1. tenant_api_keys table (SHA-256 hash lookup) — DB path, sets tenantId
 *   2. API_KEYS env var (legacy bridge) — env path, tenantId = null
 *
 * DB errors fall through to the env var check so the legacy bridge stays
 * available even when the DB is temporarily unavailable. The LMS API key
 * (`amma_de5d90...`) is intentionally kept in API_KEYS as a DB-outage guard.
 *
 * Phase 3 additions:
 *   - Per-DB-key rate limiting via in-memory sliding window
 *   - requireScope(scope) preHandler factory for DB-backed key scope enforcement
 *   - Env-var keys are exempt from both rate-limit and scope enforcement
 *     (they use the global Fastify rate limiter and have no scopes by design)
 */

import crypto from "crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config";
import { db, schema } from "../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantApiKeyContext {
  /** "db" when resolved from tenant_api_keys table; "env" for legacy env var keys. */
  source: "db" | "env";
  /** Tenant that owns this key. null for legacy env var keys (no tenant context yet). */
  tenantId: number | null;
  /** tenant_api_keys.id — null for env var keys. */
  keyId: number | null;
  /** Scopes granted by this key. Empty array for env var keys. */
  scopes: string[];
  /** Per-key rate limit from DB. 60 for env var keys (matches global rate limiter). */
  rateLimitPerMinute: number;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by requireTenantApiKey or attachTenantApiKey preHandlers. */
    tenantApiKeyContext?: TenantApiKeyContext;
  }
}

// ── Per-key rate limit store ──────────────────────────────────────────────────

interface RateLimitWindow {
  count: number;
  windowStart: number;
}

/**
 * In-memory per-key rate limit windows.
 * Keyed by tenant_api_keys.id (DB-backed keys only).
 * Not shared across processes — for single-instance deployments.
 */
const rateLimitWindows = new Map<number, RateLimitWindow>();

/**
 * Check and increment the rate limit counter for a given DB key.
 * Returns true if the request is allowed, false if the rate limit is exceeded.
 *
 * Uses a 60-second sliding window. Window resets on the first request after
 * 60 seconds have elapsed since window start.
 *
 * Exported for unit testing only — do not call from application code.
 */
export function checkAndCountRateLimit(
  keyId: number,
  limitPerMinute: number,
): boolean {
  const now = Date.now();
  const window = rateLimitWindows.get(keyId);

  if (!window || now - window.windowStart >= 60_000) {
    // Start a new window
    rateLimitWindows.set(keyId, { count: 1, windowStart: now });
    return true;
  }

  if (window.count >= limitPerMinute) {
    return false; // rate limited
  }

  window.count++;
  return true;
}

/**
 * Clear all rate limit windows. FOR TESTING ONLY.
 * Do not call from application code.
 */
export function _clearRateLimitWindowsForTest(): void {
  rateLimitWindows.clear();
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/** SHA-256 hex digest of a raw API key. This is what's stored in tenant_api_keys.key_hash. */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Resolve a raw API key to its access context.
 *
 * Returns undefined if the key is absent, unknown, inactive, or expired.
 */
export async function resolveTenantApiKey(
  rawKey: string | undefined,
): Promise<TenantApiKeyContext | undefined> {
  if (!rawKey) return undefined;

  const keyHash = hashApiKey(rawKey);
  const now = new Date();

  // ── 1. DB lookup ────────────────────────────────────────────────────────────
  try {
    const [row] = await db
      .select({
        id: schema.tenantApiKeys.id,
        tenantId: schema.tenantApiKeys.tenantId,
        scopes: schema.tenantApiKeys.scopes,
        rateLimitPerMinute: schema.tenantApiKeys.rateLimitPerMinute,
      })
      .from(schema.tenantApiKeys)
      .where(
        and(
          eq(schema.tenantApiKeys.keyHash, keyHash),
          eq(schema.tenantApiKeys.isActive, true),
          or(
            isNull(schema.tenantApiKeys.expiresAt),
            gt(schema.tenantApiKeys.expiresAt, now),
          ),
        ),
      )
      .limit(1);

    if (row) {
      // Fire-and-forget last_used_at update — monitoring only, not correctness-critical.
      db.update(schema.tenantApiKeys)
        .set({ lastUsedAt: now })
        .where(eq(schema.tenantApiKeys.id, row.id))
        .catch(() => {});

      return {
        source: "db",
        tenantId: row.tenantId,
        keyId: row.id,
        scopes: row.scopes ?? [],
        rateLimitPerMinute: row.rateLimitPerMinute ?? 60,
      };
    }
  } catch {
    // DB unavailable — fall through to env var check so the legacy bridge
    // continues to work even during transient DB outages.
  }

  // ── 2. Env var fallback (legacy bridge) ─────────────────────────────────────
  // Kept to support the LMS API key as a DB-outage guard.
  // Env keys are scope-exempt and have no tenant context (billing skipped).
  if (config.API_KEYS.includes(rawKey)) {
    return {
      source: "env",
      tenantId: null,
      keyId: null,
      scopes: [],
      rateLimitPerMinute: 60,
    };
  }

  return undefined;
}

// ── Fastify preHandlers ───────────────────────────────────────────────────────

/**
 * preHandler: resolve and attach API key context if present.
 * Does NOT reject for missing or unknown keys.
 * May reject with 429 if the key is DB-backed and its rate limit is exceeded.
 * Useful for routes that behave differently for authenticated API callers.
 */
export async function attachTenantApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rawKey = request.headers["x-api-key"] as string | undefined;
  const ctx = await resolveTenantApiKey(rawKey);
  if (!ctx) return;

  // Per-key rate limit enforcement (DB-backed keys only)
  if (ctx.source === "db" && ctx.keyId !== null) {
    if (!checkAndCountRateLimit(ctx.keyId, ctx.rateLimitPerMinute)) {
      return reply.status(429).send({ error: "API key rate limit exceeded" });
    }
  }

  request.tenantApiKeyContext = ctx;
}

/**
 * preHandler: require a valid API key (DB or env var).
 * Returns 401 if the key is absent, unknown, inactive, or expired.
 * Returns 429 if the key is DB-backed and its rate limit is exceeded.
 * On success, attaches context to request.tenantApiKeyContext.
 */
export async function requireTenantApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rawKey = request.headers["x-api-key"] as string | undefined;
  const ctx = await resolveTenantApiKey(rawKey);

  if (!ctx) {
    return reply.status(401).send({ error: "Invalid or missing API key" });
  }

  // Per-key rate limit enforcement (DB-backed keys only)
  if (ctx.source === "db" && ctx.keyId !== null) {
    if (!checkAndCountRateLimit(ctx.keyId, ctx.rateLimitPerMinute)) {
      return reply.status(429).send({ error: "API key rate limit exceeded" });
    }
  }

  request.tenantApiKeyContext = ctx;
}

/**
 * requireScope — preHandler factory for scope-based access control.
 *
 * Behavior:
 *   - No tenantApiKeyContext (no key present): passes — route handles absence
 *   - source === "env" (legacy bridge): passes — env keys are scope-exempt
 *   - source === "db" AND scope missing: 403
 *   - source === "db" AND scope present: passes
 *
 * Designed to be chained after requireTenantApiKey or attachTenantApiKey:
 *   preHandler: [requireTenantApiKey, requireScope("sso:verify")]
 */
export function requireScope(scope: string) {
  return async function checkScope(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const ctx = request.tenantApiKeyContext;
    if (!ctx) return; // no key present — caller handles missing-key semantics
    if (ctx.source === "env") return; // env keys are scope-exempt (DB-outage path)
    if (!ctx.scopes.includes(scope)) {
      return reply.status(403).send({
        error: `API key missing required scope: ${scope}`,
      });
    }
  };
}
