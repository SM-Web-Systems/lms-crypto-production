import { FastifyInstance } from "fastify";
import { config } from "../config";
import * as StellarSdk from "@stellar/stellar-sdk";
import { authMiddleware } from "../middleware/auth";

const RAMPS_URL = config.MONEYGRAM_RAMPS_URL;
const RAMPS_DOMAIN = config.MONEYGRAM_RAMPS_DOMAIN;

// ─── SEP-10 Authentication with MoneyGram ───
async function sep10Auth(userPublicKey: string): Promise<string> {
  // 1. Request challenge from MoneyGram's SEP-10 endpoint
  const authUrl = `${RAMPS_URL}/sep10`;
  const params = new URLSearchParams({
    account: userPublicKey,
    home_domain: "ammawallet.com",
  });

  const challengeRes = await fetch(`${authUrl}?${params}`);
  if (!challengeRes.ok) {
    const err = await challengeRes.text();
    throw new Error(`SEP-10 challenge failed: ${err}`);
  }

  const { transaction, network_passphrase } = await challengeRes.json() as any;

  // 2. Verify and sign the challenge with our server signing key
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    transaction,
    network_passphrase || (config.STELLAR_NETWORK === "testnet"
      ? StellarSdk.Networks.TESTNET
      : StellarSdk.Networks.PUBLIC)
  );

  const serverKeypair = StellarSdk.Keypair.fromSecret(config.SIGNING_SECRET_KEY);
  tx.sign(serverKeypair);

  // 3. Submit signed challenge back to get JWT
  const tokenRes = await fetch(`${authUrl}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: tx.toXDR() }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`SEP-10 token exchange failed: ${err}`);
  }

  const { token } = await tokenRes.json() as any;
  return token;
}

// ─── SEP-24 Interactive Flow ───
async function initiateSep24(
  sep10Token: string,
  type: "deposit" | "withdraw",
  assetCode: string,
  amount?: string
): Promise<{ id: string; url: string; type: string }> {
  const sep24Url = `${RAMPS_URL}/sep24/transactions/${type}/interactive`;

  const formData = new URLSearchParams();
  formData.append("asset_code", assetCode);
  if (amount) formData.append("amount", amount);

  const res = await fetch(sep24Url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sep10Token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SEP-24 ${type} initiation failed: ${err}`);
  }

  const data = await res.json() as any;
  return {
    id: data.id,
    url: data.url,
    type: data.type || type,
  };
}

// ─── Poll transaction status ───
async function getTransactionStatus(
  sep10Token: string,
  transactionId: string
): Promise<any> {
  const res = await fetch(
    `${RAMPS_URL}/sep24/transaction?id=${transactionId}`,
    { headers: { Authorization: `Bearer ${sep10Token}` } }
  );

  if (!res.ok) throw new Error("Failed to fetch transaction status");
  const data = await res.json() as any;
  return data.transaction;
}

export async function moneygramRoutes(app: FastifyInstance) {

  // ─── Get MoneyGram config info ───
  app.get(
    "/api/v1/moneygram/info",
    {
      schema: {
        tags: ["Fiat Ramp"],
        summary: "Get MoneyGram ramps configuration and supported assets",
        response: {
          200: {
            type: "object",
            properties: {
              provider: { type: "string" },
              domain: { type: "string" },
              signingKey: { type: "string" },
              network: { type: "string" },
              supportedAssets: { type: "array", items: { type: "string" } },
              limits: {
                type: "object",
                properties: {
                  onRamp: { type: "object", properties: { min: { type: "string" }, max: { type: "string" } } },
                  offRamp: { type: "object", properties: { min: { type: "string" }, max: { type: "string" } } },
                },
              },
              feePercent: { type: "number" },
              status: { type: "string" },
            },
          },
        },
      },
    },
    async () => {
      return {
        provider: "MoneyGram",
        domain: RAMPS_DOMAIN,
        signingKey: config.SIGNING_PUBLIC_KEY,
        network: config.STELLAR_NETWORK,
        supportedAssets: ["USDC"],
        limits: {
          onRamp: { min: "5", max: "950" },
          offRamp: { min: "5", max: "2500" },
        },
        feePercent: config.FIAT_RAMP_FEE_PERCENT,
        status: config.SIGNING_SECRET_KEY ? "configured" : "not_configured",
      };
    }
  );

  // ─── Initiate SEP-10 auth + SEP-24 deposit (buy USDC with cash) ───
  app.post(
    "/api/v1/moneygram/deposit",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Fiat Ramp"],
        summary: "Start MoneyGram cash-in (deposit USDC)",
        body: {
          type: "object",
          required: ["publicKey"],
          properties: {
            publicKey: { type: "string", description: "User Stellar public key" },
            amount: { type: "string", description: "Amount in USD (optional)" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              transactionId: { type: "string" },
              interactiveUrl: { type: "string" },
              type: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request) => {
      const { publicKey, amount } = request.body as any;

      try {
        const sep10Token = await sep10Auth(publicKey);
        const result = await initiateSep24(sep10Token, "deposit", "USDC", amount);

        return {
          transactionId: result.id,
          interactiveUrl: result.url,
          type: result.type,
          message: "Open the interactive URL to complete KYC and deposit at a MoneyGram location",
        };
      } catch (err: any) {
        return { error: err.message || "MoneyGram deposit initiation failed" };
      }
    }
  );

  // ─── Initiate SEP-10 auth + SEP-24 withdraw (sell USDC for cash) ───
  app.post(
    "/api/v1/moneygram/withdraw",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Fiat Ramp"],
        summary: "Start MoneyGram cash-out (withdraw USDC for cash pickup)",
        body: {
          type: "object",
          required: ["publicKey"],
          properties: {
            publicKey: { type: "string", description: "User Stellar public key" },
            amount: { type: "string", description: "Amount in USDC" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              transactionId: { type: "string" },
              interactiveUrl: { type: "string" },
              type: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request) => {
      const { publicKey, amount } = request.body as any;

      try {
        const sep10Token = await sep10Auth(publicKey);
        const result = await initiateSep24(sep10Token, "withdraw", "USDC", amount);

        return {
          transactionId: result.id,
          interactiveUrl: result.url,
          type: result.type,
          message: "Open the interactive URL to complete withdrawal. You will receive a reference number for cash pickup.",
        };
      } catch (err: any) {
        return { error: err.message || "MoneyGram withdrawal initiation failed" };
      }
    }
  );

  // ─── Check transaction status ───
  app.get(
    "/api/v1/moneygram/transaction/:id",
    {
      preHandler: authMiddleware,
      schema: {
        tags: ["Fiat Ramp"],
        summary: "Check MoneyGram transaction status",
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              status: { type: "string" },
              kind: { type: "string" },
              amount_in: { type: "string" },
              amount_out: { type: "string" },
              amount_fee: { type: "string" },
              started_at: { type: "string" },
              completed_at: { type: "string" },
              stellar_transaction_id: { type: "string" },
              external_transaction_id: { type: "string" },
              refunded: { type: "boolean" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as any;
      const { publicKey } = request.query as any;

      if (!publicKey) {
        return { error: "publicKey query parameter required" };
      }

      try {
        const sep10Token = await sep10Auth(publicKey);
        const tx = await getTransactionStatus(sep10Token, id);
        return tx;
      } catch (err: any) {
        return { error: err.message || "Failed to fetch transaction status" };
      }
    }
  );
}
