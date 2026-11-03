/** Minted NFT credential returned by GET /api/v1/credentials/mine */
export interface MyCredential {
  credentialId: string;
  walletAddress: string;
  txHash: string | null;
  courseId: string | null;
  courseTitle: string | null;
  courseCode: string | null;
  quizId: string | null;
  quizTitle: string | null;
  network: string | null;
  issuedAt: string;
  sorobanTokenId: number | null;
  contractId: string;
}

/** Wallet linking status returned by GET /api/v1/wallet/status */
export interface WalletStatus {
  walletAddress: string | null;
  walletLinkingStatus: 'none' | 'linked' | 'existing_account';
  network: string | null;
}
