import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import CertificateDetailScreen from '@/app/(student)/certificate-detail';
import { credentialService } from '@/services/credentialService';
import type { MyCredential } from '@/types/credential';

jest.mock('@/services/credentialService');

const mockCredentialService = credentialService as jest.Mocked<typeof credentialService>;

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: 'cred-001' }),
}));

const MOCK_CREDENTIAL: MyCredential = {
  credentialId: 'cred-001',
  walletAddress: 'GBXYZ1234ABCD5678',
  txHash: 'abc123def456ghijklmnop',
  courseId: 'course-001',
  courseTitle: 'Blockchain 101',
  courseCode: 'BLK-101',
  quizId: null,
  quizTitle: null,
  network: 'public',
  issuedAt: '2026-10-01T10:00:00Z',
  sorobanTokenId: 42,
  contractId: 'CONTRACT_ABC_XYZ_123',
};

describe('CertificateDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCredentialService.getVerificationUrl.mockImplementation(
      (id) => `https://lms.smwebsystems.com/verify/${id}`
    );
    mockCredentialService.getPdfUrl.mockImplementation(
      (id) => `https://lms.smwebsystems.com/api/v1/credentials/${id}/pdf`
    );
    mockCredentialService.getStellarExplorerUrl.mockImplementation(
      (txHash, network) => {
        if (!txHash) return null;
        const net = network === 'testnet' ? 'testnet' : 'public';
        return `https://stellar.expert/explorer/${net}/tx/${txHash}`;
      }
    );
  });

  it('shows loading state initially', () => {
    mockCredentialService.fetchMyCredentials.mockReturnValue(new Promise(() => {}));

    render(<CertificateDetailScreen />);

    expect(screen.getByText('Loading certificate…')).toBeTruthy();
  });

  it('renders certificate details after loading', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([MOCK_CREDENTIAL]);

    render(<CertificateDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('Blockchain 101')).toBeTruthy();
    });
    expect(screen.getByText('BLK-101')).toBeTruthy();
    expect(screen.getByText('cred-001')).toBeTruthy();
    expect(screen.getByText('#42')).toBeTruthy();
  });

  it('shows error when credential not found', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([]);

    render(<CertificateDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('Certificate not found.')).toBeTruthy();
    });
  });

  it('shows View on Stellar button when txHash exists', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([MOCK_CREDENTIAL]);

    render(<CertificateDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('View on Stellar')).toBeTruthy();
    });
  });

  it('opens Stellar explorer on button press', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([MOCK_CREDENTIAL]);

    render(<CertificateDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('View on Stellar')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('View on Stellar'));

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://stellar.expert/explorer/public/tx/abc123def456ghijklmnop'
    );
  });

  it('copies verification URL on button press', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([MOCK_CREDENTIAL]);

    render(<CertificateDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('Copy Verification Link')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Copy Verification Link'));

    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
        'https://lms.smwebsystems.com/verify/cred-001'
      );
    });
  });

  it('shows download PDF button', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([MOCK_CREDENTIAL]);

    render(<CertificateDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('Download PDF')).toBeTruthy();
    });
  });

  it('action buttons have accessible roles', async () => {
    mockCredentialService.fetchMyCredentials.mockResolvedValueOnce([MOCK_CREDENTIAL]);

    render(<CertificateDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText('View on Stellar')).toBeTruthy();
    });

    // Button component already sets accessibilityRole="button"
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('shows error on network failure', async () => {
    mockCredentialService.fetchMyCredentials.mockRejectedValueOnce(
      new Error('Network Error')
    );

    render(<CertificateDetailScreen />);

    await waitFor(() => {
      expect(screen.getByText(/could not load/i)).toBeTruthy();
    });
  });
});
