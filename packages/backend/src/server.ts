import "dotenv/config";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyHelmet from "@fastify/helmet";
import path from "path";
import crypto from "crypto";
import * as StellarSdk from "@stellar/stellar-sdk";
import cors from "@fastify/cors";
import { config } from "./config/index.js";
import { TokenService } from "./modules/tokens/token.service";
import { SwapService } from "./modules/swap/swap.service";
import { runTokenIndexer } from "./jobs/token-indexer";
import { syncTomlImages } from "./lib/toml-sync.js";
import { authRoutes } from "./routes/auth";
import { ssoRoutes } from "./routes/sso";
import { tenantRoutes } from "./routes/tenant";
import { adminRoutes } from "./routes/admin";
import { checkAndRunMonthlyMaintenance } from "./jobs/monthly-maintenance";
import { checkAndRunAutoSuspension } from "./jobs/auto-suspension";
import { twoFaRoutes } from "./routes/two-fa";
import { walletRoutes } from "./routes/wallets";
import { trustlineRoutes } from "./routes/trustlines";
import { addressBookRoutes } from "./routes/contacts";
import { pushRoutes } from "./routes/push";
import { fiatRampRoutes } from "./routes/fiat";
import { portfolioRoutes } from "./routes/portfolio";
import { earnRoutes } from "./routes/earn";
import { nftRoutes } from "./routes/nft";
import { moneygramRoutes } from "./routes/moneygram";
import { curatedTokenRoutes } from "./routes/curated-tokens";
import StellarHDWallet from "stellar-hd-wallet";
import { db, schema } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { authMiddleware } from "./middleware/auth";
import { auditLog } from "./lib/audit";
import { decryptSecret } from "./lib/decrypt-secret";

const app = Fastify({
  bodyLimit: 1_048_576, // 1 MB max request body
  logger: true,
});
const tokenService = new TokenService();
const swapService = new SwapService();
const stellar = new StellarSdk.Horizon.Server(config.HORIZON_URL);

