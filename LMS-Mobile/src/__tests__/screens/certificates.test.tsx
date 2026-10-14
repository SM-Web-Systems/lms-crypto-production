import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import CertificatesScreen from '@/app/(student)/certificates';
import { credentialService } from '@/services/credentialService';
import { walletService } from '@/services/walletService';
import type { MyCredential, WalletStatus } from '@/types/credential';

jest.mock('@/services/credentialService');
jest.mock('@/services/walletService');

const mockCredentialService = credentialService as jest.Mocked<typeof credentialService>;
const mockWalletService = walletService as jest.Mocked<typeof walletService>;

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

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

const LINKED_WALLET: WalletStatus = {
  walletAddress: 'GBXYZ1234ABCD5678',
  walletLinkingStatus: 'linked',
  network: 'public',
};

const UNLINKED_WALLET: WalletStatus = {
  walletAddress: null,
  walletLinkingStatus: 'none',
  network: null,
};

describe('CertificatesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWalletService.isWalletLinked.mockImplementation(
      (status) => status === 'linked'
    );
  });

  it('shows loading state initially', () => {
    mockCredentialService.fetchMyCredentials.mockReturnValue(new Promise(() => {}));
    mockWalletService.fetchWalletStatus.mockReturnValue(new Promise(() => {}));

    render(<CertificatesScreen />);

    expect(screen.getByText('Loading certificates…')).toBeTruthy();
  });

  it('shows empty state when no credentials', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([]);
    mockWalletService.fetchWalletStatus.mockResolvedValueOnce(UNLINKED_WALLET);

    render(<CertificatesScreen />);

    await waitFor(() => {
      expect(screen.getByText('No certificates yet')).toBeTruthy();
    });
    expect(screen.getByText('0 certificates')).toBeTruthy();
  });

  it('renders credential cards when data loads', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([MOCK_CREDENTIAL]);
    mockWalletService.fetchWalletStatus.mockResolvedValueOnce(LINKED_WALLET);

    render(<CertificatesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Blockchain 101')).toBeTruthy();
    });
    expect(screen.getByText('BLK-101')).toBeTruthy();
    expect(screen.getByText('1 certificate')).toBeTruthy();
  });

  it('shows linked wallet banner', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([]);
    mockWalletService.fetchWalletStatus.mockResolvedValueOnce(LINKED_WALLET);

    render(<CertificatesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Wallet linked')).toBeTruthy();
    });
  });

  it('shows unlinked wallet banner', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([]);
    mockWalletService.fetchWalletStatus.mockResolvedValueOnce(UNLINKED_WALLET);

    render(<CertificatesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Wallet not linked')).toBeTruthy();
    });
  });

  it('navigates to detail screen on card press', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([MOCK_CREDENTIAL]);
    mockWalletService.fetchWalletStatus.mockResolvedValueOnce(LINKED_WALLET);

    render(<CertificatesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Blockchain 101')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Blockchain 101'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(student)/certificate-detail',
      params: { id: 'cred-001' },
    });
  });

  it('shows error banner on network failure', async () => {
    mockCredentialService.fetchMyCredentials.mockRejectedValueOnce(
      new Error('Network Error')
    );
    mockWalletService.fetchWalletStatus.mockRejectedValueOnce(
      new Error('Network Error')
    );

    render(<CertificatesScreen />);

    await waitFor(() => {
      expect(screen.getByText(/could not load/i)).toBeTruthy();
    });
  });

  it('handles wallet fetch failure gracefully', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([MOCK_CREDENTIAL]);
    mockWalletService.fetchWalletStatus.mockRejectedValueOnce(
      new Error('Wallet error')
    );

    render(<CertificatesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Blockchain 101')).toBeTruthy();
    });
    // Should not show wallet banner if fetch failed
    expect(screen.queryByText('Wallet linked')).toBeNull();
    expect(screen.queryByText('Wallet not linked')).toBeNull();
  });
});
