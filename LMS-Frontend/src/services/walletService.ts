const AMMA_WALLET_BASE = import.meta.env.VITE_AMMA_WALLET_URL || "http://localhost:3001/";
// Safe URL join — prevents template-literal concatenation bug when base lacks trailing slash
const walletUrl = (path: string) => new URL(path, AMMA_WALLET_BASE).toString();

import type { NFTResponse, WalletStatusResponse } from "../types/api.js";
import api from "./api.js";

export async function getWalletStatus(): Promise<WalletStatusResponse> {
  const res = await api.get<{ success: boolean; data: WalletStatusResponse }>('/wallet/status');
  return res.data.data;
}

export async function getUserNfts(walletAddress: string): Promise<NFTResponse> {
  const res = await fetch(walletUrl(`api/v1/nfts/owner/${walletAddress}`), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Amma get NFTs failed (${res.status})`);
  }

  const result = (await res.json()) as NFTResponse;
  return result;
}

