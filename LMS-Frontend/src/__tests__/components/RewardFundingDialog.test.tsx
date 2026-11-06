import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RewardFundingDialog } from '../../components/RewardFundingDialog';

const mocks = vi.hoisted(() => ({options: vi.fn(), prepare: vi.fn(), fund: vi.fn()}));
vi.mock('../../services/rewardService', () => ({rewardService: {
  getFundingOptions: mocks.options, createFundingIntent: mocks.prepare, fundReward: mocks.fund,
}}));
beforeEach(() => vi.resetAllMocks());
const available = [{sourceType: 'admin_grant', available: true, reason: null}];

describe('reward funding availability and confirmation', () => {
  it('explains unavailable sources without offering a funding submission', async () => {
    mocks.options.mockResolvedValue([
      {sourceType: 'stellar', available: false, reason: 'Stellar funding is not available yet.'},
      {sourceType: 'paystack', available: false, reason: 'Card funding awaits a settlement provider.'},
    ]);
    render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={vi.fn()} onFunded={vi.fn()} />);
    expect(await screen.findByText('Card funding awaits a settlement provider.')).toBeVisible();
    expect(screen.queryByRole('button', {name: /grant/i})).not.toBeInTheDocument();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('shows the exact reserved amount before confirmation and preserves the same intent/key after an ambiguous failure', async () => {
    const user = userEvent.setup(), done = vi.fn();
    mocks.options.mockResolvedValue(available);
    mocks.prepare.mockResolvedValue({id: 'immutable-intent', amount_stroops: 3703701});
    mocks.fund.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({status: 'funded'});
    render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={vi.fn()} onFunded={done} />);
    await user.click(await screen.findByRole('button', {name: 'Prepare grant'}));
    expect(await screen.findByText(/0.3703701 XLM/)).toBeVisible();
    expect(mocks.fund).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: 'Authorize grant'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Retry to check the same request');
    await user.click(screen.getByRole('button', {name: 'Authorize grant'}));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(mocks.fund.mock.calls[0]).toEqual(mocks.fund.mock.calls[1]);
    expect(mocks.fund.mock.calls[0]).toEqual(['sponsor', 'reward', 'admin_grant', undefined, mocks.prepare.mock.calls[0][3], 'immutable-intent']);
  });

  it('allows retry after availability failure, traps keyboard focus and restores the opening control', async () => {
    const user = userEvent.setup(), close = vi.fn();
    mocks.options.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(available);
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const view = render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={close} onFunded={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load funding methods');
    await user.click(screen.getByRole('button', {name: 'Retry'}));
    const prepare = await screen.findByRole('button', {name: 'Prepare grant'});
    screen.getByRole('button', {name: 'Close'}).focus();
    await user.tab(); expect(prepare).toHaveFocus();
    await user.tab({shift: true}); expect(screen.getByRole('button', {name: 'Close'})).toHaveFocus();
    await user.keyboard('{Escape}'); expect(close).toHaveBeenCalledTimes(1);
    view.unmount(); expect(opener).toHaveFocus(); opener.remove();
  });

  it('discards the result of a submission after its target dialog is unmounted', async () => {
    const user = userEvent.setup(), done = vi.fn();
    mocks.options.mockResolvedValue(available);
    let resolve!: (value: unknown) => void;
    mocks.prepare.mockImplementation(() => new Promise(result => {resolve = result;}));
    const view = render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={vi.fn()} onFunded={done} />);
    await user.click(await screen.findByRole('button', {name: 'Prepare grant'}));
    view.unmount(); resolve({id: 'old', amount_stroops: 1});
    await Promise.resolve(); expect(done).not.toHaveBeenCalled(); expect(mocks.fund).not.toHaveBeenCalled();
  });

  it('returns focus to the actual opener when pointer activation left the body focused', () => {
    mocks.options.mockResolvedValue([]);
    const opener = document.createElement('button'); document.body.append(opener);
    expect(document.activeElement).toBe(document.body);
    const view = render(<RewardFundingDialog role="sponsor" rewardId="reward" returnFocus={opener} onClose={vi.fn()} onFunded={vi.fn()} />);
    view.unmount(); expect(opener).toHaveFocus(); opener.remove();
  });
});
