import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const wallet = vi.hoisted(() => ({ getUserNfts: vi.fn() }));
vi.mock('../../services/walletService', () => wallet);

import NftBadgesSection from '../../components/dashboard/NftBadgesSection';

beforeEach(() => wallet.getUserNfts.mockReset());

describe('certificates in the wallet', () => {
  it('says it is loading, not that there are no certificates, until the wallet answers', async () => {
    let answer: (v: unknown) => void = () => {};
    wallet.getUserNfts.mockReturnValue(new Promise((r) => { answer = r; }));
    render(<NftBadgesSection walletAddress="GABC" />);
    expect(screen.getByText(/Loading certificates/)).toBeTruthy();
    expect(screen.queryByText(/No certificates in your wallet yet/)).toBeNull();
    answer({ nfts: { indexed: { tokens: [] } }, unavailable: false });
    expect(await screen.findByText(/No certificates in your wallet yet/)).toBeTruthy();
  });

  it('says the certificates could not be loaded when the wallet fails', async () => {
    wallet.getUserNfts.mockResolvedValue({ nfts: null, unavailable: true });
    render(<NftBadgesSection walletAddress="GABC" />);
    expect(await screen.findByText(/could not be loaded right now/)).toBeTruthy();
    expect(screen.queryByText(/Loading certificates/)).toBeNull();
  });

  it('does not ask the wallet when there is no wallet address', () => {
    render(<NftBadgesSection walletAddress={null} />);
    expect(wallet.getUserNfts).not.toHaveBeenCalled();
    expect(screen.queryByText(/Loading certificates/)).toBeNull();
  });
});
