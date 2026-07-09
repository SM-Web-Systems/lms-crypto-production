const AMMA_WALLET_URL = import.meta.env.VITE_AMMA_WALLET_URL || "http://localhost:3001/";

import type { NFTResponse } from "../types/api.js";

export async function getUserNfts(walletAddress: string): Promise<NFTResponse> {
  const res = await fetch(`${AMMA_WALLET_URL}api/v1/nfts/owner/${walletAddress}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Amma get NFTs failed (${res.status})`);
  }

  const result = (await res.json()) as NFTResponse;
  console.log("NFT result:", result);
  return result;
}

