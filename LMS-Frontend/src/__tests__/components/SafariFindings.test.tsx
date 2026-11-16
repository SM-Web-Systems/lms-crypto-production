import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const nft = vi.hoisted(() => ({ getUserNfts: vi.fn() }));
vi.mock('../../services/walletService', () => ({ getUserNfts: nft.getUserNfts }));
vi.mock('../../components/NftCard', () => ({ default: ({ token }: { token: { name: string } }) => <div data-testid="nft-card">{token.name}</div> }));
vi.mock('../../components/InlineQuizTaker', () => ({ default: () => <div /> }));
vi.mock('../../components/InlineAssignmentForm', () => ({ default: () => <div /> }));
vi.mock('../../components/PdfViewer', () => ({ PdfViewer: () => <div />, PdfViewerWithAuth: () => <div /> }));

import NftBadgesSection from '../../components/dashboard/NftBadgesSection';
import { EmbeddedMaterialViewer } from '../../components/EmbeddedMaterialViewer';
import type { CourseItemAudio, CourseSection } from '../../types/course';

beforeEach(() => nft.getUserNfts.mockReset());

describe('NFT badges on the dashboard', () => {
  it('shows the badges the server returns', async () => {
    nft.getUserNfts.mockResolvedValue({ unavailable: false, nfts: { indexed: { tokens: [{ token: { id: 1, name: 'Course badge' } }] } } });
    render(<NftBadgesSection walletAddress="GADDR" />);
    expect(await screen.findByText('Course badge')).toBeTruthy();
    expect(nft.getUserNfts).toHaveBeenCalledWith();
  });

  it('says plainly when the wallet could not be reached, instead of "No NFT badges yet"', async () => {
    nft.getUserNfts.mockResolvedValue({ unavailable: true, nfts: null });
    render(<NftBadgesSection walletAddress="GADDR" />);
    expect(await screen.findByText(/could not be loaded right now/)).toBeTruthy();
    expect(screen.queryByText('No NFT badges yet')).toBeNull();
  });

  it('treats a failed request the same way, and "no badges" stays for a learner who has none', async () => {
    nft.getUserNfts.mockRejectedValue(new Error('network'));
    const { unmount } = render(<NftBadgesSection walletAddress="GADDR" />);
    expect(await screen.findByText(/could not be loaded right now/)).toBeTruthy();
    unmount();
    nft.getUserNfts.mockResolvedValue({ unavailable: false, nfts: { indexed: { tokens: [] } } });
    render(<NftBadgesSection walletAddress="GADDR" />);
    await waitFor(() => expect(screen.getByText('No NFT badges yet')).toBeTruthy());
  });
});

describe('audio items that only have a direct audio file', () => {
  const section: CourseSection = { id: 's1', title: 'Section 1', items: [] };

  it('plays the file instead of saying no audio is available', () => {
    const item: CourseItemAudio = { id: 'a1', type: 'audio', title: 'Short sample audio', url: 'https://example.com/media/roar.mp3' };
    const { container } = render(<EmbeddedMaterialViewer section={section} item={item} onClose={vi.fn()} />);
    const audio = container.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute('src')).toBe('https://example.com/media/roar.mp3');
    expect(screen.queryByText(/No audio content is available/)).toBeNull();
  });

  it('keeps the download button as the primary view when one is set', () => {
    const item: CourseItemAudio = { id: 'a2', type: 'audio', title: 'Audio', url: 'https://example.com/media/roar.mp3', downloadUrl: 'https://example.com/dl/roar.mp3' };
    const { container } = render(<EmbeddedMaterialViewer section={section} item={item} onClose={vi.fn()} />);
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.getByText(/Download audio/)).toBeTruthy();
  });

  it('still says no audio is available when the address is not an audio file', () => {
    const item: CourseItemAudio = { id: 'a3', type: 'audio', title: 'Audio', url: 'https://example.com/page' };
    const { container } = render(<EmbeddedMaterialViewer section={section} item={item} onClose={vi.fn()} />);
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.getByText(/No audio content is available/)).toBeTruthy();
  });
});
