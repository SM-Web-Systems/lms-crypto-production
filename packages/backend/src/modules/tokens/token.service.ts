import { db } from "../../db";
import {
  tokens,
  contractTokens,
  userTokens,
  syncState,
} from "../../db/schema";
import { cache } from "../../lib/cache";
import { eq, and, ilike, or, desc, asc, sql, inArray } from "drizzle-orm";
import { stellarClient } from "../../lib/stellar-client";
import { config } from "../../config";
import * as StellarSdk from "@stellar/stellar-sdk";

/** Escape ILIKE metacharacters to prevent wildcard injection (P2-2-F5). */
function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type TokenSort = "rating" | "volume" | "trustlines" | "name" | "recent";

interface SearchParams {
  query?: string;
  sortBy?: TokenSort;
  verified?: boolean;
  limit?: number;
  offset?: number;
}

// ─── Sync cursor helpers (Neon instead of Redis) ───
async function getSyncCursor(key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.key, key))
    .limit(1);
  return row?.value || "0";
}

async function setSyncCursor(key: string, value: string): Promise<void> {
  await db
    .insert(syncState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value, updatedAt: new Date() },
    });
}

// ─── Resolve the best icon URL for a token ───
function resolveIconUrl(
  meta: { localIcon?: string | null; tomlImage?: string | null } | undefined
): string | null {
  if (!meta) return null;
  if (meta.localIcon) {
    const icon = meta.localIcon.startsWith("/") ? meta.localIcon : `/assets/icons/${meta.localIcon}`;
    return `${config.API_BASE_URL}${icon}`;
  }
  return meta.tomlImage ?? null;
}

export class TokenService {
  // ─── Discover from Horizon ───
  async discoverFromHorizon(cursor?: string) {
    const assets = await stellarClient.horizon
      .assets()
      .limit(200)
      .order("desc")
      .cursor(cursor || "")
      .call();

    for (const asset of assets.records) {
      // Skip junk tokens with fewer than 3 trustlines
      if (asset.num_accounts < 3) continue;

      const assetType =
        asset.asset_code.length <= 4
          ? "credit_alphanum4"
          : "credit_alphanum12";

      await db
        .insert(tokens)
        .values({
          assetType,
          assetCode: asset.asset_code,
          assetIssuer: asset.asset_issuer,
          network: config.STELLAR_NETWORK === 'mainnet' || config.STELLAR_NETWORK === 'pubnet' || config.STELLAR_NETWORK === 'public' ? 'pubnet' : 'testnet',
          totalSupply: asset.amount,
          trustlineCount: asset.num_accounts,
        })
        .onConflictDoUpdate({
          target: [tokens.assetCode, tokens.assetIssuer],
          set: {
            totalSupply: sql`COALESCE(EXCLUDED.total_supply, ${tokens.totalSupply})`,
            trustlineCount: sql`COALESCE(EXCLUDED.trustline_count, ${tokens.trustlineCount})`,
            updatedAt: new Date(),
          },
        });
    }

    return assets.records.length;
  }

