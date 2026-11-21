import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CertificateVerification from '../../pages/CertificateVerification';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,x') } }));

const credential = {
  credentialId: 'cred-1', studentName: 'Ada', courseTitle: 'Blockchain 101', courseCode: 'BVC-101', walletAddress: 'G',
  txHash: null, contractId: 'C', network: 'testnet', sorobanTokenId: null, issuedAt: '2026-10-01T00:00:00Z', issuer: 'SM Web Systems',
};
const ok = { ok: true, status: 200, json: async () => ({ success: true, data: { credential } }) };
const status = (code: number) => ({ ok: false, status: code, json: async () => ({ success: false }) });

function show() {
  render(<MemoryRouter initialEntries={['/verify/cred-1']}><Routes>
    <Route path="/verify/:credentialId" element={<CertificateVerification />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('UX-014 verify page states', () => {
  it('says not found only when the API answers 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(status(404));
    show();
    expect(await screen.findByRole('heading', { name: 'Certificate not found' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
  });

  it.each([
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a server error', () => Promise.resolve(status(503))],
  ])('says it could not check after %s, and retries', async (_label, failure) => {
    const fetchMock = vi.fn().mockImplementationOnce(failure).mockResolvedValueOnce(ok);
    globalThis.fetch = fetchMock;
    show();
    expect(await screen.findByRole('heading', { name: "We couldn't check this certificate right now" })).toBeInTheDocument();
    expect(screen.queryByText(/does not exist/i)).toBeNull();
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Verified Certificate' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a 200 without a certificate as not checkable, not as verified', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) });
    show();
    expect(await screen.findByRole('heading', { name: "We couldn't check this certificate right now" })).toBeInTheDocument();
  });
});
