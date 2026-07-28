import { FastifyInstance } from "fastify";
import { db } from "../db";
import { tokens } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { config } from "../config";
import { authMiddleware } from "../middleware/auth";
import tokenListJson from "../data/token-list.json";

const tokenList = tokenListJson as any;

export async function curatedTokenRoutes(app: FastifyInstance) {

  // Get the curated token list for the current network
  app.get(
    "/api/v1/tokens/curated",
    {
      schema: {
        tags: ["Tokens"],
        summary: "Get curated, verified token list for the current network",
        querystring: {
          type: "object",
          properties: {
            network: { type: "string", enum: ["mainnet", "testnet"], description: "Defaults to server network" },
            category: { type: "string", description: "Filter by category (stablecoin, defi, wrapped, etc)" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              version: { type: "string" },
              network: { type: "string" },
              tokens: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    issuer: { type: "string" },
                    name: { type: "string" },
                    domain: { type: "string" },
                    icon: { type: "string" },
                    verified: { type: "boolean" },
                    category: { type: "string" },
                  },
                },
              },
              total: { type: "number" },
            },
          },
        },
      },
    },
    async (request) => {
      const { network, category } = request.query as any;
      const net = network || (config.STELLAR_NETWORK === "testnet" ? "testnet" : "mainnet");
      let list = tokenList[net] || [];
      
      if (category) {
        list = list.filter((t: any) => t.category === category);
      }

      return {
        version: tokenList.version,
        network: net,
        tokens: list,
        total: list.length,
      };
    }
  );

  // Seed curated tokens into the database (admin)
  app.post(
    "/api/v1/tokens/curated/seed",
    {
      preHandler: [authMiddleware],
      config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
      schema: {
        tags: ["Tokens"],
        summary: "Seed curated tokens into the database (creates entries if missing)",
        response: {
          200: {
            type: "object",
            properties: { seeded: { type: "number" }, skipped: { type: "number" } },
          },
        },
      },
    },
    async () => {
      const net = config.STELLAR_NETWORK === "testnet" ? "testnet" : "mainnet";
      const list = tokenList[net] || [];
      let seeded = 0;
      let skipped = 0;

      for (const t of list) {
        const issuer = t.issuer === "native" ? null : t.issuer;
        
        // Check if exists
        const existing = await db
          .select({ id: tokens.id })
          .from(tokens)
          .where(
            and(
              eq(tokens.assetCode, t.code),
              issuer ? eq(tokens.assetIssuer, issuer) : sql`asset_issuer IS NULL`
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update with curated info
          await db
            .update(tokens)
            .set({
              tomlName: t.name,
              homeDomain: t.domain,
              isVerified: t.verified,
              tomlImage: t.icon || undefined,
              localIcon: t.icon && t.icon.includes('/assets/icons/') ? t.icon.split('/assets/icons/')[1] : undefined,
            })
            .where(eq(tokens.id, existing[0].id));
          skipped++;
        } else {
          // Insert new
          await db.insert(tokens).values({
            assetCode: t.code,
            assetIssuer: issuer,
            assetType: t.code === "XLM" ? "native" : (t.code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12"),
            tomlName: t.name,
            homeDomain: t.domain,
            isVerified: t.verified,
            tomlImage: t.icon || null,
            localIcon: t.icon && t.icon.includes('/assets/icons/') ? t.icon.split('/assets/icons/')[1] : null,
          });
          seeded++;
        }
      }

      return { seeded, skipped };
    }
  );
}