  // ─── Enrich from StellarExpert ───
  async enrichFromStellarExpert() {
    let cursor = await getSyncCursor("token-sync:expert:cursor");
    let totalEnriched = 0;
    const maxPages = 10; // Up to 500 tokens per run

    for (let page = 0; page < maxPages; page++) {
    const res = await fetch(
      `https://api.stellar.expert/explorer/${config.STELLAR_NETWORK === "testnet" ? "testnet" : "public"}/asset?order=desc&sort=rating&limit=50&cursor=${cursor}`
    );
    const data = await res.json();

    for (const record of data._embedded.records) {
      const parts = record.asset.split("-");
      const code = parts[0];
      const issuer = parts.length > 1 ? parts[1] : null;

      // Extract trustline count from array or number
      const tlCount = Array.isArray(record.trustlines)
        ? record.trustlines[0]
        : (typeof record.trustlines === "number" ? record.trustlines : 0);

      // Extract rating trustlines (it's a number in the rating object)
      const ratingTl = typeof record.rating?.trustlines === "number"
        ? record.rating.trustlines : 0;

      const updateData: any = {
        homeDomain: record.domain || undefined,
        tomlName: record.tomlInfo?.name || undefined,
        tomlOrg: record.tomlInfo?.orgName || undefined,
        ratingAge: record.rating?.age || 0,
        ratingTrades: record.rating?.activity || record.rating?.trades || 0,
        ratingPayments: record.rating?.payments || 0,
        ratingTrustlines: ratingTl,
        ratingVolume: record.rating?.volume7d || 0,
        ratingLiquidity: record.rating?.liquidity || 0,
        ratingInterop: record.rating?.interop || 0,
        ratingAverage: record.rating?.average?.toString(),
        tradeCount: record.trades || 0,
        paymentCount: record.payments || 0,
        totalSupply: record.supply?.toString(),
        trustlineCount: tlCount,
        volume7d: record.volume7d?.toString() || "0",
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      };

      if (issuer) {
        await db.update(tokens).set(updateData)
          .where(and(eq(tokens.assetCode, code), eq(tokens.assetIssuer, issuer)));
      } else {
        // Native asset (XLM) — match by code + native type
        await db.update(tokens).set(updateData)
          .where(and(eq(tokens.assetCode, code), eq(tokens.assetType, "native")));
      }
    }

    totalEnriched += data._embedded.records.length;
    
    if (data._embedded.records.length > 0) {
      const last = data._embedded.records.at(-1);
      cursor = last.paging_token.toString();
      await setSyncCursor(
        "token-sync:expert:cursor",
        cursor
      );
    }
    
    if (data._embedded.records.length < 50) break; // No more pages
    }
    console.log("[token-enricher] Enriched " + totalEnriched + " tokens from StellarExpert");
  }

  // ─── Search tokens (with pagination metadata) ───
  async search(params: SearchParams) {
    const {
      query,
      sortBy = "rating",
      verified,
      limit = 50,
      offset = 0,
    } = params;

    const conditions = [
      eq(tokens.isSpam, false),
      eq(tokens.network, params.network || 'pubnet'),
    ];

    // ─── Quality gate: default listing only shows quality tokens ───
    if (!query) {
      conditions.push(
        or(
          eq(tokens.isVerified, true),
          sql`CAST(${tokens.ratingAverage} AS NUMERIC) >= 3`,
          sql`${tokens.trustlineCount} > 10`
        )!
      );
    }

    if (query) {
      const safeQuery = escapeIlike(query.slice(0, 100));
      conditions.push(
        or(
          ilike(tokens.assetCode, `%${safeQuery}%`),
          ilike(tokens.tomlName, `%${safeQuery}%`),
          ilike(tokens.homeDomain, `%${safeQuery}%`),
          ilike(tokens.tomlOrg, `%${safeQuery}%`)
        )!
      );
    }

    if (verified) {
      conditions.push(eq(tokens.isVerified, true));
    }

    const sortMap: Record<string, any> = {
      rating: desc(tokens.ratingAverage),
      volume: desc(tokens.volume7d),
      trustlines: desc(tokens.trustlineCount),
      name: asc(tokens.assetCode),
      recent: desc(tokens.createdAt),
    };

    const whereClause = and(...conditions);

    const [results, countResult] = await Promise.all([
      db
        .select()
        .from(tokens)
        .where(whereClause)
        .orderBy(sortMap[sortBy] || sortMap.rating)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tokens)
        .where(whereClause),
    ]);

