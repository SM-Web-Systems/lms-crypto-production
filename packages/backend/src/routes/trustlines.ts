import { FastifyInstance } from "fastify";
import * as StellarSdk from "@stellar/stellar-sdk";
import { stellarClient } from "../lib/stellar-client";
import { TokenService } from "../modules/tokens/token.service";
import { authMiddleware } from "../middleware/auth";

const tokenService = new TokenService();

export async function trustlineRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────
  // LIST all trustlines for an account
  // ──────────────────────────────────────────
  app.get("/api/v1/trustlines/:publicKey", {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        description: "List all trustlines for a Stellar account, including XLM balance and reserve info.",
        tags: ["Trustlines"],
        params: {
          type: "object",
          properties: {
            publicKey: { type: "string", description: "Stellar public key (G...)" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              publicKey: { type: "string" },
              trustlineCount: { type: "number" },
              subentryCount: { type: "number" },
              xlmBalance: { type: "string" },
              reserveLocked: { type: "string" },
              availableXlm: { type: "string" },
              reservePerTrustline: { type: "string" },
              trustlines: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    assetCode: { type: "string" },
                    assetIssuer: { type: "string", nullable: true },
                    assetType: { type: "string" },
                    balance: { type: "string" },
                    limit: { type: "string", nullable: true },
                    isAuthorized: { type: "boolean" },
                  },
                },
              },
            },
          },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const { publicKey } = request.params as { publicKey: string };

    try {
      const account = await stellarClient.horizon.loadAccount(publicKey);

      const trustlines = account.balances.map((b: any) => ({
        assetCode: b.asset_type === "native" ? "XLM" : b.asset_code,
        assetIssuer: b.asset_type === "native" ? null : b.asset_issuer,
        assetType: b.asset_type,
        balance: b.balance,
        limit: b.limit || null,
        buyingLiabilities: b.buying_liabilities || "0",
        sellingLiabilities: b.selling_liabilities || "0",
        isAuthorized: b.is_authorized ?? true,
        isClawbackEnabled: b.is_clawback_enabled ?? false,
      }));

      const subentries = account.subentry_count;
      const xlmBalance = parseFloat(
        account.balances.find((b: any) => b.asset_type === "native")
          ?.balance || "0"
      );
      const minBalance = (2 + subentries) * 0.5;

      return {
        publicKey,
        trustlineCount: trustlines.filter(
          (t: any) => t.assetType !== "native"
        ).length,
        subentryCount: subentries,
        xlmBalance: xlmBalance.toFixed(7),
        reserveLocked: minBalance.toFixed(7),
        availableXlm: Math.max(0, xlmBalance - minBalance).toFixed(7),
        reservePerTrustline: "0.5",
        trustlines,
      };
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return reply
          .status(404)
          .send({ error: "Account not found or not funded" });
      }
      return reply.status(500).send({ error: error.message });
    }
  });

  // ──────────────────────────────────────────
  // PRE-FLIGHT CHECK before adding a trustline
  // ──────────────────────────────────────────
  app.get(
    "/api/v1/trustlines/check/:publicKey/:code/:issuer",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        description: "Pre-flight check before adding a trustline. Verifies asset exists, account has enough XLM, and trustline is not already present.",
        tags: ["Trustlines"],
        params: {
          type: "object",
          properties: {
            publicKey: { type: "string", description: "Stellar public key" },
            code: { type: "string", description: "Asset code (e.g. USDC)" },
            issuer: { type: "string", description: "Asset issuer public key" },
          },
          required: ["publicKey", "code", "issuer"],
        },
        response: {
          200: {
            description: "Trustline check result",
            type: "object",
            properties: {
              canAdd: { type: "boolean" },
              alreadyTrusted: { type: "boolean" },
              assetExists: { type: "boolean" },
              availableXlm: { type: "string" },
              reserveRequired: { type: "string" },
              hasEnoughXlm: { type: "boolean" },
              currentTrustlineCount: { type: "number" },
              assetMeta: { type: "object", nullable: true, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { publicKey, code, issuer } = request.params as {
        publicKey: string;
        code: string;
        issuer: string;
      };

      try {
        const account = await stellarClient.horizon.loadAccount(publicKey);
        const xlmBal = account.balances.find(
          (b: any) => b.asset_type === "native"
        );
        const currentXlm = parseFloat(xlmBal?.balance || "0");
        const subentries = account.subentry_count;
        const currentMinBalance = (2 + subentries) * 0.5;
        const availableXlm = currentXlm - currentMinBalance;

        const alreadyTrusted = account.balances.some(
          (b: any) => b.asset_code === code && b.asset_issuer === issuer
        );

        // Check if the asset actually exists on the network
        let assetExists = false;
        let assetMeta: any = null;
        try {
          const assets = await stellarClient.horizon
            .assets()
            .forCode(code)
            .forIssuer(issuer)
            .call();
          assetExists = assets.records.length > 0;
          if (assetExists) {
            assetMeta = {
              amount: assets.records[0].amount,
              numAccounts: assets.records[0].num_accounts,
              flags: assets.records[0].flags,
            };
          }
        } catch {}

        return {
          canAdd: !alreadyTrusted && availableXlm >= 0.5 && assetExists,
          alreadyTrusted,
          assetExists,
          assetMeta,
          availableXlm: availableXlm.toFixed(7),
          reserveRequired: "0.5",
          hasEnoughXlm: availableXlm >= 0.5,
          currentTrustlineCount: subentries,
        };
      } catch (error: any) {
        if (error?.response?.status === 404) {
          return {
            canAdd: false,
            error: "Account not funded",
            alreadyTrusted: false,
            assetExists: false,
            availableXlm: "0",
            hasEnoughXlm: false,
          };
        }
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // ──────────────────────────────────────────
  // BUILD "ADD TRUSTLINE" TX (returns unsigned XDR)
  // ──────────────────────────────────────────
  app.post("/api/v1/trustlines/add", {
      preHandler: authMiddleware,
      schema: {
        description: "Build an unsigned XDR transaction to add a trustline for an asset.",
        tags: ["Trustlines"],
        body: {
          type: "object",
          required: ["publicKey", "assetCode", "assetIssuer"],
          properties: {
            publicKey: { type: "string", description: "Stellar public key" },
            assetCode: { type: "string", description: "Asset code (e.g. USDC)" },
            assetIssuer: { type: "string", description: "Asset issuer public key" },
            limit: { type: "string", description: "Optional trust limit" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              xdr: { type: "string", description: "Unsigned transaction XDR" },
              networkPassphrase: { type: "string" },
              asset: { type: "object", properties: { code: { type: "string" }, issuer: { type: "string" } } },
              reserveCost: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          409: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const {
      publicKey,
      assetCode,
      assetIssuer,
      limit: trustLimit,
    } = request.body as {
      publicKey: string;
      assetCode: string;
      assetIssuer: string;
      limit?: string;
    };

    if (!publicKey || !assetCode || !assetIssuer) {
      return reply
        .status(400)
        .send({ error: "publicKey, assetCode, and assetIssuer are required" });
    }

    try {
      const account = await stellarClient.horizon.loadAccount(publicKey);
      const asset = new StellarSdk.Asset(assetCode, assetIssuer);

      // Check if trustline already exists
      const existing = account.balances.find(
        (b: any) => b.asset_code === assetCode && b.asset_issuer === assetIssuer
      );
      if (existing) {
        return reply
          .status(409)
          .send({ error: "Trustline already exists for this asset" });
      }

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: stellarClient.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.changeTrust({
            asset,
            limit: trustLimit || undefined,
          })
        )
        .setTimeout(180)
        .build();

      // Auto-register this token in our DB if not already there
      await tokenService.ensureToken(assetCode, assetIssuer);

      return {
        xdr: tx.toXDR(),
        networkPassphrase: stellarClient.networkPassphrase,
        asset: { code: assetCode, issuer: assetIssuer },
        reserveCost: "0.5",
      };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // ──────────────────────────────────────────
  // BUILD "REMOVE TRUSTLINE" TX
  // ──────────────────────────────────────────
  app.post("/api/v1/trustlines/remove", {
      preHandler: authMiddleware,
      schema: {
        description: "Build an unsigned XDR transaction to remove a trustline (balance must be zero).",
        tags: ["Trustlines"],
        body: {
          type: "object",
          required: ["publicKey", "assetCode", "assetIssuer"],
          properties: {
            publicKey: { type: "string" },
            assetCode: { type: "string" },
            assetIssuer: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              xdr: { type: "string" },
              networkPassphrase: { type: "string" },
              freedReserve: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const { publicKey, assetCode, assetIssuer } = request.body as {
      publicKey: string;
      assetCode: string;
      assetIssuer: string;
    };

    if (!publicKey || !assetCode || !assetIssuer) {
      return reply
        .status(400)
        .send({ error: "publicKey, assetCode, and assetIssuer are required" });
    }

    try {
      const account = await stellarClient.horizon.loadAccount(publicKey);

      const trustline = account.balances.find(
        (b: any) => b.asset_code === assetCode && b.asset_issuer === assetIssuer
      );
      if (!trustline) {
        return reply
          .status(404)
          .send({ error: "Trustline does not exist" });
      }
      if (parseFloat(trustline.balance) > 0) {
        return reply.status(400).send({
          error:
            "Cannot remove trustline with non-zero balance. Send or swap all tokens first.",
          balance: trustline.balance,
        });
      }

      const asset = new StellarSdk.Asset(assetCode, assetIssuer);
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: stellarClient.networkPassphrase,
      })
        .addOperation(StellarSdk.Operation.changeTrust({ asset, limit: "0" }))
        .setTimeout(180)
        .build();

      return {
        xdr: tx.toXDR(),
        networkPassphrase: stellarClient.networkPassphrase,
        freedReserve: "0.5",
      };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // ──────────────────────────────────────────
  // BUILD "UPDATE TRUSTLINE LIMIT" TX
  // ──────────────────────────────────────────
  app.post("/api/v1/trustlines/update-limit", {
      preHandler: authMiddleware,
      schema: {
        description: "Build an unsigned XDR transaction to update a trustline limit.",
        tags: ["Trustlines"],
        body: {
          type: "object",
          required: ["publicKey", "assetCode", "assetIssuer", "limit"],
          properties: {
            publicKey: { type: "string" },
            assetCode: { type: "string" },
            assetIssuer: { type: "string" },
            limit: { type: "string", description: "New trust limit" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              xdr: { type: "string" },
              networkPassphrase: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    }, async (request, reply) => {
    const {
      publicKey,
      assetCode,
      assetIssuer,
      limit: newLimit,
    } = request.body as {
      publicKey: string;
      assetCode: string;
      assetIssuer: string;
      limit: string;
    };

    if (!publicKey || !assetCode || !assetIssuer || !newLimit) {
      return reply.status(400).send({ error: "All fields are required" });
    }

    try {
      const account = await stellarClient.horizon.loadAccount(publicKey);
      const asset = new StellarSdk.Asset(assetCode, assetIssuer);

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: stellarClient.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.changeTrust({ asset, limit: newLimit })
        )
        .setTimeout(180)
        .build();

      return {
        xdr: tx.toXDR(),
        networkPassphrase: stellarClient.networkPassphrase,
      };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}
