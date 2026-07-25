import { FastifyInstance } from "fastify";
import { config } from "../config";
import * as StellarSdk from "@stellar/stellar-sdk";

const horizon = new StellarSdk.Horizon.Server(config.HORIZON_URL);

export async function earnRoutes(app: FastifyInstance) {

  // ─── List available liquidity pools ───
  app.get(
    "/api/v1/earn/pools",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["Earn"],
        summary: "List liquidity pools available for earning fees",
        querystring: {
          type: "object",
          properties: {
            asset: { type: "string", description: "Filter by asset code (e.g. XLM, USDC)" },
            limit: { type: "number", default: 20 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              pools: { type: "array", items: { type: "object", additionalProperties: true } },
              total: { type: "number" },
            },
          },
        },
      },
    },
    async (request) => {
      const { asset, limit = 20 } = request.query as any;

      try {
        let query = horizon.liquidityPools().limit(Math.min(limit, 50)).order("desc");

        if (asset) {
          if (asset === "XLM" || asset === "native") {
            query = query.forAssets(StellarSdk.Asset.native());
          } else {
            // Search pools containing this asset code
            const results = await horizon.liquidityPools().limit(200).call();
            const filtered = results.records.filter((p: any) =>
              p.reserves.some((r: any) => {
                const code = r.asset === "native" ? "XLM" : r.asset.split(":")[0];
                return code.toUpperCase() === asset.toUpperCase();
              })
            );
            return {
              pools: filtered.slice(0, limit).map(formatPool),
              total: filtered.length,
            };
          }
        }

        const result = await query.call();
        return {
          pools: result.records.map(formatPool),
          total: result.records.length,
        };
      } catch (err: any) {
        return { error: err.message || "Failed to fetch pools" };
      }
    }
  );

  // ─── Get user LP positions ───
  app.get(
    "/api/v1/earn/positions/:publicKey",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["Earn"],
        summary: "Get user liquidity pool positions and estimated earnings",
        params: {
          type: "object",
          properties: { publicKey: { type: "string" } },
          required: ["publicKey"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              positions: { type: "array", items: { type: "object", additionalProperties: true } },
              totalPools: { type: "number" },
            },
          },
        },
      },
    },
    async (request) => {
      const { publicKey } = request.params as any;

      try {
        const account = await horizon.loadAccount(publicKey);
        const lpBalances = account.balances.filter(
          (b: any) => b.asset_type === "liquidity_pool_shares"
        );

        const positions = await Promise.all(
          lpBalances.map(async (b: any) => {
            try {
              const pool = await horizon.liquidityPools().liquidityPoolId(b.liquidity_pool_id).call();
              const totalShares = parseFloat(pool.total_shares);
              const userShares = parseFloat(b.balance);
              const shareRatio = totalShares > 0 ? userShares / totalShares : 0;

              return {
                poolId: b.liquidity_pool_id,
                shares: b.balance,
                sharePercent: (shareRatio * 100).toFixed(4),
                reserves: pool.reserves.map((r: any) => {
                  const isNative = r.asset === "native";
                  return {
                    asset: isNative ? "XLM" : r.asset.split(":")[0],
                    issuer: isNative ? null : r.asset.split(":")[1],
                    totalAmount: r.amount,
                    userAmount: (parseFloat(r.amount) * shareRatio).toFixed(7),
                  };
                }),
                feeBp: pool.fee_bp || 30,
                totalShares: pool.total_shares,
                totalTrustlines: pool.total_trustlines,
              };
            } catch {
              return {
                poolId: b.liquidity_pool_id,
                shares: b.balance,
                error: "Pool details unavailable",
              };
            }
          })
        );

        return { positions, totalPools: positions.length };
      } catch (err: any) {
        return { error: err.message || "Failed to load positions" };
      }
    }
  );

  // ─── Build LP deposit transaction ───
  app.post(
    "/api/v1/earn/deposit",
    {
      schema: {
        tags: ["Earn"],
        summary: "Build a liquidity pool deposit transaction (returns unsigned XDR)",
        body: {
          type: "object",
          required: ["publicKey", "poolId", "maxAmountA", "maxAmountB"],
          properties: {
            publicKey: { type: "string" },
            poolId: { type: "string" },
            maxAmountA: { type: "string" },
            maxAmountB: { type: "string" },
            minPrice: { type: "string", default: "0.0000001" },
            maxPrice: { type: "string", default: "999999999" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              xdr: { type: "string" },
              poolId: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request) => {
      const { publicKey, poolId, maxAmountA, maxAmountB, minPrice, maxPrice } = request.body as any;

      try {
        const account = await horizon.loadAccount(publicKey);
        const pool = await horizon.liquidityPools().liquidityPoolId(poolId).call();

        const networkPassphrase = config.STELLAR_NETWORK === "testnet"
          ? StellarSdk.Networks.TESTNET
          : StellarSdk.Networks.PUBLIC;

        const tx = new StellarSdk.TransactionBuilder(account, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        })
          .addOperation(
            StellarSdk.Operation.liquidityPoolDeposit({
              liquidityPoolId: poolId,
              maxAmountA,
              maxAmountB,
              minPrice: minPrice || "0.0000001",
              maxPrice: maxPrice || "999999999",
            })
          )
          .setTimeout(300)
          .build();

        return {
          xdr: tx.toXDR(),
          poolId,
          message: "Sign and submit this transaction to deposit into the pool",
        };
      } catch (err: any) {
        return { error: err.message || "Failed to build deposit transaction" };
      }
    }
  );

  // ─── Build LP withdraw transaction ───
  app.post(
    "/api/v1/earn/withdraw",
    {
      schema: {
        tags: ["Earn"],
        summary: "Build a liquidity pool withdraw transaction (returns unsigned XDR)",
        body: {
          type: "object",
          required: ["publicKey", "poolId", "shares"],
          properties: {
            publicKey: { type: "string" },
            poolId: { type: "string" },
            shares: { type: "string", description: "Amount of LP shares to withdraw" },
            minAmountA: { type: "string", default: "0" },
            minAmountB: { type: "string", default: "0" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              xdr: { type: "string" },
              poolId: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request) => {
      const { publicKey, poolId, shares, minAmountA, minAmountB } = request.body as any;

      try {
        const account = await horizon.loadAccount(publicKey);

        const networkPassphrase = config.STELLAR_NETWORK === "testnet"
          ? StellarSdk.Networks.TESTNET
          : StellarSdk.Networks.PUBLIC;

        const tx = new StellarSdk.TransactionBuilder(account, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        })
          .addOperation(
            StellarSdk.Operation.liquidityPoolWithdraw({
              liquidityPoolId: poolId,
              amount: shares,
              minAmountA: minAmountA || "0",
              minAmountB: minAmountB || "0",
            })
          )
          .setTimeout(300)
          .build();

        return {
          xdr: tx.toXDR(),
          poolId,
          message: "Sign and submit this transaction to withdraw from the pool",
        };
      } catch (err: any) {
        return { error: err.message || "Failed to build withdraw transaction" };
      }
    }
  );
}

function formatPool(p: any) {
  return {
    id: p.id,
    feeBp: p.fee_bp || 30,
    feePercent: ((p.fee_bp || 30) / 100).toFixed(2),
    totalShares: p.total_shares,
    totalTrustlines: p.total_trustlines,
    reserves: p.reserves.map((r: any) => {
      const isNative = r.asset === "native";
      return {
        asset: isNative ? "XLM" : r.asset.split(":")[0],
        issuer: isNative ? null : r.asset.split(":")[1],
        amount: r.amount,
      };
    }),
    lastModified: p.last_modified_time,
  };
}