    return {
      tokens: results.map((t) => ({ ...t, image: resolveIconUrl(t) })),
      pagination: {
        total: Number(countResult[0].count),
        limit,
        offset,
        hasMore: offset + limit < Number(countResult[0].count),
      },
    };
  }

  // ─── Get single token with full detail ───
  async getDetail(code: string, issuer: string | null) {
    const cacheKey = `token:${code}:${issuer || "native"}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const whereClause = issuer
      ? and(eq(tokens.assetCode, code), eq(tokens.assetIssuer, issuer))
      : and(eq(tokens.assetCode, code), eq(tokens.assetType, "native"));

    const [token] = await db
      .select()
      .from(tokens)
      .leftJoin(
        contractTokens,
        and(
          eq(contractTokens.assetCode, tokens.assetCode),
          eq(contractTokens.assetIssuer, tokens.assetIssuer)
        )
      )
      .where(whereClause)
      .limit(1);

    if (!token) return null;

    let orderbook = null;
    let pools: any[] = [];
    if (issuer) {
      [orderbook, pools] = await Promise.all([
        this.getOrderbook(code, issuer),
        this.getRelatedPools(code, issuer),
      ]);
    }

    const result = {
      ...token.tokens,
      image: resolveIconUrl(token.tokens),
      contractToken: token.contract_tokens,
      orderbook,
      liquidityPools: pools,
    };

    await cache.set(cacheKey, result, 300);
    return result;
  }

  // ─── Featured tokens ───
  async getFeatured() {
    const cacheKey = "tokens:featured";
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const result = await db
      .select()
      .from(tokens)
      .where(and(eq(tokens.isFeatured, true), eq(tokens.isSpam, false)))
      .orderBy(desc(tokens.ratingAverage))
      .limit(20);

    // Attach resolved icon URL to each featured token
    const withIcons = result.map((t) => ({
      ...t,
      image: resolveIconUrl(t),
    }));

    await cache.set(cacheKey, withIcons, 600);
    return withIcons;
  }

  // ─── User's enriched token list (batched — no N+1) ───
  async getUserTokens(publicKey: string) {
    const account = await stellarClient.horizon.loadAccount(publicKey);

    const balances = account.balances.map((b: any) => ({
      assetCode: b.asset_type === "native" ? "XLM" : b.asset_code,
      assetIssuer: b.asset_type === "native" ? null : b.asset_issuer,
      balance: b.balance,
      assetType: b.asset_type,
      limit: b.limit || null,
      buyingLiabilities: b.buying_liabilities || "0",
      sellingLiabilities: b.selling_liabilities || "0",
    }));

    // ── Batch fetch ALL token metadata in one query ──
    const issuedAssets = balances.filter(
      (b): b is typeof b & { assetIssuer: string } => b.assetIssuer !== null
    );
    const orConditions = [
      and(eq(tokens.assetCode, "XLM"), eq(tokens.assetType, "native")),
      ...issuedAssets.map((b) =>
        and(
          eq(tokens.assetCode, b.assetCode),
          eq(tokens.assetIssuer, b.assetIssuer)
        )
      ),
    ];

    const allMeta =
      orConditions.length > 0
        ? await db.select().from(tokens).where(or(...orConditions))
        : [];

    // Build lookup map: "CODE:ISSUER" => token row
    const metaMap = new Map<string, (typeof allMeta)[0]>();
    for (const m of allMeta) {
      const key =
        m.assetType === "native"
          ? "XLM:native"
          : `${m.assetCode}:${m.assetIssuer}`;
      metaMap.set(key, m);
    }

    // ── Batch fetch user preferences ──
    const tokenIds = allMeta.map((m) => m.id);
    const allPrefs =
      tokenIds.length > 0
        ? await db
            .select()
            .from(userTokens)
            .where(
              and(
                eq(userTokens.publicKey, publicKey),
                inArray(userTokens.tokenId, tokenIds)
              )
            )
        : [];

    const prefsMap = new Map<number, (typeof allPrefs)[0]>();
    for (const p of allPrefs) {
      if (p.tokenId) prefsMap.set(p.tokenId, p);
    }

    // ── Assemble enriched list ──
    const enriched = balances.map((b) => {
      const key = !b.assetIssuer
        ? "XLM:native"
        : `${b.assetCode}:${b.assetIssuer}`;
      const meta = metaMap.get(key);
      const prefs = meta ? prefsMap.get(meta.id) : undefined;

      // Resolve the best available icon for this specific token
      const image = resolveIconUrl(meta);

      return {
        assetCode: b.assetCode,
        assetIssuer: b.assetIssuer,
        balance: b.balance,
        assetType: b.assetType,
        limit: b.limit,
        buyingLiabilities: b.buyingLiabilities,
        sellingLiabilities: b.sellingLiabilities,
        image,
        token: meta
          ? {
              id: meta.id,
              tomlName:
                meta.tomlName ||
                (b.assetType === "native" ? "Stellar Lumens" : ""),
              tomlImage: meta.tomlImage || null,
              localIcon: meta.localIcon || null,
              domain:
                meta.homeDomain ||
                (b.assetType === "native" ? "stellar.org" : ""),
              isVerified:
                meta.isVerified ?? (b.assetType === "native" ? true : false),
              ratingAverage:
                meta.ratingAverage ??
                (b.assetType === "native" ? "10.0" : null),
              anchorAsset: meta.anchorAsset,
              anchorType: meta.anchorType,
            }
          : b.assetType === "native"
            ? {
                id: null,
                tomlName: "Stellar Lumens",
                tomlImage: null,
                localIcon: null,
                domain: "stellar.org",
                isVerified: true,
                ratingAverage: "10.0",
                anchorAsset: null,
                anchorType: null,
              }
            : undefined,
        isFavorite: prefs?.isFavorite ?? false,
        isHidden: prefs?.isHidden ?? false,
      };
    });

    return enriched.filter((t) => !t.isHidden);
  }

  // ─── Toggle favorite ───
  async toggleFavorite(publicKey: string, tokenId: number) {
    const [existing] = await db
      .select()
      .from(userTokens)
      .where(
        and(
          eq(userTokens.publicKey, publicKey),
          eq(userTokens.tokenId, tokenId)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(userTokens)
        .set({ isFavorite: !existing.isFavorite })
        .where(eq(userTokens.id, existing.id));
      return { ...existing, isFavorite: !existing.isFavorite };
    }

    const [inserted] = await db
      .insert(userTokens)
      .values({ publicKey, tokenId, isFavorite: true })
      .returning();
    return inserted;
  }

  // ─── Flag spam tokens ───
  async flagSpamTokens() {
    await db
      .update(tokens)
      .set({ isSpam: true, updatedAt: new Date() })
      .where(
        and(
          eq(tokens.isVerified, false),
          sql`${tokens.trustlineCount} < 10`,
          sql`${tokens.homeDomain} IS NULL`,
          sql`(${tokens.ratingAverage} < 1.0 OR ${tokens.ratingAverage} IS NULL)`
        )
      );
  }

  // ─── Ensure a token exists in our registry (upsert) ───
  async ensureToken(assetCode: string, assetIssuer: string) {
    await db
      .insert(tokens)
      .values({
        assetType:
          assetCode.length <= 4 ? "credit_alphanum4" : "credit_alphanum12",
        assetCode,
        assetIssuer,
      })
      .onConflictDoNothing();

    // Background: resolve home_domain + queue TOML sync
    setImmediate(async () => {
      try {
        const assets = await stellarClient.horizon
          .assets()
          .forCode(assetCode)
          .forIssuer(assetIssuer)
          .call();

        // The Horizon API returns home_domain in the JSON but the SDK's
        // AssetRecord type doesn't declare it. Cast to access it safely.
        const record = assets.records[0] as
          | (typeof assets.records)[0] & { home_domain?: string }
          | undefined;

        if (record?.home_domain) {
          await db
            .update(tokens)
            .set({
              homeDomain: record.home_domain,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(tokens.assetCode, assetCode),
                eq(tokens.assetIssuer, assetIssuer)
              )
            );
        }
      } catch {}
    });
  }

  // ─── Orderbook helper ───
  private async getOrderbook(code: string, issuer: string) {
    try {
      const ob = await stellarClient.horizon
        .orderbook(
          new StellarSdk.Asset(code, issuer),
          StellarSdk.Asset.native()
        )
        .call();

      return {
        bids: ob.bids.slice(0, 10),
        asks: ob.asks.slice(0, 10),
        spread:
          ob.asks[0] && ob.bids[0]
            ? (
                ((parseFloat(ob.asks[0].price) -
                  parseFloat(ob.bids[0].price)) /
                  parseFloat(ob.asks[0].price)) *
                100
              ).toFixed(2)
            : null,
      };
    } catch {
      return null;
    }
  }

  // ─── Liquidity pools helper ───
  private async getRelatedPools(code: string, issuer: string) {
    try {
      const pools = await stellarClient.horizon
        .liquidityPools()
        .forAssets(new StellarSdk.Asset(code, issuer))
        .limit(10)
        .call();

      return pools.records.map((p: any) => ({
        id: p.id,
        reserves: p.reserves,
        totalShares: p.total_shares,
        totalTrustlines: p.total_trustlines,
      }));
    } catch {
      return [];
    }
  }
}
