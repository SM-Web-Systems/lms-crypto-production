import { FastifyInstance } from "fastify";
import { nftService } from "../modules/nft/nft.service";
import { authMiddleware } from "../middleware/auth";
import { auditLog } from "../lib/audit";

export async function nftRoutes(app: FastifyInstance) {

  // ── Collections ────────────────────────────────────────────

  app.get("/api/v1/nfts/collections", {
    schema: {
      tags: ["NFTs"],
      summary: "List NFT collections",
      description: "List all registered NFT collections with pagination.",
      querystring: {
        type: "object" as const,
        properties: {
          limit: { type: "integer" as const, default: 50, minimum: 1, maximum: 100 },
          offset: { type: "integer" as const, default: 0, minimum: 0 },
          network: { type: "string" as const, enum: ["testnet", "mainnet"] },
        },
      },
      response: {
        200: {
          type: "object" as const,
          properties: {
            collections: { type: "array" as const, items: { type: "object" as const, additionalProperties: true } },
            total: { type: "number" as const },
          },
        },
      },
    },
  }, async (request) => {
    const { limit, offset, network } = request.query as any;
    return nftService.listCollections(limit, offset, network);
  });

  app.get("/api/v1/nfts/collections/:id", {
    schema: {
      tags: ["NFTs"],
      summary: "Get NFT collection by ID",
      params: {
        type: "object" as const,
        properties: { id: { type: "integer" as const } },
        required: ["id"] as const,
      },
      response: {
        200: { type: "object" as const, additionalProperties: true },
        404: { type: "object" as const, properties: { error: { type: "string" as const } } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: number };
    const collection = await nftService.getCollection(id);
    if (!collection) return reply.status(404).send({ error: "Collection not found" });
    return collection;
  });

  app.post("/api/v1/nfts/collections", {
    schema: {
      tags: ["NFTs"],
      summary: "Register a new NFT collection",
      description: "Register a SEP-50 (Soroban) or SEP-39 (Classic) NFT collection. Auth required.",
      body: {
        type: "object" as const,
        required: ["name", "standard"] as const,
        properties: {
          contractId: { type: "string" as const, description: "Soroban contract ID (SEP-50)" },
          issuerAddress: { type: "string" as const, description: "Classic issuer address (SEP-39)" },
          name: { type: "string" as const },
          symbol: { type: "string" as const },
          standard: { type: "string" as const, enum: ["sep50", "sep39"] },
          baseUri: { type: "string" as const },
          description: { type: "string" as const },
          imageUrl: { type: "string" as const },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: "object" as const, additionalProperties: true },
        400: { type: "object" as const, properties: { error: { type: "string" as const } } },
      },
    },
    preHandler: authMiddleware,
  }, async (request: any, reply) => {
    const body = request.body as any;
    const userId = request.user!.userId;

    if (body.standard === "sep50" && !body.contractId) {
      return reply.status(400).send({ error: "contractId is required for SEP-50 collections" });
    }
    if (body.standard === "sep39" && !body.issuerAddress) {
      return reply.status(400).send({ error: "issuerAddress is required for SEP-39 collections" });
    }

    // For SEP-50, try to auto-fill metadata from the contract
    if (body.standard === "sep50" && body.contractId) {
      const contractData = await nftService.querySep50Contract(body.contractId);
      if (contractData) {
        if (!body.name && contractData.name) body.name = contractData.name;
        if (!body.symbol && contractData.symbol) body.symbol = contractData.symbol;
      }
    }

    const collection = await nftService.registerCollection({
      ...body,
      creatorAddress: body.creatorAddress || null,
    });

    await auditLog("nft_collection_registered", {
      userId,
      detail: { collectionId: collection.id, standard: body.standard, contractId: body.contractId },
      ip: request.ip,
    });

    return collection;
  });

  // ── Tokens ─────────────────────────────────────────────────

  app.get("/api/v1/nfts/collections/:collectionId/tokens", {
    schema: {
      tags: ["NFTs"],
      summary: "List tokens in a collection",
      params: {
        type: "object" as const,
        properties: { collectionId: { type: "integer" as const } },
        required: ["collectionId"] as const,
      },
      querystring: {
        type: "object" as const,
        properties: {
          limit: { type: "integer" as const, default: 50, minimum: 1, maximum: 100 },
          offset: { type: "integer" as const, default: 0, minimum: 0 },
        },
      },
      response: {
        200: {
          type: "object" as const,
          properties: {
            tokens: { type: "array" as const, items: { type: "object" as const, additionalProperties: true } },
            total: { type: "number" as const },
          },
        },
      },
    },
  }, async (request) => {
    const { collectionId } = request.params as { collectionId: number };
    const { limit, offset } = request.query as any;
    return nftService.getTokensByCollection(collectionId, limit, offset);
  });

  app.get("/api/v1/nfts/owner/:publicKey", {
    schema: {
      tags: ["NFTs"],
      summary: "Get all NFTs owned by an address",
      description: "Returns indexed NFTs and scans for Classic SEP-39 NFT candidates.",
      params: {
        type: "object" as const,
        properties: { publicKey: { type: "string" as const } },
        required: ["publicKey"] as const,
      },
      querystring: {
        type: "object" as const,
        properties: {
          limit: { type: "integer" as const, default: 50, minimum: 1, maximum: 100 },
          offset: { type: "integer" as const, default: 0, minimum: 0 },
          includeClassicScan: { type: "boolean" as const, default: false },
        },
      },
      response: {
        200: {
          type: "object" as const,
          properties: {
            indexed: { type: "object" as const, properties: {
              tokens: { type: "array" as const, items: { type: "object" as const, additionalProperties: true } },
              total: { type: "number" as const },
            }},
            classicNfts: { type: "array" as const, items: { type: "object" as const, additionalProperties: true } },
          },
        },
      },
    },
  }, async (request) => {
    const { publicKey } = request.params as { publicKey: string };
    const { limit, offset, includeClassicScan } = request.query as any;

    const indexed = await nftService.getTokensByOwner(publicKey, limit, offset);
    let classicNfts: any[] = [];
    if (includeClassicScan) {
      classicNfts = await nftService.scanClassicNfts(publicKey);
    }
    return { indexed, classicNfts };
  });

  app.get("/api/v1/nfts/token/:collectionId/:tokenId", {
    schema: {
      tags: ["NFTs"],
      summary: "Get single NFT token detail",
      params: {
        type: "object" as const,
        properties: {
          collectionId: { type: "integer" as const },
          tokenId: { type: "string" as const },
        },
        required: ["collectionId", "tokenId"] as const,
      },
      response: {
        200: { type: "object" as const, additionalProperties: true },
        404: { type: "object" as const, properties: { error: { type: "string" as const } } },
      },
    },
  }, async (request, reply) => {
    const { collectionId, tokenId } = request.params as { collectionId: number; tokenId: string };
    const token = await nftService.getToken(collectionId, tokenId);
    if (!token) return reply.status(404).send({ error: "Token not found" });
    return token;
  });

  // ── SEP-50 Soroban Queries ─────────────────────────────────

  app.get("/api/v1/nfts/sep50/:contractId/metadata", {
    schema: {
      tags: ["NFTs"],
      summary: "Query SEP-50 contract metadata via Soroban RPC",
      description: "Reads name, symbol, and total_supply directly from a Soroban NFT contract.",
      params: {
        type: "object" as const,
        properties: { contractId: { type: "string" as const } },
        required: ["contractId"] as const,
      },
      response: {
        200: { type: "object" as const, additionalProperties: true },
        500: { type: "object" as const, properties: { error: { type: "string" as const } } },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const { contractId } = request.params as { contractId: string };
    const data = await nftService.querySep50Contract(contractId);
    if (!data) return reply.status(500).send({ error: "Failed to query contract" });
    return data;
  });

  app.get("/api/v1/nfts/sep50/:contractId/token/:tokenId", {
    schema: {
      tags: ["NFTs"],
      summary: "Query SEP-50 token metadata (token_uri, owner_of)",
      params: {
        type: "object" as const,
        properties: {
          contractId: { type: "string" as const },
          tokenId: { type: "integer" as const },
        },
        required: ["contractId", "tokenId"] as const,
      },
      response: {
        200: { type: "object" as const, additionalProperties: true },
      },
    },
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (request) => {
    const { contractId, tokenId } = request.params as { contractId: string; tokenId: number };
    const [tokenUri, ownerOf] = await Promise.all([
      nftService.querySep50TokenUri(contractId, tokenId),
      nftService.querySep50OwnerOf(contractId, tokenId),
    ]);
    return { contractId, tokenId, tokenUri, ownerOf };
  });

  // ── Transfer ───────────────────────────────────────────────

  app.post("/api/v1/nfts/transfer", {
    schema: {
      tags: ["NFTs"],
      summary: "Build NFT transfer transaction (SEP-50)",
      description: "Builds an unsigned Soroban transaction to transfer an NFT. The sender must be authenticated and own the wallet.",
      body: {
        type: "object" as const,
        required: ["contractId", "fromAddress", "toAddress", "tokenId"] as const,
        properties: {
          contractId: { type: "string" as const },
          fromAddress: { type: "string" as const },
          toAddress: { type: "string" as const },
          tokenId: { type: "integer" as const },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object" as const,
          properties: {
            xdr: { type: "string" as const },
            networkPassphrase: { type: "string" as const },
          },
        },
        400: { type: "object" as const, properties: { error: { type: "string" as const } } },
        403: { type: "object" as const, properties: { error: { type: "string" as const } } },
      },
    },
    preHandler: authMiddleware,
  }, async (request: any, reply) => {
    const { contractId, fromAddress, toAddress, tokenId } = request.body as any;
    const userId = request.user!.userId;

    // Ownership check
    const { db: database } = await import("../db");
    const { userWallets } = await import("../db/schema");
    const [wallet] = await database.select().from(userWallets)
      .where(and(
        eq(userWallets.userId, userId),
        eq(userWallets.publicKey, fromAddress),
      )).limit(1);

    if (!wallet) {
      return reply.status(403).send({ error: "Wallet does not belong to authenticated user" });
    }

    try {
      const result = await nftService.buildSep50Transfer(contractId, fromAddress, toAddress, tokenId);
      await auditLog("nft_transfer", {
        userId,
        detail: { contractId, tokenId, from: fromAddress, to: toAddress },
        ip: request.ip,
      });
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to build transfer" });
    }
  });


  // ── Mint / Index ───────────────────────────────────────────

  app.post("/api/v1/nfts/mint", {
    schema: {
      tags: ["NFTs"],
      summary: "Index an NFT after minting",
      description: "After minting an NFT on-chain, call this to index it in the database so it appears in owner lookups.",
      body: {
        type: "object" as const,
        required: ["collectionId", "tokenId", "owner"] as const,
        properties: {
          collectionId: { type: "integer" as const, description: "ID of the registered collection" },
          tokenId: { type: "integer" as const, description: "On-chain token ID (e.g. 0, 1, 2...)" },
          owner: { type: "string" as const, description: "Stellar public key of the owner" },
          name: { type: "string" as const },
          description: { type: "string" as const },
          image: { type: "string" as const },
          metadataUri: { type: "string" as const },
          attributes: { type: "array" as const, items: { type: "object" as const, additionalProperties: true } },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: "object" as const, additionalProperties: true },
        400: { type: "object" as const, properties: { error: { type: "string" as const } } },
        404: { type: "object" as const, properties: { error: { type: "string" as const } } },
      },
    },
    preHandler: authMiddleware,
  }, async (request: any, reply) => {
    const { collectionId, tokenId, owner, name, description, image, metadataUri, attributes } = request.body as any;
    const userId = request.user!.userId;

    // Verify collection exists
    const collection = await nftService.getCollection(collectionId);
    if (!collection) {
      return reply.status(404).send({ error: "Collection not found" });
    }

    // For SEP-50, optionally verify on-chain ownership
    if (collection.contractId) {
      try {
        const onChainOwner = await nftService.querySep50OwnerOf(collection.contractId, tokenId);
        if (onChainOwner && onChainOwner !== owner) {
          return reply.status(400).send({ error: `On-chain owner mismatch: expected ${onChainOwner}, got ${owner}` });
        }
      } catch (err: any) {
        // Contract query failed — allow indexing anyway but log warning
        console.warn(`[nft] Could not verify on-chain owner for token ${tokenId}:`, err.message);
      }
    }

    try {
      const token = await nftService.indexToken({
        collectionId,
        tokenId,
        owner,
        name,
        description,
        image,
        metadataUri,
        attributes,
      });

      await auditLog("nft_mint_indexed", {
        userId,
        detail: { collectionId, tokenId, owner },
        ip: request.ip,
      });

      return token;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to index token" });
    }
  });

  app.post("/api/v1/nfts/collections/:collectionId/sync", {
    schema: {
      tags: ["NFTs"],
      summary: "Sync collection tokens from on-chain",
      description: "Queries the SEP-50 contract and indexes all tokens (owner, metadata). Useful after batch minting.",
      params: {
        type: "object" as const,
        properties: { collectionId: { type: "string" as const } },
        required: ["collectionId"] as const,
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object" as const,
          properties: {
            synced: { type: "number" as const },
            totalSupply: { type: "number" as const },
          },
        },
        400: { type: "object" as const, properties: { error: { type: "string" as const } } },
        404: { type: "object" as const, properties: { error: { type: "string" as const } } },
      },
    },
    preHandler: authMiddleware,
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request: any, reply) => {
    const collectionId = Number((request.params as any).collectionId);
    const userId = request.user!.userId;

    try {
      const result = await nftService.syncCollectionTokens(collectionId);
      await auditLog("nft_collection_synced", {
        userId,
        detail: { collectionId, ...result },
        ip: request.ip,
      });
      return result;
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message || "Sync failed" });
    }
  });

  // ── Classic SEP-39 Scan ────────────────────────────────────

  app.get("/api/v1/nfts/classic/:publicKey", {
    schema: {
      tags: ["NFTs"],
      summary: "Scan account for Classic SEP-39 NFT candidates",
      description: "Scans a Stellar account for assets that match SEP-39 NFT patterns (supply ≤ 10).",
      params: {
        type: "object" as const,
        properties: { publicKey: { type: "string" as const } },
        required: ["publicKey"] as const,
      },
      response: {
        200: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              assetCode: { type: "string" as const },
              assetIssuer: { type: "string" as const },
              balance: { type: "string" as const },
              totalSupply: { type: "number" as const },
              homeDomain: { type: "string" as const, nullable: true },
              isLocked: { type: "boolean" as const },
            },
          },
        },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request) => {
    const { publicKey } = request.params as { publicKey: string };
    return nftService.scanClassicNfts(publicKey);
  });
}
