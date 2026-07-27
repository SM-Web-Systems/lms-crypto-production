import { FastifyInstance } from "fastify";
import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { attachTenantApiKey, requireScope } from "../middleware/tenant-api-key";
import { config } from "../config";
import {
  checkWalletBilling,
  writeBillingDebit,
  upsertTenantUser,
  maybeNotifyDeficit,
} from "../services/billing.service";

export async function walletRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────
  // GET USER WALLETS
  // ──────────────────────────────────────────
  app.get("/api/v1/wallets", {
      preHandler: authMiddleware,
      schema: {
        description: "List all wallets for the authenticated user.",
        tags: ["Wallets"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "array",
            items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  userId: { type: "number" },
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
    }, async (request) => {
    const userId = request.user!.userId;

    const wallets = await db
      .select({
        id: schema.userWallets.id,
        userId: schema.userWallets.userId,
        name: schema.userWallets.name,
        publicKey: schema.userWallets.publicKey,
        network: schema.userWallets.network,
        isActive: schema.userWallets.isActive,
        createdAt: schema.userWallets.createdAt,
      })
      .from(schema.userWallets)
      .where(eq(schema.userWallets.userId, userId));

    return wallets;
  });

  // ──────────────────────────────────────────
  // ADD WALLET
  // ──────────────────────────────────────────
  // Phase 2: attachTenantApiKey added alongside authMiddleware so that server-to-server
  // callers (e.g. LMS) can pass both a user JWT and an x-api-key. When a valid API key
  // with a tenantId is present, wallet creation triggers a billing debit.
  app.post("/api/v1/wallets", {
      preHandler: [authMiddleware, attachTenantApiKey, requireScope("wallet:create")],
      schema: {
        description: "Add a new wallet. Becomes the active wallet; all others are deactivated.",
        tags: ["Wallets"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "publicKey"],
          properties: {
            name: { type: "string", description: "Display name for the wallet" },
            publicKey: { type: "string", description: "Stellar public key (G...)" },
            encryptedSecret: { type: "string", description: "AES-GCM encrypted secret key (for delegated mode)" },
            network: { type: "string", enum: ["testnet", "mainnet", "public"], default: "public" },
          },
        },
        response: {
          200: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  userId: { type: "number" },
                  name: { type: "string" },
                  publicKey: { type: "string" },
                  network: { type: "string" },
                  isActive: { type: "boolean" },
                  createdAt: { type: "string", format: "date-time" },
                },
              },
          400: { type: "object", properties: { error: { type: "string" } } },
          402: { type: "object", properties: { error: { type: "string" } } },
          409: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const userId = request.user!.userId;
    const tenantCtx = request.tenantApiKeyContext;
    const { name, publicKey, encryptedSecret, network } = request.body as {
      name: string;
      publicKey: string;
      encryptedSecret?: string;
      network?: string;
    };

    if (!name || !publicKey) {
      return reply.status(400).send({ error: "Name and publicKey are required" });
    }

    // Always enforce the server's configured network — client-supplied value is ignored.
    // This prevents mainnet clients from creating testnet wallets and vice versa.
    const effectiveNetwork = config.STELLAR_NETWORK === "public"
      ? "public"
      : config.STELLAR_NETWORK === "testnet"
        ? "testnet"
        : (network || "public");

    // Check if wallet already exists for this user
    const existing = await db
      .select({ id: schema.userWallets.id })
      .from(schema.userWallets)
      .where(
        and(
          eq(schema.userWallets.userId, userId),
          eq(schema.userWallets.publicKey, publicKey)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: "Wallet already exists" });
    }

    // Check for duplicate name
    const duplicateName = await db
      .select({ id: schema.userWallets.id })
      .from(schema.userWallets)
      .where(
        and(
          eq(schema.userWallets.userId, userId),
          eq(schema.userWallets.name, name)
        )
      )
      .limit(1);

    if (duplicateName.length > 0) {
      return reply.status(409).send({ error: "A wallet with this name already exists" });
    }

    // ── Phase 2: billing pre-flight check ──────────────────────────────────
    // Only applies when a tenant API key with a tenantId is present.
    let billingResult: Awaited<ReturnType<typeof checkWalletBilling>> | null = null;

    if (tenantCtx?.tenantId) {
      billingResult = await checkWalletBilling({ tenantId: tenantCtx.tenantId, userId });

      if (!billingResult.ok) {
        return reply.status(billingResult.httpStatus).send({ error: billingResult.message });
      }
    }

    // ── Wallet creation + billing debit in one transaction ─────────────────
    let debitNewBalance: string | null = null;

    const wallet = await db.transaction(async (tx) => {
      // Deactivate other wallets
      await tx
        .update(schema.userWallets)
        .set({ isActive: false })
        .where(eq(schema.userWallets.userId, userId));

      // Insert new wallet
      const [created] = await tx
        .insert(schema.userWallets)
        .values({
          userId,
          name,
          publicKey,
          encryptedSecret: encryptedSecret || null,
          network: effectiveNetwork,
          isActive: true,
        })
        .returning();

      // Billing writes (only when a billing action is needed)
      if (
        billingResult?.ok &&
        billingResult.eventType !== "no_billing" &&
        billingResult.eventType !== "idempotent_skip" &&
        tenantCtx?.tenantId
      ) {
        const { eventType, amountXlm, policy } = billingResult as Extract<
          typeof billingResult,
          { eventType: "new_wallet_activation" | "existing_user_onboarding" }
        >;

        const debitResult = await writeBillingDebit(tx, {
          tenantId: tenantCtx.tenantId,
          eventType,
          amountXlm,
          policyVersionId: policy.id,
          userId,
          apiKeyId: tenantCtx.keyId,
          // Snapshot fields for new_wallet_activation
          walletFundingSnapshot:
            eventType === "new_wallet_activation" && policy.walletFundingEnabled
              ? policy.walletFundingXlm
              : null,
          platformFeeSnapshot:
            eventType === "new_wallet_activation" ? policy.newWalletPlatformFeeXlm : null,
          // Snapshot field for existing_user_onboarding
          onboardingFeeSnapshot:
            eventType === "existing_user_onboarding" ? policy.onboardingFeeXlm : null,
        });
        debitNewBalance = debitResult.newBalance;

        // Link user to tenant (idempotent — ignores conflicts)
        await upsertTenantUser(tx, tenantCtx.tenantId, userId);
      } else if (
        billingResult?.ok &&
        billingResult.eventType === "idempotent_skip" &&
        tenantCtx?.tenantId
      ) {
        // Already onboarded and active — just ensure tenant_users row exists
        await upsertTenantUser(tx, tenantCtx.tenantId, userId);
      }

      return created;
    });

    // Fire-and-forget deficit notification after transaction commits
    if (debitNewBalance !== null && tenantCtx?.tenantId) {
      maybeNotifyDeficit(tenantCtx.tenantId, debitNewBalance).catch(() => {});
    }

    return wallet;
  });

  // ──────────────────────────────────────────
  // SET ACTIVE WALLET
  // ──────────────────────────────────────────
  app.patch("/api/v1/wallets/:id/activate", {
      preHandler: authMiddleware,
      schema: {
        description: "Set a wallet as the active wallet. Deactivates all others.",
        tags: ["Wallets"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", description: "Wallet ID" },
          },
        },
        response: {
          200: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  userId: { type: "number" },
                  name: { type: "string" },
                  publicKey: { type: "string" },
                  network: { type: "string" },
                  isActive: { type: "boolean" },
                  createdAt: { type: "string", format: "date-time" },
                },
              },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    // Deactivate all
    await db
      .update(schema.userWallets)
      .set({ isActive: false })
      .where(eq(schema.userWallets.userId, userId));

    // Activate selected
    const [wallet] = await db
      .update(schema.userWallets)
      .set({ isActive: true })
      .where(
        and(
          eq(schema.userWallets.id, parseInt(id)),
          eq(schema.userWallets.userId, userId)
        )
      )
      .returning();

    if (!wallet) {
      return reply.status(404).send({ error: "Wallet not found" });
    }

    return wallet;
  });

  // ──────────────────────────────────────────
  // RENAME WALLET
  // ──────────────────────────────────────────
  app.patch("/api/v1/wallets/:id", {
      preHandler: authMiddleware,
      schema: {
        description: "Rename a wallet.",
        tags: ["Wallets"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", description: "Wallet ID" },
          },
        },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", description: "New wallet name" },
          },
        },
        response: {
          200: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  userId: { type: "number" },
                  name: { type: "string" },
                  publicKey: { type: "string" },
                  network: { type: "string" },
                  isActive: { type: "boolean" },
                  createdAt: { type: "string", format: "date-time" },
                },
              },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const { name } = request.body as { name: string };

    const [wallet] = await db
      .update(schema.userWallets)
      .set({ name })
      .where(
        and(
          eq(schema.userWallets.id, parseInt(id)),
          eq(schema.userWallets.userId, userId)
        )
      )
      .returning();

    if (!wallet) {
      return reply.status(404).send({ error: "Wallet not found" });
    }

    return wallet;
  });

  // ──────────────────────────────────────────
  // DELETE WALLET
  // ──────────────────────────────────────────
  app.delete("/api/v1/wallets/:id", {
      preHandler: authMiddleware,
      schema: {
        description: "Delete a wallet. If it was active, another wallet is auto-activated.",
        tags: ["Wallets"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string", description: "Wallet ID" },
          },
        },
        response: {
          200: { type: "object", properties: { ok: { type: "boolean" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const [deleted] = await db
      .delete(schema.userWallets)
      .where(
        and(
          eq(schema.userWallets.id, parseInt(id)),
          eq(schema.userWallets.userId, userId)
        )
      )
      .returning();

    if (!deleted) {
      return reply.status(404).send({ error: "Wallet not found" });
    }

    // If we deleted the active wallet, activate another one
    const remaining = await db
      .select()
      .from(schema.userWallets)
      .where(eq(schema.userWallets.userId, userId))
      .limit(1);

    if (remaining.length > 0) {
      await db
        .update(schema.userWallets)
        .set({ isActive: true })
        .where(eq(schema.userWallets.id, remaining[0].id));
    }

    return { ok: true };
  });

  // ──────────────────────────────────────────
  // WALLET FUNDING NOTICE
  // ──────────────────────────────────────────
  // Returns whether the authenticated user has ever had a wallet activation billing event.
  // The frontend uses this (+ localStorage dismiss flag) to show a one-time funding notice.
  app.get("/api/v1/wallet/funding-notice", {
    preHandler: authMiddleware,
    schema: {
      description: "Check if user has a wallet activation billing event (for first-time funding notice).",
      tags: ["Wallets"],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            hasFundingEvent: { type: "boolean" },
            activeWalletPublicKey: { type: "string", nullable: true },
          },
        },
      },
    },
  }, async (request) => {
    const userId = request.user!.userId;

    const [fundingRow] = await db
      .select({ id: schema.billingEvents.id })
      .from(schema.billingEvents)
      .where(
        and(
          eq(schema.billingEvents.userId, userId),
          eq(schema.billingEvents.eventType, "new_wallet_activation")
        )
      )
      .limit(1);

    const [activeWallet] = await db
      .select({ publicKey: schema.userWallets.publicKey })
      .from(schema.userWallets)
      .where(
        and(
          eq(schema.userWallets.userId, userId),
          eq(schema.userWallets.isActive, true)
        )
      )
      .limit(1);

    return {
      hasFundingEvent: !!fundingRow,
      activeWalletPublicKey: activeWallet?.publicKey ?? null,
    };
  });
}
