/** Minter wallet card on the admin certificates page: balance, low-balance warning, hidden without access. */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/adminCertificateService', () => ({
  adminCertificateService: { getMinterStatus: vi.fn() },
}));

import { adminCertificateService } from '../../services/adminCertificateService';
import { MinterStatusCard } from '../../components/MinterStatusCard';

const getMinterStatus = adminCertificateService.getMinterStatus as unknown as ReturnType<typeof vi.fn>;
const base = {
  configured: true, network: 'public' as const, minterAddress: 'GBVRLTX5AKI6TS5TAENKN3CMRM2EWORUD6CKDVV4K5E54DGJD3W7LP4I',
  contractId: 'C', balanceXlm: '7.4348539', low: false, error: null,
};

describe('MinterStatusCard', () => {
  beforeEach(() => getMinterStatus.mockReset());

  it('shows the balance and a shortened address', async () => {
    getMinterStatus.mockResolvedValue(base);
    render(<MinterStatusCard />);
    expect(await screen.findByText('7.4348539 XLM')).toBeInTheDocument();
    expect(screen.getByText('GBVRLT…LP4I')).toBeInTheDocument();
    expect(screen.queryByText(/Low balance/)).not.toBeInTheDocument();
  });

  it('warns when the balance is low', async () => {
    getMinterStatus.mockResolvedValue({ ...base, balanceXlm: '1.2', low: true });
    render(<MinterStatusCard />);
    expect(await screen.findByText(/Low balance/)).toBeInTheDocument();
  });

  it('renders nothing for someone who cannot mint', async () => {
    getMinterStatus.mockRejectedValueOnce(new Error('Request failed with status code 403'));
    const { container } = render(<MinterStatusCard />);
    await waitFor(() => expect(getMinterStatus.mock.calls.length).toBe(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-testid="minter-status"]')).toBeNull();
  });
});