async function bootstrap() {
  // ═══════════════════════════════════════
  // Swagger / OpenAPI
  // ═══════════════════════════════════════
  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Amma Wallet API",
        description:
          "Public REST API for the Amma Stellar Wallet. Provides token data, account info, swap quotes, trustline management, and transaction submission.\n\n" +
          "## Authentication\n" +
          "Most endpoints require a Bearer JWT token obtained via POST /api/v1/auth/login. " +
          "Include it in the Authorization header: `Bearer <token>`.\n\n" +
          "## Rate Limiting\n" +
          "All endpoints are subject to a global rate limit of 60 requests/minute per IP. " +
          "Sensitive endpoints have stricter limits:\n" +
          "- **Register**: 5 req / 15 min\n" +
          "- **Login**: 10 req / 5 min\n" +
          "- **Forgot password**: 3 req / 15 min\n" +
          "- **Reset password**: 5 req / 15 min\n" +
          "- **Keypair generate**: 3 req / min\n" +
          "- **Keypair from-mnemonic**: 3 req / min\n" +
          "- **Keypair from-secret**: 5 req / min\n" +
          "- **Validate mnemonic**: 10 req / min\n" +
          "- **Friendbot fund**: 3 req / 10 min\n" +
          "- **Wallet info**: 30 req / min\n" +
          "- **Transaction history**: 30 req / min\n" +
          "- **StellarExpert proxy**: 20 req / min\n\n" +
          'Rate-limited responses return HTTP 429 with `{"error": "Too many requests. Please slow down."}`.\n\n' +
          "## Ownership Verification\n" +
          "Endpoints that operate on a wallet (e.g. swap/build, sign, sign-and-submit) verify that the " +
          "provided publicKey belongs to the authenticated user.\n\n" +
          "## Registration\n" +
          "Users can register with email, phone number (E.164 format), or both. At least one identifier is required.",
        version: "1.1.0",
        contact: {
          name: "SM Web Systems",
          url: "https://ammawallet.com",
        },
      },
      servers: [
        { url: "https://ammawallet.com", description: "Production" },
        { url: "http://localhost:3001", description: "Local development" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "JWT access token from /api/v1/auth/login",
          },
          apiKey: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
            description: "API key for public API access",
          },
        },
      },
      tags: [
        { name: "Health", description: "Server health check" },
        {
          name: "Auth",
          description:
            "Authentication & user management. Register with email and/or phone number. Rate-limited.",
        },
        {
          name: "Tokens",
          description:
            "Token registry, search, and metadata. Favorites require auth. Directory and search results are paginated with max limits.",
        },
        {
          name: "Wallet",
          description:
            "Wallet account info (rate-limited) and testnet funding (rate-limited, testnet only).",
        },
        { name: "Trustlines", description: "Stellar trustline management" },
        {
          name: "Swap",
          description:
            "DEX swap quotes and execution. Build requires auth and wallet ownership verification.",
        },
        {
          name: "Transactions",
          description:
            "Transaction submission (auth required) and history (rate-limited).",
        },
        {
          name: "Keypair",
          description:
            "Keypair generation and derivation. All endpoints require authentication and are rate-limited.",
        },
        { name: "Signing", description: "Delegated signing mode" },
        {
          name: "2FA",
          description: "Two-factor authentication setup and management",
        },
        { name: "Wallets", description: "Multi-wallet management" },
        { name: "API Keys", description: "API key management" },
        { name: "Contacts", description: "Address book management" },
        {
          name: "Push Notifications",
          description: "Web push notification management",
        },
        {
          name: "Fiat Ramp",
          description: "Fiat on/off ramp — MoneyGram cash in/out via SEP-24",
        },
        { name: "Earn", description: "Liquidity pool staking and fee earning" },
        {
          name: "NFTs",
          description:
            "Non-fungible token collections and management (SEP-50 + SEP-39)",
        },
        {
          name: "Portfolio",
          description: "Portfolio analytics and balance tracking",
        },
        {
          name: "Admin",
          description: "Admin-only endpoints for system management",
        },
      ],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      persistAuthorization: true,
    },
  });

  // ═══════════════════════════════════════
  // Security Headers (for direct API access bypassing nginx)
  // ═══════════════════════════════════════
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // nginx handles CSP for web app
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow API responses cross-origin
  });

  // Rate Limiting
  // ═══════════════════════════════════════
  await app.register(fastifyRateLimit, {
    max: 60,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      // Use API key if present, otherwise IP
      const apiKey = request.headers["x-api-key"] as string;
      return apiKey || request.ip;
    },
    errorResponseBuilder: () => ({
      error: "Too many requests. Please slow down.",
      statusCode: 429,
    }),
  });

  // CORS
  await app.register(cors, {
    origin: (origin, cb) => {
      const allowed = [
        "http://localhost:5173",
        "https://ammawallet.com",
        "https://www.ammawallet.com",
        config.WEB_APP_URL,
      ].filter(Boolean);

      if (
        !origin ||
        allowed.includes(origin) ||
        origin.startsWith("chrome-extension://")
      ) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
  });

  app.register(authRoutes);
  app.register(ssoRoutes);
  app.register(tenantRoutes);
  app.register(adminRoutes);
  app.register(twoFaRoutes);
  app.register(walletRoutes);
  app.register(trustlineRoutes);
  app.register(addressBookRoutes);
  app.register(pushRoutes);
  app.register(fiatRampRoutes);
  app.register(portfolioRoutes);
  app.register(curatedTokenRoutes);
  app.register(moneygramRoutes);
  app.register(earnRoutes);
  app.register(nftRoutes);
  app.register(fastifyStatic, {
    root: path.resolve(__dirname, "../assets/icons"),
    prefix: "/assets/icons/",
    decorateReply: false,
  });

  // ═══════════════════════════════════════
  // Health
  // ═══════════════════════════════════════
  app.get("/api/v1/health", async () => ({
    status: "ok",
    network: config.STELLAR_NETWORK,
    timestamp: new Date().toISOString(),
  }));

  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Server health check",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", example: "ok" },
              network: { type: "string", example: "testnet" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async () => ({
      status: "ok",
      network: config.STELLAR_NETWORK,
      timestamp: new Date().toISOString(),
    }),
  );

  // ═══════════════════════════════════════
  // Token Routes
  // ═══════════════════════════════════════

  app.get(
    "/api/v1/tokens",
    {
      schema: {
        tags: ["Tokens"],
        summary: "Search and list tokens",
        querystring: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search by code or name" },
            sortBy: { type: "string", description: "Sort field" },
            verified: { type: "string", enum: ["true", "false"] },
            limit: {
              type: "integer",
              default: 50,
              minimum: 1,
              maximum: 100,
              description: "Results per page (1–100, default 50)",
            },
            offset: { type: "integer", default: 0, minimum: 0 },
            network: {
              type: "string",
              enum: ["pubnet", "testnet"],
              default: "pubnet",
              description: "Stellar network",
            },
          },
        },
        response: {
          200: {
            description: "Token search results with pagination",
            type: "object",
            properties: {
              tokens: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    assetCode: { type: "string" },
                    assetIssuer: { type: "string" },
                    tomlName: { type: "string" },
                    isVerified: { type: "boolean" },
                    ratingAverage: { type: "string", nullable: true },
                    volume7d: { type: "string", nullable: true },
                    trustlineCount: { type: "integer", nullable: true },
                    homeDomain: { type: "string", nullable: true },
                    tomlImage: { type: "string", nullable: true },
                  },
                },
              },
              pagination: {
                type: "object",
                properties: {
                  total: { type: "integer" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                  hasMore: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { query, sortBy, verified, limit, offset, network } =
        request.query as any;

      // Clamp limit to 1–100, reject negatives
      const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
      const safeOffset = Math.max(parseInt(offset) || 0, 0);

      return tokenService.search({
        query,
        sortBy,
        verified: verified === "true",
        limit: safeLimit,
        offset: safeOffset,
        network: network || "pubnet",
      });
    },
  );

  app.get(
    "/api/v1/tokens/featured",
    {
      schema: {
        tags: ["Tokens"],
        summary: "Get featured tokens",
        response: {
          200: {
            description: "Featured token list",
            type: "array",
            items: {
              type: "object",
              properties: {
                assetCode: { type: "string" },
                assetIssuer: { type: "string" },
                tomlName: { type: "string" },
              },
            },
          },
        },
      },
    },
    async () => {
      return tokenService.getFeatured();
    },
  );

  // ═══════════════════════════════════════
  // StellarExpert Proxy
  // ═══════════════════════════════════════
  app.get(
    "/api/v1/tokens/expert/:code/:issuer",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["Tokens"],
        summary: "Proxy to StellarExpert asset data",
        params: {
          type: "object",
          properties: {
            code: { type: "string" },
            issuer: { type: "string" },
          },
          required: ["code", "issuer"],
        },
        response: {
          200: {
            description: "StellarExpert asset data",
            type: "object",
            additionalProperties: true,
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          502: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { code, issuer } = request.params as {
        code: string;
        issuer: string;
      };

      if (issuer === "native") {
        return reply
          .status(400)
          .send({ error: "Use backend for native asset" });
      }

      try {
        const res = await fetch(
          `https://api.stellar.expert/explorer/public/asset/${code}-${issuer}`,
        );
        if (!res.ok) {
          return reply
            .status(res.status)
            .send({ error: "Asset not found on StellarExpert" });
        }
        const data = await res.json();
        return reply.send(data);
      } catch (err: any) {
        return reply.status(502).send({
          error:
            config.NODE_ENV === "production"
              ? "Failed to fetch from StellarExpert"
              : err.message || "Failed to fetch from StellarExpert",
        });
      }
    },
  );

  app.get(
    "/api/v1/tokens/directory",
    {
      schema: {
        tags: ["Tokens"],
        summary: "StellarExpert asset directory proxy (paginated)",
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string", default: "200" },
            order: { type: "string", default: "desc" },
          },
        },
        response: {
          200: {
            description: "Asset directory records",
            type: "object",
            properties: {
              _embedded: {
                type: "object",
                properties: {
                  records: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                },
              },
              total: { type: "number" },
            },
          },
          502: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { limit, order } = request.query as {
        limit?: string;
        order?: string;
      };
      const targetCount = Math.min(parseInt(limit || "200"), 200);
      const allRecords: any[] = [];
      let cursor = "";
      const perPage = 50;

      try {
        while (allRecords.length < targetCount) {
          let url =
            "https://api.stellar.expert/explorer/public/asset?order=" +
            (order || "desc") +
            "&limit=" +
            perPage;
          if (cursor) {
            url += "&cursor=" + cursor;
          }
          const res = await fetch(url);
          if (!res.ok) break;
          const data = await res.json();
          const records = data._embedded?.records || [];
          if (records.length === 0) break;
          allRecords.push(...records);

          // Extract cursor from next link
          const nextHref = data._links?.next?.href || "";
          const cursorMatch = nextHref.match(/cursor=(\d+)/);
          if (cursorMatch) {
            cursor = cursorMatch[1];
          } else {
            break;
          }
        }

        return reply.send({
          _embedded: {
            records: allRecords.slice(0, targetCount),
          },
          total: allRecords.length,
        });
      } catch (err: any) {
        return reply.status(502).send({ error: err.message });
      }
    },
  );

  app.get(
    "/api/v1/tokens/:code/:issuer",
    {
      schema: {
        tags: ["Tokens"],
        summary: "Get single token detail",
        params: {
          type: "object",
          properties: {
            code: { type: "string" },
            issuer: { type: "string", description: 'Use "native" for XLM' },
          },
          required: ["code", "issuer"],
        },
        response: {
          200: {
            description: "Token detail",
            type: "object",
            properties: {
              assetCode: { type: "string" },
              assetIssuer: { type: "string" },
              tomlName: { type: "string" },
              balance: { type: "string" },
              isVerified: { type: "boolean" },
            },
            additionalProperties: true,
          },
        },
      },
    },
    async (request) => {
      const { code, issuer } = request.params as any;
      const token = await tokenService.getDetail(
        code,
        issuer === "native" ? null : issuer,
      );
      if (!token) return { error: "Token not found" };
      return token;
    },
  );

  // ─── Price History (Trade Aggregations from Horizon) ───
  app.get(
    "/api/v1/tokens/:code/:issuer/price-history",
    {
      schema: {
        tags: ["Tokens"],
        summary:
          "Get token price history (OHLCV from Horizon trade aggregations)",
        params: {
          type: "object",
          properties: {
            code: { type: "string" },
            issuer: { type: "string", description: 'Use "native" for XLM' },
          },
          required: ["code", "issuer"],
        },
        querystring: {
          type: "object",
          properties: {
            resolution: {
              type: "string",
              enum: ["3600000", "86400000", "604800000"],
              default: "86400000",
              description:
                "Candle resolution in ms: 1h=3600000, 1d=86400000, 1w=604800000",
            },
            limit: { type: "integer", default: 30, minimum: 1, maximum: 200 },
            counterCode: { type: "string", default: "USDC" },
            counterIssuer: { type: "string" },
          },
        },
        response: {
          200: {
            description: "Price history data points",
            type: "object",
            properties: {
              candles: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    timestamp: { type: "number" },
                    open: { type: "string" },
                    high: { type: "string" },
                    low: { type: "string" },
                    close: { type: "string" },
                    volume: { type: "string" },
                    tradeCount: { type: "number" },
                  },
                },
              },
              resolution: { type: "string" },
              baseAsset: { type: "string" },
              counterAsset: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { code, issuer } = request.params as any;
      const { resolution, limit, counterCode, counterIssuer } =
        request.query as any;

      const res_ms = resolution || "86400000";
      const lim = Math.min(parseInt(limit) || 30, 200);

      // Build Horizon trade_aggregations URL
      const horizonUrl =
        config.HORIZON_URL || "https://horizon-testnet.stellar.org";
      const params = new URLSearchParams();
      params.set("resolution", res_ms);
      params.set("limit", String(lim));
      params.set("order", "desc");

      // Base asset
      if (code === "XLM" || issuer === "native") {
        params.set("base_asset_type", "native");
      } else {
        const assetType =
          code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
        params.set("base_asset_type", assetType);
        params.set("base_asset_code", code);
        params.set("base_asset_issuer", issuer);
      }

      // Counter asset (default USDC on testnet)
      const cCode = counterCode || "USDC";
      const cIssuer =
        counterIssuer ||
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      if (cCode === "XLM") {
        params.set("counter_asset_type", "native");
      } else {
        const cType =
          cCode.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
        params.set("counter_asset_type", cType);
        params.set("counter_asset_code", cCode);
        params.set("counter_asset_issuer", cIssuer);
      }

      try {
        const url = horizonUrl + "/trade_aggregations?" + params.toString();
        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text();
          return reply
            .status(400)
            .send({ error: "Horizon error: " + text.substring(0, 200) });
        }
        const data = await res.json();
        const records = data._embedded?.records || [];

        const candles = records
          .map((r: any) => ({
            timestamp: parseInt(r.timestamp),
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.base_volume,
            tradeCount: parseInt(r.trade_count),
          }))
          .reverse(); // oldest first for charting

        return {
          candles,
          resolution: res_ms,
          baseAsset:
            code +
            (issuer && issuer !== "native" ? "-" + issuer.substring(0, 4) : ""),
          counterAsset: cCode,
        };
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  app.get(
    "/api/v1/tokens/user/:publicKey",
    {
      schema: {
        tags: ["Tokens"],
        summary: "Get user token balances with metadata",
        params: {
          type: "object",
          properties: {
            publicKey: { type: "string", description: "Stellar public key" },
          },
          required: ["publicKey"],
        },
        response: {
          200: {
            description: "User token balances",
            type: "array",
            items: {
              type: "object",
              properties: {
                assetCode: { type: "string" },
                assetIssuer: { type: "string" },
                balance: { type: "string" },
              },
              additionalProperties: true,
            },
          },
        },
      },
    },
    async (request) => {
      const { publicKey } = request.params as any;
      try {
        return await tokenService.getUserTokens(publicKey);
      } catch (error: any) {
        return { error: "Account not found or not funded" };
      }
    },
  );

  app.post(
    "/api/v1/tokens/favorite",
    {
      preHandler: authMiddleware,
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ["Tokens"],
        summary: "Toggle token favorite status",
        body: {
          type: "object",
          properties: {
            publicKey: { type: "string" },
            tokenId: { type: "integer" },
          },
          required: ["publicKey", "tokenId"],
        },
        response: {
          200: {
            description: "Favorite toggle result",
            type: "object",
            properties: { isFavorite: { type: "boolean" } },
            additionalProperties: true,
          },
          401: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request) => {
      const { publicKey, tokenId } = request.body as any;
      return tokenService.toggleFavorite(publicKey, tokenId);
    },
  );

  // ═══════════════════════════════════════
  // Swap Routes
  // ═══════════════════════════════════════

  app.get(
    "/api/v1/swap/quote",
    {
      schema: {
        tags: ["Swap"],
        summary: "Get swap quote",
        querystring: {
          type: "object",
          properties: {
            fromCode: { type: "string" },
            fromIssuer: { type: "string" },
            toCode: { type: "string" },
            toIssuer: { type: "string" },
            amount: { type: "string" },
            direction: {
              type: "string",
              enum: ["send", "receive"],
              default: "send",
            },
          },
          required: ["fromCode", "toCode", "amount"],
        },
        response: {
          200: {
            description: "Best swap quote",
            type: "object",
            properties: {
              fromAsset: { type: "string" },
              toAsset: { type: "string" },
              fromAmount: { type: "string" },
              toAmount: { type: "string" },
              path: { type: "array", items: { type: "object" } },
              rate: { type: "string" },
            },
            additionalProperties: true,
          },
        },
      },
    },
    async (request) => {
      const { fromCode, fromIssuer, toCode, toIssuer, amount, direction } =
        request.query as any;

      if (!fromCode || !toCode || !amount) {
        return { error: "fromCode, toCode, and amount are required" };
      }

      return swapService.getBestQuote(
        fromCode,
        fromIssuer || null,
        toCode,
        toIssuer || null,
        amount,
        direction || "send",
      );
    },
  );

  app.post(
    "/api/v1/swap/build",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Swap"],
        summary:
          "Build unsigned swap transaction XDR. The publicKey must belong to the authenticated user.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            publicKey: { type: "string" },
            quote: { type: "object" },
            slippageBps: { type: "integer", default: 100 },
          },
          required: ["publicKey", "quote"],
        },
        response: {
          200: {
            description: "Unsigned swap XDR",
            type: "object",
            properties: {
              xdr: { type: "string", description: "Unsigned transaction XDR" },
              networkPassphrase: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          403: {
            description: "Wallet does not belong to authenticated user",
            type: "object",
            properties: { error: { type: "string" } },
          },
          429: {
            description: "Rate limit exceeded",
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      const { publicKey, quote, slippageBps } = request.body as any;

      if (!publicKey || !quote) {
        return reply
          .status(400)
          .send({ error: "publicKey and quote are required" });
      }

      // Ownership check: ensure publicKey belongs to authenticated user
      const userId = request.user!.userId;
      const [wallet] = await db
        .select()
        .from(schema.userWallets)
        .where(
          and(
            eq(schema.userWallets.userId, userId),
            eq(schema.userWallets.publicKey, publicKey),
          ),
        )
        .limit(1);

      if (!wallet) {
        return reply
          .status(403)
          .send({ error: "This wallet does not belong to your account" });
      }

      let xdr = await swapService.buildSwapTransaction(
        publicKey,
        quote,
        slippageBps || 100,
      );

      const networkPassphrase =
        config.STELLAR_NETWORK === "testnet"
          ? "Test SDF Network ; September 2015"
          : "Public Global Stellar Network ; September 2015";

      // Inject platform fee on swaps for ALL users (self-mode pays fee on swaps)
      const feePercent = config.PLATFORM_FEE_PERCENT || 0;
      const platformWallet = config.PLATFORM_WALLET;
      let feeInfo: any = null;

      if (feePercent > 0 && platformWallet && xdr) {
        try {
          const { stellarClient: sc } = await import("./lib/stellar-client");
          const tx = StellarSdk.TransactionBuilder.fromXDR(
            xdr,
            networkPassphrase,
          );
          const ops = (tx as any).operations || [];
          const account = await sc.horizon.loadAccount(publicKey);
          const builder = new StellarSdk.TransactionBuilder(account, {
            fee: (tx as any).fee || StellarSdk.BASE_FEE,
            networkPassphrase,
          });

          // Re-add original ops
          for (const op of ops) {
            builder.addOperation(
              StellarSdk.Operation.fromXDRObject(op.toXDRObject()),
            );
          }

          // Calculate fee from path payment amount and add fee payment op
          for (const op of ops) {
            if (
              (op.type === "pathPaymentStrictSend" ||
                op.type === "pathPaymentStrictReceive") &&
              op.sendAmount
            ) {
              const amount = parseFloat(op.sendAmount || op.amount || "0");
              const feeAmount = ((amount * feePercent) / 100).toFixed(7);
              if (parseFloat(feeAmount) > 0.0000001) {
                builder.addOperation(
                  StellarSdk.Operation.payment({
                    destination: platformWallet,
                    asset: op.sendAsset || op.asset,
                    amount: feeAmount,
                  }),
                );
                feeInfo = {
                  feePercent,
                  feeAmount,
                  asset: op.sendAsset?.getCode?.() || "XLM",
                };
              }
            }
          }

          builder.setTimeout(300);
          xdr = builder.build().toXDR();
        } catch (feeErr: any) {
          console.warn(
            "[swap/build] Fee injection failed, returning without fee:",
            feeErr.message,
          );
        }
      }

      return {
        xdr,
        networkPassphrase,
        fee: feeInfo,
      };
    },
  );

  // ═══════════════════════════════════════
  // Wallet Routes
  // ═══════════════════════════════════════

  app.get(
    "/api/v1/wallet/:publicKey",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["Wallet"],
        summary: "Get account info from Horizon",
        params: {
          type: "object",
          properties: {
            publicKey: { type: "string" },
          },
          required: ["publicKey"],
        },
        response: {
          200: {
            description: "Stellar account info",
            type: "object",
            properties: {
              publicKey: { type: "string" },
              balances: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
              sequence: { type: "string" },
              subentryCount: { type: "number" },
            },
          },
        },
      },
    },
    async (request) => {
      const { publicKey } = request.params as any;
      const { stellarClient } = await import("./lib/stellar-client");

      try {
        const account = await stellarClient.horizon.loadAccount(publicKey);
        return {
          publicKey,
          balances: account.balances,
          sequence: account.sequence,
          subentryCount: account.subentry_count,
        };
      } catch (error: any) {
        return { error: "Account not found or not funded" };
      }
    },
  );

  app.post(
    "/api/v1/wallet/fund",
    {
      config: { rateLimit: { max: 3, timeWindow: "10 minutes" } },
      schema: {
        tags: ["Wallet"],
        summary: "Fund testnet account via Friendbot",
        body: {
          type: "object",
          properties: {
            publicKey: { type: "string" },
          },
          required: ["publicKey"],
        },
        response: {
          200: {
            description: "Friendbot funding result",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", additionalProperties: true },
            },
          },
          429: {
            description: "Rate limit exceeded",
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (request) => {
      const { publicKey } = request.body as any;

      if (config.STELLAR_NETWORK !== "testnet") {
        return { error: "Funding only available on testnet" };
      }

      try {
        const res = await fetch(
          `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`,
        );
        const data = await res.json();
        return { success: true, data };
      } catch (error: any) {
        return {
          error:
            config.NODE_ENV === "production"
              ? "Operation failed"
              : error.message,
        };
      }
    },
  );

  // ═══════════════════════════════════════
  // Transaction Routes
  // ═══════════════════════════════════════

  app.post(
    "/api/v1/transactions/submit",
    {
      preHandler: authMiddleware,
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ["Transactions"],
        summary: "Submit a signed transaction",
        body: {
          type: "object",
          properties: {
            signedXdr: {
              type: "string",
              description: "Signed transaction XDR",
            },
          },
          required: ["signedXdr"],
        },
        response: {
          200: {
            description: "Submission result",
            type: "object",
            properties: {
              success: { type: "boolean" },
              result: { type: "object", additionalProperties: true },
            },
          },
        },
        401: { type: "object", properties: { error: { type: "string" } } },
        429: {
          description: "Rate limit exceeded",
          type: "object",
          properties: { error: { type: "string" } },
        },
      },
    },
    async (request) => {
      const { signedXdr } = request.body as any;
      const { stellarClient } = await import("./lib/stellar-client");

      try {
        const tx = stellarClient.stellar.decodeTransaction(signedXdr);
        const result = await stellarClient.wallet
          .stellar()
          .submitTransaction(tx);
        await auditLog("transaction_submit", {
          userId: request.user?.userId,
          ip: request.ip,
        });
        return { success: true, result };
      } catch (error: any) {
        return {
          error:
            config.NODE_ENV === "production"
              ? "Transaction submission failed"
              : error.message || "Transaction submission failed",
        };
      }
    },
  );

  // ═══════════════════════════════════════
  // Delegated Signing
  // ═══════════════════════════════════════
  app.post(
    "/api/v1/transactions/sign",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Signing"],
        summary: "Server-side transaction signing (delegated mode)",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            xdr: { type: "string", description: "Unsigned transaction XDR" },
            networkPassphrase: { type: "string" },
            pin: {
              type: "string",
              description: "PIN to decrypt wallet secret",
            },
          },
          required: ["xdr", "pin"],
        },
        response: {
          200: {
            description: "Signed transaction",
            type: "object",
            properties: {
              signedXdr: {
                type: "string",
                description: "Signed transaction XDR",
              },
              networkPassphrase: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      console.log("[sign-and-submit] userId:", userId);
      const {
        xdr,
        networkPassphrase: clientPassphrase,
        pin,
      } = request.body as {
        xdr: string;
        networkPassphrase?: string;
        pin?: string;
      };

      if (!xdr) {
        return reply.status(400).send({ error: "xdr is required" });
      }

      try {
        const [user] = await db
          .select({ signingMode: schema.users.signingMode })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);

        if (!user || user.signingMode !== "delegated") {
          return reply.status(403).send({
            error:
              "Delegated signing is not enabled. Enable it in Settings → Signing Mode.",
          });
        }

        const [wallet] = await db
          .select()
          .from(schema.userWallets)
          .where(
            and(
              eq(schema.userWallets.userId, userId),
              eq(schema.userWallets.isActive, true),
            ),
          )
          .limit(1);

        if (!wallet) {
          return reply.status(404).send({ error: "No active wallet found" });
        }

        if (!wallet.encryptedSecret) {
          return reply.status(400).send({
            error:
              "No secret key stored on server for this wallet. Re-import your wallet to enable delegated signing.",
          });
        }

        const { stellarClient } = await import("./lib/stellar-client");
        const passphrase = clientPassphrase || stellarClient.networkPassphrase;

        const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, passphrase);

        const txSource =
          tx instanceof StellarSdk.FeeBumpTransaction
            ? tx.innerTransaction.source
            : tx.source;
        if (txSource !== wallet.publicKey) {
          return reply.status(403).send({
            error: "Transaction source does not match your active wallet",
          });
        }

        // Decrypt the wallet secret using PIN (required — no raw fallback)
        let secretKey: string;
        try {
          secretKey = await decryptSecret(wallet.encryptedSecret!, pin);
        } catch (decryptErr: any) {
          return reply.status(403).send({
            error:
              "Invalid PIN — could not decrypt wallet: " + decryptErr.message,
          });
        }
        const keypair = StellarSdk.Keypair.fromSecret(secretKey);
        tx.sign(keypair);

        const signedXdr = tx.toXDR();

        return { signedXdr, networkPassphrase: passphrase };
      } catch (error: any) {
        return reply.status(500).send({
          error:
            config.NODE_ENV === "production"
              ? "Failed to sign transaction"
              : error.message || "Failed to sign transaction",
        });
      }
    },
  );

  app.post(
    "/api/v1/transactions/sign-and-submit",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Signing"],
        summary: "Server-side sign and submit (delegated mode)",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            xdr: { type: "string" },
            networkPassphrase: { type: "string" },
            pin: {
              type: "string",
              description: "PIN to decrypt wallet secret",
            },
          },
          required: ["xdr", "pin"],
        },
        response: {
          200: {
            description: "Sign and submit result",
            type: "object",
            properties: {
              success: { type: "boolean" },
              result: { type: "object", additionalProperties: true },
              fee: {
                type: "object",
                nullable: true,
                properties: {
                  feePercent: { type: "number" },
                  platformWallet: { type: "string" },
                  feeOperations: { type: "array", items: { type: "object" } },
                },
              },
              feeBumped: { type: "boolean" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          403: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      console.log("[sign-and-submit] userId:", userId);
      const {
        xdr,
        networkPassphrase: clientPassphrase,
        pin,
      } = request.body as {
        xdr: string;
        networkPassphrase?: string;
        pin?: string;
      };

      if (!xdr) {
        return reply.status(400).send({ error: "xdr is required" });
      }

      try {
        const [user] = await db
          .select({ signingMode: schema.users.signingMode })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);

        if (!user || user.signingMode !== "delegated") {
          return reply
            .status(403)
            .send({ error: "Delegated signing is not enabled." });
        }

        const [wallet] = await db
          .select()
          .from(schema.userWallets)
          .where(
            and(
              eq(schema.userWallets.userId, userId),
              eq(schema.userWallets.isActive, true),
            ),
          )
          .limit(1);

        console.log(
          "[sign-and-submit] wallet:",
          wallet?.publicKey,
          "hasSecret:",
          !!wallet?.encryptedSecret,
        );
        if (!wallet || !wallet.encryptedSecret) {
          return reply
            .status(400)
            .send({ error: "No secret key stored on server" });
        }

        const { stellarClient } = await import("./lib/stellar-client");
        const passphrase = clientPassphrase || stellarClient.networkPassphrase;

        const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, passphrase);

        const txSource =
          tx instanceof StellarSdk.FeeBumpTransaction
            ? tx.innerTransaction.source
            : tx.source;
        if (txSource !== wallet.publicKey) {
          return reply.status(403).send({
            error: "Transaction source does not match your active wallet",
          });
        }

        // ── Platform Fee Injection ──
        const feePercent = config.PLATFORM_FEE_PERCENT || 0;
        const platformWallet = config.PLATFORM_WALLET;
        const platformSecret = config.PLATFORM_SECRET;
        let finalTx = tx;
        let feeDetails: any = null;

        if (
          feePercent > 0 &&
          platformWallet &&
          platformSecret &&
          !(tx instanceof StellarSdk.FeeBumpTransaction)
        ) {
          try {
            // Calculate fees from payment operations
            const ops = tx.operations || [];
            const feeOps: any[] = [];
            for (const op of ops) {
              // Only charge platform fee on swaps (path payments), not on direct transfers
              if (
                (op.type === "pathPaymentStrictSend" ||
                  op.type === "pathPaymentStrictReceive") &&
                op.amount
              ) {
                const amount = parseFloat(op.amount);
                const feeAmount = ((amount * feePercent) / 100).toFixed(7);
                if (parseFloat(feeAmount) > 0.0000001) {
                  // Reduce original amount by fee (fee taken WITHIN amount)
                  const netAmount = (amount - parseFloat(feeAmount)).toFixed(7);
                  feeOps.push({
                    asset: op.asset,
                    amount: feeAmount,
                    originalAmount: op.amount,
                    netAmount,
                    opIndex: ops.indexOf(op),
                  });
                }
              }
            }

            if (feeOps.length > 0) {
              // Rebuild transaction with fee operations appended
              const account = await stellarClient.stellar.loadAccount(
                wallet.publicKey,
              );
              const builder = new StellarSdk.TransactionBuilder(account, {
                fee: tx.fee,
                networkPassphrase: passphrase,
              });

              // Re-add original operations with adjusted amounts
              for (let i = 0; i < ops.length; i++) {
                const feeOp = feeOps.find((f) => f.opIndex === i);
                if (feeOp) {
                  // Rebuild this op with reduced amount
                  const op = ops[i];
                  if (op.type === "payment") {
                    builder.addOperation(
                      StellarSdk.Operation.payment({
                        destination: op.destination,
                        asset: op.asset,
                        amount: feeOp.netAmount,
                        source: op.source || undefined,
                      }),
                    );
                  } else if (op.type === "pathPaymentStrictSend") {
                    builder.addOperation(
                      StellarSdk.Operation.pathPaymentStrictSend({
                        sendAsset: op.sendAsset,
                        sendAmount: feeOp.netAmount,
                        destination: op.destination,
                        destAsset: op.destAsset,
                        destMin: op.destMin,
                        path: op.path || [],
                        source: op.source || undefined,
                      }),
                    );
                  } else {
                    builder.addOperation(
                      StellarSdk.Operation.fromXDRObject(op.toXDRObject()),
                    );
                  }
                } else {
                  builder.addOperation(
                    StellarSdk.Operation.fromXDRObject(op.toXDRObject()),
                  );
                }
              }

              // Add platform fee operations
              for (const feeOp of feeOps) {
                builder.addOperation(
                  StellarSdk.Operation.payment({
                    destination: platformWallet,
                    asset: feeOp.asset,
                    amount: feeOp.amount,
                  }),
                );
              }

              builder.setTimeout(300);
              finalTx = builder.build();

              feeDetails = {
                feePercent,
                feeOperations: feeOps.map((f) => ({
                  asset: f.asset.isNative() ? "XLM" : f.asset.getCode(),
                  amount: f.amount,
                  originalAmount: f.originalAmount,
                })),
                platformWallet,
              };
            }
          } catch (feeErr: any) {
            console.warn(
              "Fee injection failed, submitting without fee:",
              feeErr.message,
            );
            // Continue without fee — don't block the user's transaction
          }
        }

        // Sign with user's key — PIN required, no raw fallback
        let secretKey: string;
        try {
          secretKey = await decryptSecret(wallet.encryptedSecret!, pin);
        } catch (decryptErr: any) {
          console.error(
            "[sign-and-submit] DECRYPT ERROR:",
            decryptErr.message,
            decryptErr.stack?.split("\n").slice(0, 3).join(" | "),
          );
          return reply.status(403).send({
            error:
              "Invalid PIN — could not decrypt wallet: " + decryptErr.message,
          });
        }
        const keypair = StellarSdk.Keypair.fromSecret(secretKey);
        finalTx.sign(keypair);

        // If we added fee ops, also sign with platform key
        if (feeDetails && platformSecret) {
          try {
            const platformKeypair =
              StellarSdk.Keypair.fromSecret(platformSecret);
            finalTx.sign(platformKeypair);
          } catch (e: any) {
            console.warn("Platform signing failed:", e.message);
          }
        }

        // Wrap in FeeBumpTransaction — platform pays the Stellar network fee
        let txToSubmit: any = finalTx;
        if (platformSecret) {
          try {
            const platformKeypair =
              StellarSdk.Keypair.fromSecret(platformSecret);
            const feeBump =
              StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
                platformKeypair, // fee source — platform pays
                StellarSdk.BASE_FEE, // max fee per operation
                finalTx, // inner transaction (already signed)
                passphrase,
              );
            feeBump.sign(platformKeypair);
            txToSubmit = feeBump;
            console.log(
              "[delegated] Fee bump applied — platform pays network fee",
            );
          } catch (fbErr: any) {
            console.warn(
              "[delegated] Fee bump failed, submitting as-is:",
              fbErr.message,
            );
            // Fall back to user-paid fee if fee bump fails
          }
        }

        const result = await stellarClient.wallet
          .stellar()
          .submitTransaction(
            stellarClient.stellar.decodeTransaction(txToSubmit.toXDR()),
          );

        await auditLog("transaction_sign", {
          userId: request.user?.userId,
          ip: request.ip,
        });

        return {
          success: true,
          result,
          fee: feeDetails,
          feeBumped: txToSubmit !== finalTx,
        };
      } catch (error: any) {
        console.error(
          "[sign-and-submit] ERROR:",
          error.message,
          error.stack?.split("\n").slice(0, 3).join(" | "),
        );
        console.error(
          "[sign-and-submit] FULL ERROR:",
          error.message,
          "\n",
          error.stack,
        );
        return reply.status(500).send({
          error:
            config.NODE_ENV === "production"
              ? "Failed to sign and submit"
              : error.message || "Failed to sign and submit",
        });
      }
    },
  );

  app.patch(
    "/api/v1/user/signing-mode",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Signing"],
        summary: "Update signing mode preference",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["self", "delegated"] },
          },
          required: ["mode"],
        },
        response: {
          200: {
            description: "Updated signing mode",
            type: "object",
            properties: {
              signingMode: { type: "string", enum: ["self", "delegated"] },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { mode } = request.body as { mode: string };

      if (mode !== "self" && mode !== "delegated") {
        return reply
          .status(400)
          .send({ error: "Mode must be 'self' or 'delegated'" });
      }

      if (mode === "delegated") {
        const [wallet] = await db
          .select({ encryptedSecret: schema.userWallets.encryptedSecret })
          .from(schema.userWallets)
          .where(
            and(
              eq(schema.userWallets.userId, userId),
              eq(schema.userWallets.isActive, true),
            ),
          )
          .limit(1);

        if (!wallet?.encryptedSecret) {
          return reply.status(400).send({
            error:
              "Cannot enable delegated signing: no secret key stored on server for your active wallet.",
          });
        }
      }

      await db
        .update(schema.users)
        .set({ signingMode: mode, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));

      return { signingMode: mode };
    },
  );

  app.get(
    "/api/v1/user/signing-mode",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Signing"],
        summary: "Get current signing mode",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            description: "Current signing mode",
            type: "object",
            properties: {
              signingMode: { type: "string", enum: ["self", "delegated"] },
            },
          },
        },
      },
    },
    async (request) => {
      const userId = request.user!.userId;

      const [user] = await db
        .select({ signingMode: schema.users.signingMode })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      return { signingMode: user?.signingMode || "self" };
    },
  );

  // Transaction history
  app.get(
    "/api/v1/transactions/:publicKey",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["Transactions"],
        summary: "Get transaction history for an account",
        params: {
          type: "object",
          properties: {
            publicKey: { type: "string" },
          },
          required: ["publicKey"],
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string", default: "20" },
            cursor: { type: "string" },
          },
        },
        response: {
          200: {
            description: "Transaction history",
            type: "object",
            properties: {
              records: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    type: { type: "string" },
                    createdAt: { type: "string" },
                    transactionHash: { type: "string" },
                    from: { type: "string" },
                    to: { type: "string" },
                    amount: { type: "string" },
                    assetCode: { type: "string" },
                  },
                },
              },
              nextCursor: { type: "string", nullable: true },
            },
          },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (req, res) => {
      const { publicKey } = req.params as { publicKey: string };
      const { limit = "20", cursor } = req.query as {
        limit?: string;
        cursor?: string;
      };

      try {
        let builder = stellar
          .operations()
          .forAccount(publicKey)
          .order("desc")
          .limit(Math.min(parseInt(limit) || 20, 100));

        if (cursor) {
          builder = builder.cursor(cursor);
        }

        const response = await builder.call();
        const records = response.records.map((op: any) => ({
          id: op.id,
          type: op.type,
          createdAt: op.created_at,
          transactionHash: op.transaction_hash,
          sourceAccount: op.source_account,
          from: op.from || op.source_account || op.funder || "",
          to: op.to || op.account || "",
          amount: op.amount || op.starting_balance || "0",
          assetCode: op.asset_code || (op.asset_type === "native" ? "XLM" : ""),
          assetIssuer: op.asset_issuer || "",
          assetType: op.asset_type || "",
        }));

        const nextCursor =
          response.records.length > 0
            ? response.records[response.records.length - 1].paging_token
            : null;

        return res.send({ records, nextCursor });
      } catch (err: any) {
        if (err?.response?.status === 404) {
          return res.send({ records: [], nextCursor: null });
        }
        req.log.error(err, "Failed to fetch transaction history");
        return res.status(500).send({ error: "Failed to fetch history" });
      }
    },
  );

  // ═══════════════════════════════════════
  // Keypair Routes
  // ═══════════════════════════════════════

  app.get(
    "/api/v1/keypair/generate",
    {
      preHandler: authMiddleware,
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["Keypair"],
        summary: "Generate a random Stellar keypair",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              publicKey: {
                type: "string",
                description: "Stellar public key (G...)",
              },
              secretKey: {
                type: "string",
                description: "Stellar secret key (S...)",
              },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } } },
          429: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const keypair = StellarSdk.Keypair.random();
      return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };
    },
  );

  app.post(
    "/api/v1/keypair/from-secret",
    {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ["Keypair"],
        summary: "Derive public key from secret key",
        body: {
          type: "object",
          properties: {
            secret: { type: "string" },
          },
          required: ["secret"],
        },
        response: {
          200: {
            description: "Derived public key",
            type: "object",
            properties: { publicKey: { type: "string" } },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          429: {
            description: "Rate limit exceeded",
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { secret } = request.body as any;
        const pair = StellarSdk.Keypair.fromSecret(secret);
        return { publicKey: pair.publicKey() };
      } catch {
        reply.status(400);
        return { error: "Invalid secret key" };
      }
    },
  );

  app.post(
    "/api/v1/keypair/validate-mnemonic",
    {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ["Keypair"],
        summary: "Validate a BIP-39 mnemonic phrase",
        body: {
          type: "object",
          properties: {
            mnemonic: { type: "string" },
          },
          required: ["mnemonic"],
        },
        response: {
          200: {
            description: "Validation result",
            type: "object",
            properties: { valid: { type: "boolean" } },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          429: {
            description: "Rate limit exceeded",
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      const { mnemonic } = request.body as { mnemonic: string };
      if (!mnemonic || typeof mnemonic !== "string") {
        return reply.status(400).send({ error: "Mnemonic is required" });
      }
      try {
        const isValid = StellarHDWallet.validateMnemonic(mnemonic.trim());
        return { valid: isValid };
      } catch {
        return { valid: false };
      }
    },
  );

  app.post(
    "/api/v1/keypair/from-mnemonic",
    {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
      schema: {
        security: [{ bearerAuth: [] }],
        tags: ["Keypair"],
        summary: "Derive keypair from mnemonic (SEP-0005)",
        body: {
          type: "object",
          properties: {
            mnemonic: { type: "string" },
            accountIndex: { type: "integer", default: 0 },
          },
          required: ["mnemonic"],
        },
        response: {
          200: {
            description: "Derived keypair from mnemonic",
            type: "object",
            properties: {
              publicKey: { type: "string" },
              secretKey: { type: "string" },
              accountIndex: { type: "number" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          429: {
            description: "Rate limit exceeded",
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      const { mnemonic, accountIndex = 0 } = request.body as {
        mnemonic: string;
        accountIndex?: number;
      };
      if (!mnemonic || typeof mnemonic !== "string") {
        return reply.status(400).send({ error: "Mnemonic is required" });
      }
      try {
        if (!StellarHDWallet.validateMnemonic(mnemonic.trim())) {
          return reply.status(400).send({ error: "Invalid mnemonic phrase" });
        }
        const wallet = StellarHDWallet.fromMnemonic(mnemonic.trim());
        return {
          publicKey: wallet.getPublicKey(accountIndex),
          secretKey: wallet.getSecret(accountIndex),
          accountIndex,
        };
      } catch (e: any) {
        return reply
          .status(400)
          .send({ error: e.message || "Invalid mnemonic" });
      }
    },
  );

  // ═══════════════════════════════════════
  // API Key Management
  // ═══════════════════════════════════════

  app.post(
    "/api/v1/api-keys",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["API Keys"],
        summary: "Create a new API key",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            name: { type: "string", description: "Friendly name for this key" },
          },
          required: ["name"],
        },
        response: {
          200: {
            description: "Created API key (shown once)",
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
              key: {
                type: "string",
                description: "Full API key — store securely, shown only once",
              },
              createdAt: { type: "string", format: "date-time" },
              message: { type: "string" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { name } = request.body as { name: string };

      if (!name || name.trim().length === 0) {
        return reply.status(400).send({ error: "Name is required" });
      }

      const key = `amma_${crypto.randomBytes(32).toString("hex")}`;

      const [apiKey] = await db
        .insert(schema.apiKeys)
        .values({
          userId,
          name: name.trim(),
          key,
        })
        .returning();

      return {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key,
        createdAt: apiKey.createdAt,
        message:
          "Store this key securely — it will not be shown again in full.",
      };
    },
  );

  app.get(
    "/api/v1/api-keys",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["API Keys"],
        summary: "List your API keys",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            description: "List of API keys (key truncated)",
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                name: { type: "string" },
                keyPreview: { type: "string" },
                isActive: { type: "boolean" },
                lastUsedAt: {
                  type: "string",
                  format: "date-time",
                  nullable: true,
                },
                createdAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const userId = request.user!.userId;

      const keys = await db
        .select({
          id: schema.apiKeys.id,
          name: schema.apiKeys.name,
          keyPreview: schema.apiKeys.key,
          isActive: schema.apiKeys.isActive,
          lastUsedAt: schema.apiKeys.lastUsedAt,
          createdAt: schema.apiKeys.createdAt,
        })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.userId, userId));

      return keys.map((k) => ({
        ...k,
        keyPreview: `${k.keyPreview.slice(0, 10)}...${k.keyPreview.slice(-4)}`,
      }));
    },
  );

  app.delete(
    "/api/v1/api-keys/:id",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["API Keys"],
        summary: "Revoke an API key",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Key revoked",
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      const result = await db
        .update(schema.apiKeys)
        .set({ isActive: false })
        .where(
          and(
            eq(schema.apiKeys.id, parseInt(id)),
            eq(schema.apiKeys.userId, userId),
          ),
        )
        .returning();

      if (result.length === 0) {
        return reply.status(404).send({ error: "API key not found" });
      }

      return { success: true, message: "API key revoked" };
    },
  );

  // ──────────────────────────────────────────
  // STELLAR EXPERT ASSET SEARCH PROXY
  // ──────────────────────────────────────────
  app.get(
    "/api/v1/tokens/search-assets",
    {
      schema: {
        tags: ["Tokens"],
        summary: "Search assets by code/name via StellarExpert + local DB",
        querystring: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Asset code or name to search",
            },
            limit: { type: "string", default: "20" },
          },
          required: ["query"],
        },
        // Response schema removed — dynamic shape from multiple sources
      },
    },
    async (request, reply) => {
      const { query, limit } = request.query as {
        query: string;
        limit?: string;
      };
      if (!query || query.length < 1) {
        return reply.status(400).send({ error: "Query is required" });
      }

      const results: any[] = [];
      const seen = new Set<string>();

      // 1. Search local DB first
      try {
        const local = await tokenService.search({
          query,
          limit: parseInt(limit || "20"),
        });
        const localTokens = Array.isArray(local)
          ? local
          : (local as any).tokens || [];
        for (const t of localTokens) {
          const key = `${t.assetCode}-${t.assetIssuer}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              assetCode: t.assetCode,
              assetIssuer: t.assetIssuer || "",
              assetType: t.assetType || "credit_alphanum4",
              tomlName: t.tomlName || "",
              tomlImage: t.tomlImage || t.image || "",
              domain: t.homeDomain || "",
              isVerified: t.isVerified || false,
              ratingAverage: t.ratingAverage || null,
              trustlinesFunded: t.fundedTrustlines || null,
              source: "local",
            });
          }
        }
      } catch {}

      // 2. Search StellarExpert
      try {
        const res = await fetch(
          `https://api.stellar.expert/explorer/public/asset?search=${encodeURIComponent(query)}&limit=${limit || "20"}&order=desc`,
        );
        if (res.ok) {
          const data = await res.json();
          const records = data._embedded?.records || [];
          for (const r of records) {
            const raw = r.asset || "";
            const firstDash = raw.indexOf("-");
            const lastDash = raw.lastIndexOf("-");
            const code = firstDash > 0 ? raw.substring(0, firstDash) : raw;
            const issuer =
              firstDash > 0 && lastDash > firstDash
                ? raw.substring(firstDash + 1, lastDash)
                : firstDash > 0
                  ? raw.substring(firstDash + 1)
                  : "";
            const key = `${code}-${issuer}`;
            if (!seen.has(key) && code !== "XLM") {
              seen.add(key);
              results.push({
                assetCode: code,
                assetIssuer: issuer,
                assetType: "credit_alphanum4",
                tomlName: r.tomlInfo?.name || r.tomlInfo?.orgName || "",
                tomlImage: r.tomlInfo?.image || "",
                domain: r.domain || "",
                isVerified: (r.rating?.average ?? 0) >= 6,
                ratingAverage: r.rating?.average ?? null,
                trustlinesFunded: r.trustlines?.funded ?? null,
                source: "stellar_expert",
              });
            }
          }
        }
      } catch {}

      // 3. Search Horizon assets
      try {
        const horizonUrl = config.HORIZON_URL || "https://horizon.stellar.org";
        const res = await fetch(
          `${horizonUrl}/assets?asset_code=${encodeURIComponent(query.toUpperCase())}&limit=10`,
        );
        if (res.ok) {
          const data = await res.json();
          const records = data._embedded?.records || [];
          for (const r of records) {
            const key = `${r.asset_code}-${r.asset_issuer}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push({
                assetCode: r.asset_code,
                assetIssuer: r.asset_issuer,
                assetType: r.asset_type,
                tomlName: "",
                tomlImage: "",
                domain: r._links?.toml?.href
                  ? new URL(r._links.toml.href).hostname
                  : "",
                isVerified: false,
                ratingAverage: null,
                trustlinesFunded: r.num_accounts || null,
                source: "horizon",
              });
            }
          }
        }
      } catch {}

      return { results, total: results.length };
    },
  );

  // ═══════════════════════════════════════
  // Start
  // ═══════════════════════════════════════

  // ═══════════════════════════════════════
  // Admin: Auto-Liquifier
  // ═══════════════════════════════════════
  app.post(
    "/api/v1/admin/liquify",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Admin"],
        summary: "Convert all non-XLM platform fees to XLM via DEX",
        description:
          "Triggers the auto-liquifier to swap all non-XLM tokens in the platform wallet to XLM. Admin only.",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              converted: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    asset: { type: "string" },
                    amount: { type: "string" },
                    xlmReceived: { type: "string" },
                    txHash: { type: "string" },
                  },
                },
              },
              skipped: { type: "array", items: { type: "string" } },
              errors: { type: "array", items: { type: "string" } },
              cleanedTrustlines: { type: "array", items: { type: "string" } },
            },
          },
          403: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      // Admin check — only user ID 1 (you)
      const userId = request.user!.userId;
      if (userId !== 1) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      console.log("[admin] Liquifier triggered by user", userId);
      const result = await liquifyPlatformFees();
      const cleanedTrustlines = await cleanupEmptyTrustlines();

      return { ...result, cleanedTrustlines };
    },
  );

  app.get(
    "/api/v1/admin/platform-balance",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Admin"],
        summary: "Get platform wallet balances",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              publicKey: { type: "string" },
              balances: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    asset: { type: "string" },
                    balance: { type: "string" },
                    issuer: { type: "string" },
                  },
                },
              },
              totalNonXlm: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      if (userId !== 1) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      try {
        const { stellarClient } = await import("./lib/stellar-client");
        const account = await stellarClient.horizon.loadAccount(
          config.PLATFORM_WALLET,
        );
        const balances = account.balances.map((b: any) => ({
          asset: b.asset_type === "native" ? "XLM" : b.asset_code,
          balance: b.balance,
          issuer: b.asset_issuer || "",
        }));
        const totalNonXlm = balances.filter(
          (b: any) => b.asset !== "XLM" && parseFloat(b.balance) > 0,
        ).length;
        return { publicKey: config.PLATFORM_WALLET, balances, totalNonXlm };
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    },
  );

  // ═══════════════════════════════════════
  // Admin — Audit Logs
  // ═══════════════════════════════════════
  app.get(
    "/api/v1/admin/audit-logs",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Admin"],
        summary: "View audit logs (admin only)",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", default: 50, minimum: 1, maximum: 200 },
            offset: { type: "integer", default: 0, minimum: 0 },
            action: { type: "string", description: "Filter by action type" },
            userId: { type: "integer", description: "Filter by user ID" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              logs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "number" },
                    userId: { type: "number", nullable: true },
                    action: { type: "string" },
                    detail: { type: "object" },
                    ipAddress: { type: "string", nullable: true },
                    createdAt: { type: "string" },
                  },
                },
              },
              total: { type: "number" },
            },
          },
          403: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;

      // Check if user is admin (id = 1 or has admin role)
      const [user] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      // Simple admin check — user ID 1 is admin (extend as needed)
      if (!user || user.id !== 1) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const {
        limit = 50,
        offset = 0,
        action,
        userId: filterUserId,
      } = request.query as any;
      const conditions: any[] = [];

      if (action) {
        conditions.push(eq(schema.auditLogs.action, action));
      }
      if (filterUserId) {
        conditions.push(eq(schema.auditLogs.userId, parseInt(filterUserId)));
      }

      const where =
        conditions.length > 0
          ? conditions.length === 1
            ? conditions[0]
            : and(...conditions)
          : undefined;

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(where)
        .orderBy(sql`created_at DESC`)
        .limit(Math.min(limit, 200))
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.auditLogs)
        .where(where);

      return { logs, total: Number(count) };
    },
  );

  // ═══════════════════════════════════════
  // Cleanup Jobs
  // ═══════════════════════════════════════

  // Purge expired refresh tokens every hour
  setInterval(
    async () => {
      try {
        const result = await db.execute(
          sql`DELETE FROM refresh_tokens WHERE expires_at < NOW()`,
        );
        console.log("[cleanup] Purged expired refresh tokens");
      } catch (err: any) {
        console.error("[cleanup] refresh token purge failed:", err.message);
      }
    },
    60 * 60 * 1000,
  ); // every hour

  // Purge expired/used password reset tokens every 6 hours
  setInterval(
    async () => {
      try {
        await db.execute(
          sql`DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used_at IS NOT NULL`,
        );
        console.log("[cleanup] Purged expired password reset tokens");
      } catch (err: any) {
        console.error(
          "[cleanup] password reset token purge failed:",
          err.message,
        );
      }
    },
    6 * 60 * 60 * 1000,
  ); // every 6 hours

  // Purge audit logs older than 90 days — runs daily
  setInterval(
    async () => {
      try {
        await db.execute(
          sql`DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'`,
        );
        console.log("[cleanup] Purged audit logs older than 90 days");
      } catch (err: any) {
        console.error("[cleanup] audit log purge failed:", err.message);
      }
    },
    24 * 60 * 60 * 1000,
  ); // every 24 hours

  // Auto-liquifier scheduled task — runs every 6 hours
  setInterval(
    async () => {
      try {
        console.log("[liquifier] Scheduled run starting...");
        const result = await liquifyPlatformFees();
        if (result.converted.length > 0) {
          console.log(
            `[liquifier] Converted ${result.converted.length} asset(s)`,
          );
          await cleanupEmptyTrustlines();
        } else {
          console.log("[liquifier] No assets to convert");
        }
      } catch (err: any) {
        console.error("[liquifier] Scheduled run failed:", err.message);
      }
    },
    6 * 60 * 60 * 1000,
  ); // Every 6 hours

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  syncTomlImages().catch(console.error);
  console.log(`\n  Amma Wallet API running on http://localhost:${config.PORT}`);
  console.log(`  Network: ${config.STELLAR_NETWORK}`);
  console.log(`  Horizon: ${config.HORIZON_URL}`);
  console.log(`  API Docs: http://localhost:${config.PORT}/docs\n`);

  // Run token indexer on startup, then every 15 min
  runTokenIndexer().catch(console.error);
  setInterval(() => runTokenIndexer().catch(console.error), 15 * 60 * 1000);

  // Monthly maintenance billing — run on startup and every hour.
  // Idempotent: monthly_maintenance_snapshots unique constraint prevents double-charge.
  checkAndRunMonthlyMaintenance().catch(console.error);
  setInterval(() => checkAndRunMonthlyMaintenance().catch(console.error), 60 * 60 * 1000);

  // Auto-suspension enforcement — run on startup and every hour.
  // Detects debt_limit / maintenance_grace_expired conditions; also recovers cleared tenants.
  checkAndRunAutoSuspension().catch(console.error);
  setInterval(() => checkAndRunAutoSuspension().catch(console.error), 60 * 60 * 1000);
  setInterval(
    () => {
      syncTomlImages().catch(console.error);
    },
    6 * 60 * 60 * 1000,
  );
}

bootstrap().catch(console.error);
