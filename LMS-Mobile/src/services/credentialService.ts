import api from '../lib/api';
import type { MyCredential } from '../types/credential';

const LMS_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://lms.smwebsystems.com/api/v1';

export const credentialService = {
  /** GET /credentials/mine — student's own minted NFT certificates */
  async fetchMyCredentials(): Promise<MyCredential[]> {
    const response = await api.get<{
      success: boolean;
      data?: { credentials?: MyCredential[] };
    }>('/credentials/mine');

    const credentials = response.data?.data?.credentials;
    return Array.isArray(credentials) ? credentials : [];
  },

  /** Build the public verification URL for a credential */
  getVerificationUrl(credentialId: string): string {
    // Strip /api/v1 to get the site origin for the /verify/ page
    const origin = LMS_BASE_URL.replace(/\/api\/v1\/?$/, '');
    return `${origin}/verify/${credentialId}`;
  },

  /** Build the PDF download URL for a credential */
  getPdfUrl(credentialId: string): string {
    return `${LMS_BASE_URL}/credentials/${credentialId}/pdf`;
  },

  /** Build the Stellar explorer URL for a transaction */
  getStellarExplorerUrl(txHash: string | null, network: string | null): string | null {
    if (!txHash) return null;
    const net = network === 'testnet' ? 'testnet' : 'public';
    return `https://stellar.expert/explorer/${net}/tx/${txHash}`;
  },
};
