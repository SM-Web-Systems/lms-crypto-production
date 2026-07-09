import { v4 as uuidv4 } from "uuid";

/**
 * Generates a delegated amma-wallet address for a user.
 */

const AMMA_WALLET_URL = process.env.AMMA_WALLET_URL || "http://localhost:3001/";

interface RegisterAmmAWalletResponse {
  user: {
    id: number;
    email: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
  };
  accessToken: string;
  refreshToken: string;
}

interface KeypairResponse {
  publicKey: string;
  secretKey: string;
}

export interface GetNFTResponse {
  indexed: {
    tokens: [
      {
        token: {
          id: number;
          collectionId: number;
          tokenId: number;
          owner: string;
          metadataUri: string;
          name: string;
          description: string;
          image: string;
          attributes: [
            {
              value: string;
              trait_type: string;
            },
            {
              value: string;
              trait_type: string;
            }
          ],
          isBurned: boolean;
          lastSyncedAt: null;
          createdAt: string;
          updatedAt: string;
        },
        collection: {
          id: number;
          type: string;
          contractId: string;
          assetCode: null;
          assetIssuer: null;
          name: string;
          symbol: string;
          baseUri: string;
          description: string;
          image: null;
          creator: null;
          totalSupply: number;
          isVerified: boolean;
          network: string;
          createdAt: string;
          updatedAt: string;
        }
      }
    ];
  }
}

export async function getUserNfts(walletAddress: string): Promise<GetNFTResponse> {
  return fetch(`${AMMA_WALLET_URL}api/v1/nfts/owner/${walletAddress}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`Amma get NFTs failed (${res.status})`);
    }
    return res.json() as Promise<GetNFTResponse>;
  });
}

export async function generateWalletAddress(
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${AMMA_WALLET_URL}api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email,
      password: password,
    }),
  });

  if (!res.ok) {
    throw new Error(`Amma register failed (${res.status})`);
  }

  const result = (await res.json()) as RegisterAmmAWalletResponse;

  const accessToken = result.accessToken;

  const keypairRes = await fetch(`${AMMA_WALLET_URL}api/v1/keypair/generate`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const keyPairRes = (await keypairRes.json()) as KeypairResponse;

  if (!keypairRes.ok) {
    throw new Error(`Amma keypair generation failed (${keypairRes.status})`);
  }

  const walletAdditionRes = await fetch(`${AMMA_WALLET_URL}api/v1/wallets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: email,
      publicKey: keyPairRes.publicKey,
      encryptedSecret: "",
      network: "testnet",
    }),
  });

  if (!walletAdditionRes.ok) {
    throw new Error(
      `Amma wallet creation failed (${walletAdditionRes.status})`,
    );
  }

  return keyPairRes.publicKey;
}

/**
 * Creates a wallet for a new user
 *
 * Steps:
 * 1. Generate a unique wallet address
 * 2. Store it in the database with the user
 * 3. Return the wallet address
 */
export async function createUserWallet(
  email: string,
  password: string,
): Promise<string> {
  try {
    const walletAddress = await generateWalletAddress(email, password);
    // We'll insert this in the database in the next step
    return walletAddress;
  } catch (error) {
    console.error("Error creating wallet:", error);
    throw new Error("Failed to create wallet for user");
  }
}
