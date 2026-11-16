import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
  getMyRewards: vi.fn(), getClaimableBalance: vi.fn(), startClaim: vi.fn(), verifyClaim: vi.fn(),
}));
vi.mock('../../services/rewardService', () => ({ rewardService: svc }));

import { StudentRewardsPanel } from '../../components/StudentRewardsPanel';
import RewardClaimReturn from '../../pages/RewardClaimReturn';
import { rememberClaim, walletClaimNavigation, walletClaimUrl, takeClaim } from '../../utils/rewardClaim';

beforeEach(() => {
  Object.values(svc).forEach(f => f.mockReset());
  sessionStorage.clear();
  svc.getMyRewards.mockResolvedValue([]);
});

describe('claiming rewards to the wallet', () => {
  it('starts a claim for the claimable balance and opens AmmaWallet with the challenge', async () => {
    svc.getClaimableBalance.mockResolvedValue('1000000');
    svc.startClaim.mockResolvedValue({ claimId: 'c-1', destination: 'GADDR', amountStroops: 1000000, expiresAt: 'x', message: 'SM Web Systems LMS reward claim\nclaim:c-1' });
    const go = vi.spyOn(walletClaimNavigation, 'go').mockImplementation(() => {});
    render(<StudentRewardsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: /Claim to my wallet/ }));
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(svc.startClaim).toHaveBeenCalledWith('1000000');
    const url = new URL(go.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://ammawallet.com/lms/claim');
    const params = new URLSearchParams(url.hash.slice(1));
    expect(params.get('return')).toBe(`${window.location.origin}/student/rewards/claim`);
    expect(takeClaim('c-1')).toBe('SM Web Systems LMS reward claim\nclaim:c-1');
  });

  it('tells the learner what is needed to restore their wallet on another device', async () => {
    svc.getClaimableBalance.mockResolvedValue('1000000');
    render(<StudentRewardsPanel />);
    const note = await screen.findByTestId('restore-wallet-note');
    expect(note.textContent).toMatch(/device where your wallet was set up, or your recovery phrase/);
  });

  it('shows no claim button when nothing is claimable', async () => {
    svc.getClaimableBalance.mockResolvedValue('0');
    render(<StudentRewardsPanel />);
    await waitFor(() => expect(svc.getMyRewards).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Claim to my wallet/ })).toBeNull();
  });

  it('sends the returned signature with the remembered challenge and confirms', async () => {
    rememberClaim('c-1', 'challenge text');
    window.history.replaceState(null, '', '/student/rewards/claim#claim=c-1&signature=abc%3D%3D');
    svc.verifyClaim.mockResolvedValue({ claimId: 'c-1', status: 'verified', payout: null });
    render(<MemoryRouter><RewardClaimReturn /></MemoryRouter>);
    expect(await screen.findByText(/reserved for payment/)).toBeTruthy();
    expect(svc.verifyClaim).toHaveBeenCalledWith('c-1', 'challenge text', 'abc==');
  });

  it('says the reward was sent when the payout completed', async () => {
    rememberClaim('c-1', 'challenge text');
    window.history.replaceState(null, '', '/student/rewards/claim#claim=c-1&signature=abc%3D%3D');
    svc.verifyClaim.mockResolvedValue({ claimId: 'c-1', status: 'verified', payout: { status: 'paid', txHash: 'ab', ledger: 5 } });
    render(<MemoryRouter><RewardClaimReturn /></MemoryRouter>);
    expect(await screen.findByText(/reward has been sent to it/)).toBeTruthy();
  });

  it('keeps rewards in the LMS when the learner declines in AmmaWallet', async () => {
    rememberClaim('c-1', 'challenge text');
    window.history.replaceState(null, '', '/student/rewards/claim#claim=c-1&declined=1');
    render(<MemoryRouter><RewardClaimReturn /></MemoryRouter>);
    expect(await screen.findByText(/declined the claim/)).toBeTruthy();
    expect(svc.verifyClaim).not.toHaveBeenCalled();
  });

  it('refuses a return for a different claim than the one started here', async () => {
    rememberClaim('c-1', 'challenge text');
    window.history.replaceState(null, '', '/student/rewards/claim#claim=c-2&signature=abc%3D%3D');
    render(<MemoryRouter><RewardClaimReturn /></MemoryRouter>);
    expect(await screen.findByText(/incomplete or expired/)).toBeTruthy();
    expect(svc.verifyClaim).not.toHaveBeenCalled();
  });

  it('encodes the challenge as base64url in the fragment', () => {
    const url = walletClaimUrl('a+b/c?', 'https://lms.example/x');
    const params = new URLSearchParams(new URL(url).hash.slice(1));
    expect(params.get('message')).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('AmmaWallet says why it could not approve', () => {
  it.each([
    ['#claim=c-1&error=expired', /claim expired/],
    ['#claim=c-1&error=unavailable', /cannot approve this claim right now/],
    ['#error=invalid', /could not read this claim/],
  ])('shows a specific message for %s and never verifies', async (fragment, message) => {
    rememberClaim('c-1', 'challenge text');
    window.history.replaceState(null, '', `/student/rewards/claim${fragment}`);
    render(<MemoryRouter><RewardClaimReturn /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(svc.verifyClaim).not.toHaveBeenCalled();
  });

  it('does not verify even if a signature is sent together with an error', async () => {
    rememberClaim('c-1', 'challenge text');
    window.history.replaceState(null, '', '/student/rewards/claim#claim=c-1&error=expired&signature=abc%3D%3D');
    render(<MemoryRouter><RewardClaimReturn /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/claim expired/);
    expect(svc.verifyClaim).not.toHaveBeenCalled();
  });

  it('treats an unknown error value like a bare return', async () => {
    rememberClaim('c-1', 'challenge text');
    window.history.replaceState(null, '', '/student/rewards/claim#claim=c-1&error=teapot');
    render(<MemoryRouter><RewardClaimReturn /></MemoryRouter>);
    expect(await screen.findByText(/incomplete or expired/)).toBeTruthy();
    expect(svc.verifyClaim).not.toHaveBeenCalled();
  });
});

describe('the rewards list on a narrow screen', () => {
  it('keeps table roles and reflows into stacked rows below the sm breakpoint', async () => {
    svc.getClaimableBalance.mockResolvedValue('0');
    svc.getMyRewards.mockResolvedValue([{ allocationId: 'a1', rewardType: 'custom', amountStroops: 1000000, status: 'released', releasedAt: '2026-11-16T07:00:00Z', createdAt: '2026-11-16T07:00:00Z' }]);
    render(<StudentRewardsPanel />);
    const table = await screen.findByRole('table');
    expect(table.className).toContain('block');
    expect(table.className).toContain('sm:table');
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Type', 'Amount', 'Status', 'Date']);
    const row = screen.getAllByRole('row')[1];
    expect(row.className).toMatch(/flex-wrap/);
    expect(row.className).toMatch(/sm:table-row/);
    expect(screen.getAllByRole('cell')).toHaveLength(4);
  });
});
