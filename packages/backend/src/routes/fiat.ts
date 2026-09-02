import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth";
import { auditLog } from "../lib/audit";
import { config } from "../config";

export async function fiatRampRoutes(app: FastifyInstance) {

  // ── Provider availability ──────────────────────────────────

  app.get("/api/v1/fiat/providers", {
    schema: {
      tags: ["Fiat Ramp"],
      summary: "List available fiat on/off-ramp providers",
      response: {
        200: {
          type: "object" as const,
          properties: {
            providers: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  id: { type: "string" as const },
                  name: { type: "string" as const },
                  type: { type: "string" as const },
                  enabled: { type: "boolean" as const },
                  regions: { type: "array" as const, items: { type: "string" as const } },
                  methods: { type: "array" as const, items: { type: "string" as const } },
                  supportsBuy: { type: "boolean" as const },
                  supportsSell: { type: "boolean" as const },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    return {
      providers: [
        {
          id: "stripe",
          name: "Stripe Crypto Onramp",
          type: "embedded",
          enabled: config.stripe.onrampEnabled,
          regions: ["US", "EU"],
          methods: ["card", "bank_transfer"],
          supportsBuy: true,
          supportsSell: false,
        },
        {
          id: "transak",
          name: "Transak",
          type: "redirect",
          enabled: config.transak.enabled,
          regions: ["global"],
          methods: ["card", "bank_transfer", "mobile_money", "apple_pay", "google_pay"],
          supportsBuy: true,
          supportsSell: true,
        },
        {
          id: "moneygram",
          name: "MoneyGram",
          type: "sep24",
          enabled: true,
          regions: ["global"],
          methods: ["cash"],
          supportsBuy: true,
          supportsSell: true,
        },
        {
          id: "direct",
          name: "Direct Quote",
          type: "internal",
          enabled: true,
          regions: ["global"],
          methods: ["bank_transfer"],
          supportsBuy: true,
          supportsSell: true,
        },
      ],
    };
  });

  // ── Supported currencies ───────────────────────────────────

  app.get("/api/v1/fiat/currencies", {
    schema: {
      tags: ["Fiat Ramp"],
      summary: "List supported fiat currencies with estimated XLM rates",
      response: {
        200: {
          type: "object" as const,
          properties: {
            currencies: { type: "array" as const, items: { type: "object" as const, additionalProperties: true } },
            feePercent: { type: "number" as const },
            provider: { type: "string" as const },
          },
        },
      },
    },
  }, async () => {
    return {
      currencies: [
        { code: "USD", name: "US Dollar", symbol: "$", minBuy: 10, maxBuy: 10000, minSell: 10, maxSell: 10000 },
        { code: "EUR", name: "Euro", symbol: "\u20ac", minBuy: 10, maxBuy: 10000, minSell: 10, maxSell: 10000 },
        { code: "GBP", name: "British Pound", symbol: "\u00a3", minBuy: 10, maxBuy: 10000, minSell: 10, maxSell: 10000 },
        { code: "ZAR", name: "South African Rand", symbol: "R", minBuy: 100, maxBuy: 100000, minSell: 100, maxSell: 100000 },
        { code: "NGN", name: "Nigerian Naira", symbol: "\u20a6", minBuy: 5000, maxBuy: 5000000, minSell: 5000, maxSell: 5000000 },
        { code: "KES", name: "Kenyan Shilling", symbol: "KSh", minBuy: 1000, maxBuy: 500000, minSell: 1000, maxSell: 500000 },
        { code: "BRL", name: "Brazilian Real", symbol: "R$", minBuy: 50, maxBuy: 50000, minSell: 50, maxSell: 50000 },
      ],
      feePercent: config.FIAT_RAMP_FEE_PERCENT,
      provider: config.FIAT_RAMP_PROVIDER,
    };
  });

  // ── Buy Quote ──────────────────────────────────────────────

  app.post("/api/v1/fiat/quote/buy", {
    preHandler: authMiddleware,
    schema: {
      tags: ["Fiat Ramp"],
      summary: "Get a quote to buy XLM or tokens with fiat",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object" as const,
        required: ["fiatCurrency", "fiatAmount"] as const,
        properties: {
          fiatCurrency: { type: "string" as const },
          fiatAmount: { type: "number" as const },
          targetAsset: { type: "string" as const, default: "XLM" },
        },
      },
    },
  }, async (request) => {
    const { fiatCurrency, fiatAmount, targetAsset } = request.body as any;
    const asset = targetAsset || "XLM";

    let xlmPrice = 0.09;
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=" + fiatCurrency.toLowerCase());
      const data = await res.json();
      if (data.stellar?.[fiatCurrency.toLowerCase()]) {
        xlmPrice = data.stellar[fiatCurrency.toLowerCase()];
      }
    } catch {}

    const feeAmount = fiatAmount * (config.FIAT_RAMP_FEE_PERCENT / 100);
    const netFiat = fiatAmount - feeAmount;
    const estimatedXlm = xlmPrice > 0 ? netFiat / xlmPrice : 0;

    return {
      fiatCurrency, fiatAmount, targetAsset: asset,
      estimatedAmount: estimatedXlm.toFixed(7),
      rate: xlmPrice.toFixed(8),
      fee: feeAmount.toFixed(2),
      feePercent: config.FIAT_RAMP_FEE_PERCENT,
      totalFiat: fiatAmount,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      quoteId: crypto.randomUUID(),
    };
  });

  // ── Sell Quote ─────────────────────────────────────────────

  app.post("/api/v1/fiat/quote/sell", {
    preHandler: authMiddleware,
    schema: {
      tags: ["Fiat Ramp"],
      summary: "Get a quote to sell XLM or tokens for fiat",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object" as const,
        required: ["fiatCurrency", "cryptoAmount"] as const,
        properties: {
          fiatCurrency: { type: "string" as const },
          cryptoAmount: { type: "number" as const },
          sourceAsset: { type: "string" as const, default: "XLM" },
        },
      },
    },
  }, async (request) => {
    const { fiatCurrency, cryptoAmount, sourceAsset } = request.body as any;
    const asset = sourceAsset || "XLM";

    let xlmPrice = 0.09;
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=" + fiatCurrency.toLowerCase());
      const data = await res.json();
      if (data.stellar?.[fiatCurrency.toLowerCase()]) {
        xlmPrice = data.stellar[fiatCurrency.toLowerCase()];
      }
    } catch {}

    const grossFiat = cryptoAmount * xlmPrice;
    const feeAmount = grossFiat * (config.FIAT_RAMP_FEE_PERCENT / 100);
    const netFiat = grossFiat - feeAmount;

    return {
      fiatCurrency, sourceAsset: asset, cryptoAmount,
      estimatedFiat: grossFiat.toFixed(2),
      rate: xlmPrice.toFixed(8),
      fee: feeAmount.toFixed(2),
      feePercent: config.FIAT_RAMP_FEE_PERCENT,
      netFiat: netFiat.toFixed(2),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      quoteId: crypto.randomUUID(),
    };
  });

  // ── Stripe Crypto Onramp Session ───────────────────────────

  app.post("/api/v1/fiat/stripe/session", {
    preHandler: authMiddleware,
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    schema: {
      tags: ["Fiat Ramp"],
      summary: "Create a Stripe Crypto Onramp session",
      description: "Creates a Stripe onramp session that embeds in the frontend. The user completes KYC and payment through Stripe's UI. Crypto is delivered to the specified wallet address.",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object" as const,
        required: ["walletAddress"] as const,
        properties: {
          walletAddress: { type: "string" as const, description: "Stellar public key to receive crypto" },
          destinationCurrency: { type: "string" as const, default: "usdc", description: "Crypto to buy: usdc, eth, sol, btc" },
          destinationNetwork: { type: "string" as const, default: "stellar", description: "Network: stellar, ethereum, solana" },
          sourceCurrency: { type: "string" as const, description: "Fiat currency code (e.g. usd)" },
          sourceAmount: { type: "number" as const, description: "Fiat amount to spend" },
        },
      },
      response: {
        200: {
          type: "object" as const,
          properties: {
            clientSecret: { type: "string" as const },
            publishableKey: { type: "string" as const },
            sessionId: { type: "string" as const },
          },
        },
        503: { type: "object" as const, properties: { error: { type: "string" as const } } },
      },
    },
  }, async (request: any, reply) => {
    if (!config.stripe.onrampEnabled || !config.stripe.secretKey) {
      return reply.status(503).send({ error: "Stripe onramp is not configured" });
    }

    const userId = request.user!.userId;
    const { walletAddress, destinationCurrency, destinationNetwork, sourceCurrency, sourceAmount } = request.body as any;

    try {
      // Create onramp session via Stripe API
      const params = new URLSearchParams();
      params.append("wallet_addresses[stellar]", walletAddress);
      if (destinationCurrency) params.append("destination_currency", destinationCurrency);
      if (destinationNetwork) params.append("destination_network", destinationNetwork || "stellar");
      if (sourceCurrency) params.append("source_currency", sourceCurrency);
      if (sourceAmount) params.append("source_amount", String(Math.round(sourceAmount * 100))); // cents

      const res = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(config.stripe.secretKey + ":").toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[fiat] Stripe onramp session error:", err);
        return reply.status(res.status === 400 ? 400 : 503).send({
          error: (err as any)?.error?.message || "Failed to create onramp session",
        });
      }

      const session = await res.json() as any;

      await auditLog("fiat_stripe_session", {
        userId,
        detail: {
          sessionId: session.id,
          walletAddress,
          destinationCurrency: destinationCurrency || "usdc",
        },
        ip: request.ip,
      });

      return {
        clientSecret: session.client_secret,
        publishableKey: config.stripe.publishableKey,
        sessionId: session.id,
      };
    } catch (err: any) {
      console.error("[fiat] Stripe onramp error:", err.message);
      return reply.status(503).send({ error: "Stripe service unavailable" });
    }
  });

  // ── Transak URL Generator ─────────────────────────────────

  app.post("/api/v1/fiat/transak/url", {
    preHandler: authMiddleware,
    schema: {
      tags: ["Fiat Ramp"],
      summary: "Generate a Transak widget URL for buy or sell",
      description: "Returns a pre-configured Transak URL the frontend opens in a popup/iframe. Transak handles KYC and payment. Supports 160+ countries, card, bank, mobile money.",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object" as const,
        required: ["walletAddress"] as const,
        properties: {
          walletAddress: { type: "string" as const, description: "Stellar public key" },
          fiatCurrency: { type: "string" as const, default: "USD" },
          fiatAmount: { type: "number" as const },
          cryptoCurrency: { type: "string" as const, default: "XLM" },
          type: { type: "string" as const, enum: ["buy", "sell"], default: "buy" },
        },
      },
      response: {
        200: {
          type: "object" as const,
          properties: {
            url: { type: "string" as const },
            provider: { type: "string" as const },
          },
        },
        503: { type: "object" as const, properties: { error: { type: "string" as const } } },
      },
    },
  }, async (request: any, reply) => {
    if (!config.transak.enabled || !config.transak.apiKey) {
      return reply.status(503).send({ error: "Transak is not configured" });
    }

    const userId = request.user!.userId;
    const { walletAddress, fiatCurrency, fiatAmount, cryptoCurrency, type } = request.body as any;

    const baseUrl = config.transak.environment === "PRODUCTION"
      ? "https://global.transak.com"
      : "https://global-stg.transak.com";

    const params = new URLSearchParams({
      apiKey: config.transak.apiKey,
      environment: config.transak.environment,
      cryptoCurrencyCode: cryptoCurrency || "XLM",
      network: "stellar",
      walletAddress: walletAddress,
      defaultFiatCurrency: fiatCurrency || "USD",
      productsAvailed: type === "sell" ? "SELL" : "BUY",
      disableWalletAddressForm: "true",
      themeColor: "3b82f6",
    });

    if (fiatAmount) params.set("defaultFiatAmount", String(fiatAmount));

    const url = `${baseUrl}?${params.toString()}`;

    await auditLog("fiat_transak_url", {
      userId,
      detail: {
        type: type || "buy",
        walletAddress,
        fiatCurrency: fiatCurrency || "USD",
        cryptoCurrency: cryptoCurrency || "XLM",
      },
      ip: request.ip,
    });

    return { url, provider: "transak" };
  });

  // ── Legacy buy/sell execution (direct) ─────────────────────

  app.post("/api/v1/fiat/buy", {
    preHandler: authMiddleware,
    schema: {
      tags: ["Fiat Ramp"],
      summary: "Execute a fiat buy order via direct provider",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object" as const,
        required: ["quoteId", "paymentMethod"] as const,
        properties: {
          quoteId: { type: "string" as const },
          paymentMethod: { type: "string" as const, description: "card, bank_transfer, mobile_money" },
          destinationAddress: { type: "string" as const },
          provider: { type: "string" as const, default: "direct", description: "stripe, transak, or direct" },
        },
      },
    },
  }, async (request: any) => {
    const { provider } = request.body as any;

    if (provider === "stripe" && config.stripe.onrampEnabled) {
      return { status: "redirect", message: "Use POST /api/v1/fiat/stripe/session to create an onramp session" };
    }
    if (provider === "transak" && config.transak.enabled) {
      return { status: "redirect", message: "Use POST /api/v1/fiat/transak/url to generate a Transak widget URL" };
    }

    return {
      status: "pending_provider",
      message: "Direct fiat buy requires a payment provider. Available providers: " +
        [
          config.stripe.onrampEnabled ? "stripe" : null,
          config.transak.enabled ? "transak" : null,
          "moneygram",
        ].filter(Boolean).join(", "),
      orderId: crypto.randomUUID(),
      redirectUrl: null,
    };
  });

  app.post("/api/v1/fiat/sell", {
    preHandler: authMiddleware,
    schema: {
      tags: ["Fiat Ramp"],
      summary: "Execute a fiat sell order via direct provider",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object" as const,
        required: ["quoteId"] as const,
        properties: {
          quoteId: { type: "string" as const },
          provider: { type: "string" as const, default: "direct" },
          bankDetails: { type: "object" as const, additionalProperties: true },
        },
      },
    },
  }, async (request: any) => {
    const { provider } = request.body as any;

    if (provider === "transak" && config.transak.enabled) {
      return { status: "redirect", message: "Use POST /api/v1/fiat/transak/url with type='sell' for off-ramp" };
    }

    return {
      status: "pending_provider",
      message: "Direct fiat sell requires an off-ramp provider. Available: " +
        [
          config.transak.enabled ? "transak" : null,
          "moneygram",
        ].filter(Boolean).join(", "),
      orderId: crypto.randomUUID(),
    };
  });
}
