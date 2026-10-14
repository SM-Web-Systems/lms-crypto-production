import api from '../lib/api';
import type { WalletStatus } from '../types/credential';

export const walletService = {
  /** GET /wallet/status — current wallet linking state */
  async fetchWalletStatus(): Promise<WalletStatus> {
    const response = await api.get<{
      success: boolean;
      data: WalletStatus;
    }>('/wallet/status');

    return response.data.data;
  },

  /** Check whether a wallet linking status means the wallet is active */
  isWalletLinked(status: WalletStatus['walletLinkingStatus']): boolean {
    return status === 'linked';
  },
};
