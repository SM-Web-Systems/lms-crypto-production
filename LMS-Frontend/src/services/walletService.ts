import api from "./api";
import { ApiResponse } from "../types/api";

export interface WalletResponse {
  walletAddress: string;
}

export const walletService = {
  async createWallet(): Promise<WalletResponse> {
    const response =
      await api.post<ApiResponse<WalletResponse>>("/auth/sync-clerk");

    if (response.data.success && response.data.data) {
      return response.data.data;
    }

    throw new Error("Failed to sync wallet");
  },
};
