import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const getMinterBalance = vi.fn();
vi.mock('../../services/adminCertificateService', () => ({ adminCertificateService: { getMinterBalance: (...a: unknown[]) => getMinterBalance(...a) } }));

import { MinterBalanceCard } from '../../components/MinterBalanceCard';

describe('MinterBalanceCard (F24)', () => {
  it('shows available XLM and a low-balance warning', async () => {
    getMinterBalance.mockResolvedValue({ configured: true, funded: true, contractId: 'C', network: 'public', publicKey: 'G', balanceXlm: '2.5000000', availableXlm: '1.5000000', estimatedMintsLeft: 12, low: true, checkedAt: '' });
    render(<MinterBalanceCard />);
    expect(await screen.findByText(/1\.50 XLM available/)).toBeInTheDocument();
    expect(screen.getByText(/mainnet/)).toBeInTheDocument();
    expect(screen.getByText(/Low balance/)).toBeInTheDocument();
  });

  it('says when the minter account is not funded', async () => {
    getMinterBalance.mockResolvedValue({ configured: true, funded: false, contractId: 'C', network: 'public', publicKey: 'GABCDEFGHIJKLMNOP', balanceXlm: '0', availableXlm: '0', estimatedMintsLeft: 0, low: true, checkedAt: '' });
    render(<MinterBalanceCard />);
    expect(await screen.findByText(/not funded yet/)).toBeInTheDocument();
  });

  it('renders nothing for someone who cannot mint', async () => {
    getMinterBalance.mockResolvedValue(null);
    const { container } = render(<MinterBalanceCard />);
    await vi.waitFor(() => expect(container.querySelector('[data-testid="minter-balance"]')).toBeNull());
  });
});
