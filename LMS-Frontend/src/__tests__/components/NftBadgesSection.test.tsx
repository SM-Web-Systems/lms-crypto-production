import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NftBadgesSection from '../../components/dashboard/NftBadgesSection';
import { getUserNfts } from '../../services/walletService';

vi.mock('../../services/walletService', () => ({ getUserNfts: vi.fn() }));

describe('NFT badge loading', () => {
  it('shows an error rather than an empty result when the wallet request fails', async () => {
    vi.mocked(getUserNfts).mockRejectedValueOnce(new Error('unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<NftBadgesSection walletAddress="test-wallet" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load NFT badges');
    expect(screen.queryByText('No NFT badges yet')).not.toBeInTheDocument();
    log.mockRestore();
  });

  it('shows the empty state after a successful empty response', async () => {
    vi.mocked(getUserNfts).mockResolvedValueOnce({ indexed: { tokens: [] } } as Awaited<ReturnType<typeof getUserNfts>>);
    render(<NftBadgesSection walletAddress="test-wallet" />);
    expect(await screen.findByText('No NFT badges yet')).toBeInTheDocument();
  });
});
