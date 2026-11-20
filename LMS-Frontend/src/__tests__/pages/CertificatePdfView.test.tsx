/**
 * Certificate PDF must open inside the LMS with a Back button.
 * On the iPhone home-screen app, a same-site target="_blank" PDF had no way back.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NFTBadge from '../../components/NFTBadge';
import CertificatePdfView from '../../pages/CertificatePdfView';

const badge = {
  credentialId: 'cred-abc',
  courseTitle: 'Stellar Vibe Coding',
  walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE',
  txHash: 'tx1',
  issuedAt: '2026-11-20T12:00:00Z',
};

function setPdfViewerEnabled(value: boolean | undefined) {
  Object.defineProperty(navigator, 'pdfViewerEnabled', { value, configurable: true });
}

afterEach(() => setPdfViewerEnabled(undefined));

describe('Certificate PDF in-app viewer', () => {
  it('PDF link on the badge stays in the app (no new tab)', () => {
    render(<MemoryRouter><NFTBadge {...badge} /></MemoryRouter>);
    const link = screen.getByRole('link', { name: /PDF/ });
    expect(link.getAttribute('href')).toBe('/certificate/cred-abc/pdf');
    expect(link.getAttribute('target')).toBeNull();
  });

  it('viewer shows the PDF and Back returns to the badges page', () => {
    render(
      <MemoryRouter initialEntries={['/badges', '/certificate/cred-abc/pdf']} initialIndex={1}>
        <Routes>
          <Route path="/badges" element={<p>My Badges page</p>} />
          <Route path="/certificate/:credentialId/pdf" element={<CertificatePdfView />} />
        </Routes>
      </MemoryRouter>,
    );
    const frame = screen.getByTitle('Certificate PDF');
    expect(frame.getAttribute('src')).toBe('/api/v1/credentials/cred-abc/pdf');
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText('My Badges page')).toBeTruthy();
  });

  it('Back goes to the verify page when the viewer was opened directly', () => {
    render(
      <MemoryRouter initialEntries={['/certificate/cred-abc/pdf']}>
        <Routes>
          <Route path="/verify/:credentialId" element={<p>Verify page</p>} />
          <Route path="/certificate/:credentialId/pdf" element={<CertificatePdfView />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText('Verify page')).toBeTruthy();
  });

  it('offers an Open PDF button where the browser cannot show PDFs inline', () => {
    setPdfViewerEnabled(false);
    render(
      <MemoryRouter initialEntries={['/certificate/cred-abc/pdf']}>
        <Routes>
          <Route path="/certificate/:credentialId/pdf" element={<CertificatePdfView />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByTitle('Certificate PDF')).toBeNull();
    expect(screen.getByRole('link', { name: /Open PDF/ }).getAttribute('href')).toBe('/api/v1/credentials/cred-abc/pdf');
    expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy();
  });
});
