import { FastifyInstance } from "fastify";
import { db } from "../db";
import { portfolioSnapshots, userWallets } from "../db/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";

export async function portfolioRoutes(app: FastifyInstance) {

  // Take a snapshot of current portfolio
  app.post(
    "/api/v1/portfolio/snapshot",
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ["Portfolio"],
        summary: "Record a portfolio balance snapshot for the active wallet",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              totalXlm: { type: "string" },
              totalUsd: { type: "string" },
              assets: { type: "number" },
            },
          },
        },
      },
    },
    async (request) => {
      const user = (request as any).user;

      // Find active wallet
      const wallets = await db
        .select()
        .from(userWallets)
        .where(and(eq(userWallets.userId, user.id), eq(userWallets.isActive, true)));

      if (wallets.length === 0) return { success: false, totalXlm: "0", totalUsd: "0", assets: 0 };
      const wallet = wallets[0];

      // Fetch balances from Horizon
      const horizonUrl = config.HORIZON_URL || "https://horizon-testnet.stellar.org";
      let balances: any[] = [];
      try {
        const res = await fetch(horizonUrl + "/accounts/" + wallet.publicKey);
        if (res.ok) {
          const data = await res.json();
          balances = data.balances || [];
        }
      } catch {}

      // Get XLM price
      let xlmUsd = 0.09;
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd");
        const data = await res.json();
        if (data.stellar?.usd) xlmUsd = data.stellar.usd;
      } catch {}

      // Calculate totals
      let totalXlm = 0;
      const breakdown: any[] = [];
      for (const b of balances) {
        const code = b.asset_code || "XLM";
        const bal = parseFloat(b.balance) || 0;
        if (code === "XLM" || b.asset_type === "native") {
          totalXlm += bal;
          breakdown.push({ code: "XLM", issuer: null, balance: b.balance, valueXlm: bal.toFixed(7), valueUsd: (bal * xlmUsd).toFixed(2) });
        } else {
          // For non-XLM assets, approximate value as 0 on testnet (no reliable pricing)
          breakdown.push({ code, issuer: b.asset_issuer, balance: b.balance, valueXlm: "0", valueUsd: "0" });
        }
      }

      const totalUsd = totalXlm * xlmUsd;

      await db.insert(portfolioSnapshots).values({
        userId: user.id,
        walletPublicKey: wallet.publicKey,
        totalXlm: totalXlm.toFixed(7),
        totalUsd: totalUsd.toFixed(2),
        assetBreakdown: JSON.stringify(breakdown),
      });

      return { success: true, totalXlm: totalXlm.toFixed(7), totalUsd: totalUsd.toFixed(2), assets: breakdown.length };
    }
  );

  // Get portfolio history
  app.get(
    "/api/v1/portfolio/history",
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ["Portfolio"],
        summary: "Get portfolio value history for charting",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            days: { type: "integer", default: 30, description: "Number of days of history" },
            walletPublicKey: { type: "string", description: "Optional: filter by specific wallet" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              snapshots: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    totalXlm: { type: "string" },
                    totalUsd: { type: "string" },
                    assets: { type: "array", items: { type: "object", additionalProperties: true } },
                    createdAt: { type: "string" },
                  },
                },
              },
              currentValue: {
                type: "object",
                properties: {
                  totalXlm: { type: "string" },
                  totalUsd: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const user = (request as any).user;
      const { days, walletPublicKey } = request.query as any;
      const since = new Date(Date.now() - (days || 30) * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(portfolioSnapshots.userId, user.id),
        gte(portfolioSnapshots.createdAt, since),
      ];
      if (walletPublicKey) {
        conditions.push(eq(portfolioSnapshots.walletPublicKey, walletPublicKey));
      }

      const snapshots = await db
        .select()
        .from(portfolioSnapshots)
        .where(and(...conditions))
        .orderBy(desc(portfolioSnapshots.createdAt))
        .limit(200);

      // Get latest value
      const latest = snapshots.length > 0 ? snapshots[0] : null;

      return {
        snapshots: snapshots.reverse().map((s) => ({
          totalXlm: s.totalXlm,
          totalUsd: s.totalUsd,
          assets: typeof s.assetBreakdown === "string" ? JSON.parse(s.assetBreakdown as string) : s.assetBreakdown,
          createdAt: s.createdAt.toISOString(),
        })),
        currentValue: latest
          ? { totalXlm: latest.totalXlm, totalUsd: latest.totalUsd }
          : { totalXlm: "0", totalUsd: "0" },
      };
    }
  );

  // Get portfolio summary (current snapshot + change)
  app.get(
    "/api/v1/portfolio/summary",
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ["Portfolio"],
        summary: "Get portfolio summary with 24h and 7d change",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              totalXlm: { type: "string" },
              totalUsd: { type: "string" },
              change24h: { type: "object", properties: { xlm: { type: "string" }, usd: { type: "string" }, percent: { type: "string" } } },
              change7d: { type: "object", properties: { xlm: { type: "string" }, usd: { type: "string" }, percent: { type: "string" } } },
              assets: { type: "array", items: { type: "object", additionalProperties: true } },
            },
          },
        },
      },
    },
    async (request) => {
      const user = (request as any).user;

      // Latest snapshot
      const latest = await db
        .select()
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.userId, user.id))
        .orderBy(desc(portfolioSnapshots.createdAt))
        .limit(1);

      if (latest.length === 0) {
        return { totalXlm: "0", totalUsd: "0", change24h: { xlm: "0", usd: "0", percent: "0" }, change7d: { xlm: "0", usd: "0", percent: "0" }, assets: [] };
      }

      const now = latest[0];

      // 24h ago
      const t24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const snap24h = await db
        .select()
        .from(portfolioSnapshots)
        .where(and(eq(portfolioSnapshots.userId, user.id), gte(portfolioSnapshots.createdAt, t24h)))
        .orderBy(portfolioSnapshots.createdAt)
        .limit(1);

      // 7d ago
      const t7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const snap7d = await db
        .select()
        .from(portfolioSnapshots)
        .where(and(eq(portfolioSnapshots.userId, user.id), gte(portfolioSnapshots.createdAt, t7d)))
        .orderBy(portfolioSnapshots.createdAt)
        .limit(1);

      const calcChange = (current: string, old: any[]) => {
        if (old.length === 0) return { xlm: "0", usd: "0", percent: "0" };
        const curUsd = parseFloat(now.totalUsd as string);
        const oldUsd = parseFloat(old[0].totalUsd as string);
        const curXlm = parseFloat(now.totalXlm as string);
        const oldXlm = parseFloat(old[0].totalXlm as string);
        const pct = oldUsd > 0 ? ((curUsd - oldUsd) / oldUsd * 100).toFixed(2) : "0";
        return { xlm: (curXlm - oldXlm).toFixed(7), usd: (curUsd - oldUsd).toFixed(2), percent: pct };
      };

      const assets = typeof now.assetBreakdown === "string" ? JSON.parse(now.assetBreakdown as string) : now.assetBreakdown;

      return {
        totalXlm: now.totalXlm,
        totalUsd: now.totalUsd,
        change24h: calcChange(now.totalUsd as string, snap24h),
        change7d: calcChange(now.totalUsd as string, snap7d),
        assets,
      };
    }
  );
}
