import api from '@/lib/api';
import { walletService } from '@/services/walletService';
import type { WalletStatus } from '@/types/credential';

jest.mock('@/lib/api');
const mockApi = api as jest.Mocked<typeof api>;

describe('walletService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchWalletStatus', () => {
    it('returns linked wallet status', async () => {
      const mockStatus: WalletStatus = {
        walletAddress: 'GBXYZ1234ABCD5678',
        walletLinkingStatus: 'linked',
        network: 'public',
      };
      mockApi.get.mockResolvedValueOnce({
        data: { success: true, data: mockStatus },
      });

      const result = await walletService.fetchWalletStatus();

      expect(mockApi.get).toHaveBeenCalledWith('/wallet/status');
      expect(result).toEqual(mockStatus);
    });

    it('returns unlinked wallet status', async () => {
      const mockStatus: WalletStatus = {
        walletAddress: null,
        walletLinkingStatus: 'none',
        network: null,
      };
      mockApi.get.mockResolvedValueOnce({
        data: { success: true, data: mockStatus },
      });

      const result = await walletService.fetchWalletStatus();

      expect(result.walletLinkingStatus).toBe('none');
      expect(result.walletAddress).toBeNull();
    });

    it('throws on network error', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network Error'));

      await expect(walletService.fetchWalletStatus()).rejects.toThrow('Network Error');
    });
  });

  describe('isWalletLinked', () => {
    it('returns true when status is linked', () => {
      expect(walletService.isWalletLinked('linked')).toBe(true);
    });

    it('returns false when status is none', () => {
      expect(walletService.isWalletLinked('none')).toBe(false);
    });

    it('returns false when status is existing_account', () => {
      expect(walletService.isWalletLinked('existing_account')).toBe(false);
    });
  });

  describe('safety: no mutating HTTP methods', () => {
    it('only uses GET requests', () => {
      const methodNames = Object.keys(walletService);
      const mutatingNames = methodNames.filter(name =>
        /^(create|update|delete|remove|link|unlink|post|put|patch)/i.test(name)
      );
      expect(mutatingNames).toEqual([]);
    });
  });
});
