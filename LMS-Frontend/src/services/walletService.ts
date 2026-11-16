import type { NFTResponse, WalletStatusResponse } from "../types/api.js";
import api from "./api.js";

export async function getWalletStatus(): Promise<WalletStatusResponse> {
  const res = await api.get<{ success: boolean; data: WalletStatusResponse }>('/wallet/status');
  return res.data.data;
}

export interface UserNfts { nfts: NFTResponse | null; unavailable: boolean }

/** The learner's own NFT badges, through the LMS server (no browser call to the wallet, so no CORS). */
export async function getUserNfts(): Promise<UserNfts> {
  const res = await api.get<{ success: boolean; data: NFTResponse | null; unavailable?: boolean }>('/wallet/nfts');
  return { nfts: res.data.data, unavailable: !!res.data.unavailable };
}

