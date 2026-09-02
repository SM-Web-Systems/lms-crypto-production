import { config } from "../../config";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import * as StellarSdk from "@stellar/stellar-sdk";
import { validateExternalUrl } from "../../lib/url-validator";

const horizon = new StellarSdk.Horizon.Server(
  config.network === "testnet"
    ? "https://horizon-testnet.stellar.org"
    : "https://horizon.stellar.org"
);

const sorobanRpc = new StellarSdk.rpc.Server(
  config.sorobanRpcUrl || "https://soroban-testnet.stellar.org"
);

export class NftService {

  // ── Collections ────────────────────────────────────────────

  /**
   * Register a new NFT collection (SEP-50 Soroban or SEP-39 Classic)
   */
  async registerCollection(data: {
    contractId?: string;
    issuerAddress?: string;
    name: string;
    symbol?: string;
    standard: "sep50" | "sep39";
    baseUri?: string;
    description?: string;
    imageUrl?: string;
    creatorAddress?: string;
    network?: string;
  }) {
    const [collection] = await db.insert(schema.nftCollections).values({
      contractId: data.contractId || null,
      issuerAddress: data.issuerAddress || null,
      name: data.name,
      symbol: data.symbol || null,
      standard: data.standard,
      baseUri: data.baseUri || null,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      creatorAddress: data.creatorAddress || null,
      network: data.network || config.network || "testnet",
      totalSupply: 0,
      isVerified: false,
    }).returning();
    return collection;
  }

