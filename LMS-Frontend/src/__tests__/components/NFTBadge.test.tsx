/**
 * Phase 23 C4: NFTBadge + CertificateVerification tests.
 *
 * BADGE-FE-1: NFTBadge renders course title, date, wallet
 * BADGE-FE-2: NFTBadge shows Stellar explorer link when txHash present
 * BADGE-FE-3: NFTBadge share button copies verification URL
 * BADGE-FE-4: CertificateVerification page renders verified state
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NFTBadge from '../../components/NFTBadge';
import CertificateVerification from '../../pages/CertificateVerification';

const mockCredential = {
  credentialId: 'cred-1234-5678-abcd-efgh',
  courseTitle: 'Blockchain 101',
  courseCode: 'BVC-101',
  walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE',
  txHash: 'abc123txhash456def',
  sorobanTokenId: 42,
  issuedAt: '2026-08-07T12:00:00Z',
  network: 'public' as const,
};

describe('NFTBadge', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('BADGE-FE-1: renders course title, date, and wallet', () => {
    render(<NFTBadge {...mockCredential} />);
    expect(screen.getByText('Blockchain 101')).toBeTruthy();
    expect(screen.getByText('BVC-101')).toBeTruthy();
    // Truncated wallet: GABC…BCDE
    expect(screen.getByText(/GABC\u2026BCDE/)).toBeTruthy();
    // Date rendered
    expect(screen.getByText(/August 7, 2026/)).toBeTruthy();
  });

  it('BADGE-FE-2: shows Stellar explorer link when txHash present', () => {
    render(<NFTBadge {...mockCredential} />);
    const link = screen.getByRole('link', { name: /View on Stellar/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(
      'https://stellar.expert/explorer/public/tx/abc123txhash456def',
    );
  });

  it('BADGE-FE-3: share button copies verification URL', () => {
    render(<NFTBadge {...mockCredential} />);
    const shareBtn = screen.getByRole('button', { name: /Share/i });
    fireEvent.click(shareBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/verify/cred-1234-5678-abcd-efgh'),
    );
  });
});

describe('CertificateVerification', () => {
  it('BADGE-FE-4: renders verified credential data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            credential: {
              credentialId: 'cred-test-id',
              studentName: 'Alice Test',
              courseTitle: 'Blockchain 101',
              courseCode: 'BVC-101',
              walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE',
              txHash: 'txhash123',
              contractId: 'CDPKSOOE4UZF',
              network: 'public',
              sorobanTokenId: 42,
              issuedAt: '2026-08-07T12:00:00Z',
              issuer: 'SM Web Systems Blockchain Academy',
            },
          },
        }),
    });

    render(
      <MemoryRouter initialEntries={['/verify/cred-test-id']}>
        <Routes>
          <Route path="/verify/:credentialId" element={<CertificateVerification />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for data to load
    expect(await screen.findByText('Blockchain 101')).toBeTruthy();
    expect(screen.getByText('Alice Test')).toBeTruthy();
    expect(screen.getByText(/Verified Certificate/i)).toBeTruthy();
  });
});
