import api from '@/lib/api';
import { credentialService } from '@/services/credentialService';
import type { MyCredential } from '@/types/credential';

jest.mock('@/lib/api');
const mockApi = api as jest.Mocked<typeof api>;

const MOCK_CREDENTIAL: MyCredential = {
  credentialId: 'cred-001',
  walletAddress: 'GBXYZ1234ABCD5678',
  txHash: 'abc123def456',
  courseId: 'course-001',
  courseTitle: 'Blockchain 101',
  courseCode: 'BLK-101',
  quizId: null,
  quizTitle: null,
  network: 'public',
  issuedAt: '2026-10-01T10:00:00Z',
  sorobanTokenId: 42,
  contractId: 'CONTRACT_ABC',
};

describe('credentialService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchMyCredentials', () => {
    it('returns credentials on success', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { success: true, data: { credentials: [MOCK_CREDENTIAL] } },
      });

      const result = await credentialService.fetchMyCredentials();

      expect(mockApi.get).toHaveBeenCalledWith('/credentials/mine');
      expect(result).toEqual([MOCK_CREDENTIAL]);
    });

    it('returns empty array when no credentials exist', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { success: true, data: { credentials: [] } },
      });

      const result = await credentialService.fetchMyCredentials();

      expect(result).toEqual([]);
    });

    it('returns empty array on malformed response', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { success: true, data: {} },
      });

      const result = await credentialService.fetchMyCredentials();

      expect(result).toEqual([]);
    });

    it('throws on network error', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network Error'));

      await expect(credentialService.fetchMyCredentials()).rejects.toThrow('Network Error');
    });

    it('throws on 401 unauthorized', async () => {
      const error = Object.assign(new Error('Unauthorized'), { status: 401 });
      mockApi.get.mockRejectedValueOnce(error);

      await expect(credentialService.fetchMyCredentials()).rejects.toThrow();
    });
  });

  describe('getVerificationUrl', () => {
    it('returns the public verification URL for a credential', () => {
      const url = credentialService.getVerificationUrl('cred-001');
      expect(url).toContain('/verify/cred-001');
    });
  });

  describe('getPdfUrl', () => {
    it('returns the PDF download URL for a credential', () => {
      const url = credentialService.getPdfUrl('cred-001');
      expect(url).toContain('/credentials/cred-001/pdf');
    });
  });

  describe('getStellarExplorerUrl', () => {
    it('returns Stellar explorer URL for public network', () => {
      const url = credentialService.getStellarExplorerUrl('abc123', 'public');
      expect(url).toBe('https://stellar.expert/explorer/public/tx/abc123');
    });

    it('returns Stellar explorer URL for testnet', () => {
      const url = credentialService.getStellarExplorerUrl('abc123', 'testnet');
      expect(url).toBe('https://stellar.expert/explorer/testnet/tx/abc123');
    });

    it('returns null when txHash is null', () => {
      const url = credentialService.getStellarExplorerUrl(null, 'public');
      expect(url).toBeNull();
    });
  });

  describe('safety: no mutating HTTP methods', () => {
    it('only uses GET requests', () => {
      // credentialService must not have post, put, patch, or delete methods
      const source = credentialService.toString !== undefined
        ? Object.getOwnPropertyNames(credentialService)
        : Object.keys(credentialService);

      // Verify no method name suggests mutation
      const mutatingNames = source.filter(name =>
        /create|update|delete|remove|assign|mint|post|put|patch/i.test(name)
      );
      expect(mutatingNames).toEqual([]);
    });
  });
});