  /**
   * List collections with pagination
   */
  async listCollections(limit = 50, offset = 0, network?: string) {
    const where = network ? eq(schema.nftCollections.network, network) : undefined;
    const collections = await db.select()
      .from(schema.nftCollections)
      .where(where)
      .orderBy(desc(schema.nftCollections.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.nftCollections)
      .where(where);

    return { collections, total: count };
  }

  /**
   * Get single collection by ID
   */
  async getCollection(id: number) {
    const [collection] = await db.select()
      .from(schema.nftCollections)
      .where(eq(schema.nftCollections.id, id))
      .limit(1);
    return collection || null;
  }

  /**
   * Get collection by contract ID (Soroban)
   */
  async getCollectionByContract(contractId: string) {
    const [collection] = await db.select()
      .from(schema.nftCollections)
      .where(eq(schema.nftCollections.contractId, contractId))
      .limit(1);
    return collection || null;
  }

  // ── Tokens ─────────────────────────────────────────────────

  /**
   * Index / register an individual NFT token
   */
  async indexToken(data: {
    collectionId: number;
    tokenId: number;
    owner: string;
    name?: string;
    description?: string;
    image?: string;
    metadataUri?: string;
    attributes?: any;
  }) {
    // Upsert: if token already indexed, update owner + metadata
    const [token] = await db.insert(schema.nftTokens).values({
      collectionId: data.collectionId,
      tokenId: data.tokenId,
      owner: data.owner,
      name: data.name || null,
      description: data.description || null,
      image: data.image || null,
      metadataUri: data.metadataUri || null,
      attributes: data.attributes || [],
    }).onConflictDoUpdate({
      target: [schema.nftTokens.collectionId, schema.nftTokens.tokenId],
      set: {
        owner: data.owner,
        name: data.name || null,
        description: data.description || null,
        image: data.image || null,
        metadataUri: data.metadataUri || null,
        attributes: data.attributes || [],
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
    }).returning();

    // Update collection totalSupply
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.nftTokens)
      .where(eq(schema.nftTokens.collectionId, data.collectionId));
    await db.update(schema.nftCollections)
      .set({ totalSupply: count, updatedAt: new Date() })
      .where(eq(schema.nftCollections.id, data.collectionId));

    return token;
  }

  /**
   * Get NFTs owned by a specific address
   */
  async getTokensByOwner(ownerAddress: string, limit = 50, offset = 0) {
    const tokens = await db.select({
      token: schema.nftTokens,
      collection: schema.nftCollections,
    })
      .from(schema.nftTokens)
      .leftJoin(schema.nftCollections, eq(schema.nftTokens.collectionId, schema.nftCollections.id))
      .where(eq(schema.nftTokens.owner, ownerAddress))
      .orderBy(desc(schema.nftTokens.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.nftTokens)
      .where(eq(schema.nftTokens.owner, ownerAddress));

    return { tokens, total: count };
  }

  /**
   * Get tokens in a collection
   */
  async getTokensByCollection(collectionId: number, limit = 50, offset = 0) {
    const tokens = await db.select()
      .from(schema.nftTokens)
      .where(eq(schema.nftTokens.collectionId, collectionId))
      .orderBy(desc(schema.nftTokens.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.nftTokens)
      .where(eq(schema.nftTokens.collectionId, collectionId));

    return { tokens, total: count };
  }

  /**
   * Get single NFT token by collection + token identifier
   */
  async getToken(collectionId: number, tokenIdentifier: string) {
    const [token] = await db.select({
      token: schema.nftTokens,
      collection: schema.nftCollections,
    })
      .from(schema.nftTokens)
      .leftJoin(schema.nftCollections, eq(schema.nftTokens.collectionId, schema.nftCollections.id))
      .where(and(
        eq(schema.nftTokens.collectionId, collectionId),
        eq(schema.nftTokens.tokenId, Number(tokenIdentifier)),
      ))
      .limit(1);
    return token || null;
  }

  // ── Soroban SEP-50 Contract Interaction ────────────────────

  /**
   * Query a SEP-50 NFT contract for token metadata via Soroban RPC
   */
  async querySep50Contract(contractId: string) {
    try {
      const contract = new StellarSdk.Contract(contractId);

      // Get name
      const nameOp = contract.call("name");
      const nameResult = await sorobanRpc.simulateTransaction(
        new StellarSdk.TransactionBuilder(
          new StellarSdk.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
          { fee: "100", networkPassphrase: config.network === "testnet" ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC }
        ).addOperation(nameOp).setTimeout(30).build()
      );

      let name = "";
      let symbol = "";
      let totalSupply = 0;

      if (StellarSdk.rpc.Api.isSimulationSuccess(nameResult)) {
        const returnVal = nameResult.result?.retval;
        if (returnVal) name = StellarSdk.scValToNative(returnVal);
      }

      // Get symbol
      const symbolOp = contract.call("symbol");
      const symbolResult = await sorobanRpc.simulateTransaction(
        new StellarSdk.TransactionBuilder(
          new StellarSdk.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
          { fee: "100", networkPassphrase: config.network === "testnet" ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC }
        ).addOperation(symbolOp).setTimeout(30).build()
      );

      if (StellarSdk.rpc.Api.isSimulationSuccess(symbolResult)) {
        const returnVal = symbolResult.result?.retval;
        if (returnVal) symbol = StellarSdk.scValToNative(returnVal);
      }

      // Get total_supply
      const supplyOp = contract.call("total_supply");
      const supplyResult = await sorobanRpc.simulateTransaction(
        new StellarSdk.TransactionBuilder(
          new StellarSdk.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
          { fee: "100", networkPassphrase: config.network === "testnet" ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC }
        ).addOperation(supplyOp).setTimeout(30).build()
      );

      if (StellarSdk.rpc.Api.isSimulationSuccess(supplyResult)) {
        const returnVal = supplyResult.result?.retval;
        if (returnVal) totalSupply = Number(StellarSdk.scValToNative(returnVal));
      }

      return { name, symbol, totalSupply, contractId };
    } catch (err: any) {
      console.error("[nft] SEP-50 contract query failed:", err.message);
      return null;
    }
  }

  /**
   * Query token_uri for a specific NFT from a SEP-50 contract
   */
  async querySep50TokenUri(contractId: string, tokenId: number) {
    try {
      const contract = new StellarSdk.Contract(contractId);
      const op = contract.call("token_uri", StellarSdk.nativeToScVal(tokenId, { type: "u32" }));

      const result = await sorobanRpc.simulateTransaction(
        new StellarSdk.TransactionBuilder(
          new StellarSdk.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
          { fee: "100", networkPassphrase: config.network === "testnet" ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC }
        ).addOperation(op).setTimeout(30).build()
      );

      if (StellarSdk.rpc.Api.isSimulationSuccess(result)) {
        const returnVal = result.result?.retval;
        if (returnVal) return StellarSdk.scValToNative(returnVal) as string;
      }
      return null;
    } catch (err: any) {
      console.error("[nft] token_uri query failed:", err.message);
      return null;
    }
  }

  /**
   * Query owner_of for a specific token from a SEP-50 contract
   */
  async querySep50OwnerOf(contractId: string, tokenId: number) {
    try {
      const contract = new StellarSdk.Contract(contractId);
      const op = contract.call("owner_of", StellarSdk.nativeToScVal(tokenId, { type: "u32" }));

      const result = await sorobanRpc.simulateTransaction(
        new StellarSdk.TransactionBuilder(
          new StellarSdk.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
          { fee: "100", networkPassphrase: config.network === "testnet" ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC }
        ).addOperation(op).setTimeout(30).build()
      );

      if (StellarSdk.rpc.Api.isSimulationSuccess(result)) {
        const returnVal = result.result?.retval;
        if (returnVal) return StellarSdk.scValToNative(returnVal) as string;
      }
      return null;
    } catch (err: any) {
      console.error("[nft] owner_of query failed:", err.message);
      return null;
    }
  }

  /**
   * Build a SEP-50 transfer transaction XDR
   */
  async buildSep50Transfer(
    contractId: string,
    fromAddress: string,
    toAddress: string,
    tokenId: number,
  ) {
    try {
      const account = await horizon.loadAccount(fromAddress);
      const contract = new StellarSdk.Contract(contractId);

      const op = contract.call(
        "transfer_from",
        StellarSdk.nativeToScVal(fromAddress, { type: "address" }),
        StellarSdk.nativeToScVal(fromAddress, { type: "address" }),
        StellarSdk.nativeToScVal(toAddress, { type: "address" }),
        StellarSdk.nativeToScVal(tokenId, { type: "u32" }),
      );

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: "1000000", // 0.1 XLM max fee for Soroban
        networkPassphrase: config.network === "testnet" ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC,
      })
        .addOperation(op)
        .setTimeout(120)
        .build();

      // Simulate to get proper resources
      const simulated = await sorobanRpc.simulateTransaction(tx);
      if (!StellarSdk.rpc.Api.isSimulationSuccess(simulated)) {
        throw new Error("Transaction simulation failed");
      }

      const prepared = StellarSdk.rpc.assembleTransaction(tx, simulated).build();
      return { xdr: prepared.toXDR(), networkPassphrase: tx.networkPassphrase };
    } catch (err: any) {
      console.error("[nft] build transfer failed:", err.message);
      throw err;
    }
  }

  // ── Classic SEP-39 Detection ───────────────────────────────

  /**
   * Scan a Stellar account for potential SEP-39 NFT assets
   * (assets with supply=1 from issuers with specific TOML metadata)
   */
  async scanClassicNfts(publicKey: string) {
    try {
      const account = await horizon.loadAccount(publicKey);
      const nftCandidates: any[] = [];

      for (const balance of account.balances) {
        if (balance.asset_type === "native") continue;
        const b = balance as any;

        // SEP-39: NFTs are typically assets with very low supply (often 1)
        // and specific TOML metadata
        if (parseFloat(b.balance) > 0 && b.asset_code && b.asset_issuer) {
          try {
            const asset = await horizon.assets()
              .forCode(b.asset_code)
              .forIssuer(b.asset_issuer)
              .call();

            const record = asset.records?.[0];
            if (record) {
              const totalAmount = parseFloat(record.amount);
              // Likely NFT if supply is 1 (or very low) and issuer is locked
              if (totalAmount <= 10) {
                nftCandidates.push({
                  assetCode: b.asset_code,
                  assetIssuer: b.asset_issuer,
                  balance: b.balance,
                  totalSupply: totalAmount,
                  homeDomain: (record as any).home_domain || null,
                  isLocked: (record as any).flags?.auth_immutable || false,
                });
              }
            }
          } catch {
            // Skip assets that can't be queried
          }
        }
      }
      return nftCandidates;
    } catch (err: any) {
      console.error("[nft] classic scan failed:", err.message);
      return [];
    }
  }

  /**
   * Sync all tokens for a SEP-50 collection by querying the contract on-chain.
   * Iterates token IDs from 0 to totalSupply and indexes each one.
   */
  async syncCollectionTokens(collectionId: number) {
    const collection = await this.getCollection(collectionId);
    if (!collection || !collection.contractId) {
      throw new Error("Collection not found or missing contractId");
    }

    // Query current total supply from contract
    const contractData = await this.querySep50Contract(collection.contractId);
    if (!contractData) throw new Error("Failed to query contract");

    const results: any[] = [];
    for (let i = 0; i < contractData.totalSupply; i++) {
      try {
        const [ownerOf, tokenUri] = await Promise.all([
          this.querySep50OwnerOf(collection.contractId, i),
          this.querySep50TokenUri(collection.contractId, i),
        ]);

        if (!ownerOf) continue; // token may be burned

        // Try to fetch metadata from tokenUri
        let name: string | undefined;
        let description: string | undefined;
        let image: string | undefined;
        let attributes: any;

        if (tokenUri) {
          try {
            // Convert IPFS URI to HTTP gateway
            const httpUri = tokenUri.startsWith("ipfs://")
              ? tokenUri.replace("ipfs://", "https://ipfs.io/ipfs/")
              : tokenUri;
            validateExternalUrl(httpUri); // throws on private/unsafe URLs
            const resp = await fetch(httpUri, { signal: AbortSignal.timeout(10000) });
            if (resp.ok) {
              const metadata = await resp.json();
              name = metadata.name;
              description = metadata.description;
              image = metadata.image;
              attributes = metadata.attributes;
              // Also convert image IPFS URI
              if (image && image.startsWith("ipfs://")) {
                image = image.replace("ipfs://", "https://ipfs.io/ipfs/");
              }
            }
          } catch (err: any) {
            console.warn(`[nft] Failed to fetch metadata for token ${i}:`, err.message);
          }
        }

        const token = await this.indexToken({
          collectionId,
          tokenId: i,
          owner: ownerOf,
          name,
          description,
          image,
          metadataUri: tokenUri || undefined,
          attributes,
        });
        results.push(token);
      } catch (err: any) {
        console.warn(`[nft] Failed to sync token ${i}:`, err.message);
      }
    }

    // Update collection totalSupply
    await db.update(schema.nftCollections)
      .set({ totalSupply: contractData.totalSupply, updatedAt: new Date() })
      .where(eq(schema.nftCollections.id, collectionId));

    return { synced: results.length, totalSupply: contractData.totalSupply };
  }

}

export const nftService = new NftService();
