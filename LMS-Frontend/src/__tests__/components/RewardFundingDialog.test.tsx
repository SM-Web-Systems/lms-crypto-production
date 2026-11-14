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

describe('rate limiting', () => {
  it('says the request was rate limited, not that the payment failed, and keeps the same request', async () => {
    const user = userEvent.setup(), done = vi.fn();
    mocks.options.mockResolvedValue(available);
    mocks.prepare.mockResolvedValue({id: 'immutable-intent', amount_stroops: 1000000});
    mocks.fund.mockRejectedValueOnce({response: {status: 429}}).mockResolvedValueOnce({status: 'funded'});
    render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={vi.fn()} onFunded={done} />);
    await user.click(await screen.findByRole('button', {name: 'Prepare grant'}));
    await user.click(await screen.findByRole('button', {name: 'Authorize grant'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests right now');
    expect(screen.getByRole('alert')).not.toHaveTextContent('not confirmed');
    await user.click(screen.getByRole('button', {name: 'Authorize grant'}));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(mocks.fund.mock.calls[0]).toEqual(mocks.fund.mock.calls[1]);
  });
});

describe('reward funding availability and confirmation', () => {
  it('explains unavailable sources without offering a funding submission', async () => {
    mocks.options.mockResolvedValue([
      {sourceType: 'stellar', available: false, reason: 'Stellar funding is not available yet.'},
      {sourceType: 'paystack', available: false, reason: 'Card payments are available for course purchases only.'},
    ]);
    render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={vi.fn()} onFunded={vi.fn()} />);
    expect(await screen.findByText('Card payments are available for course purchases only.')).toBeVisible();
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

  it('shows the exact public-network deposit instructions and verifies an operation with a stable retry', async () => {
    const user = userEvent.setup(), done = vi.fn();
    mocks.options.mockResolvedValue([{sourceType: 'stellar', available: true, reason: null}]);
    mocks.prepare.mockResolvedValue({id: 'stellar-intent', amount_stroops: 1234567, network: 'public',
      destination: 'GDJT327MIBUOVRXKDDSBOIT7J2ORZB2Y4FDIVAXM7UUVHFPVU4LW7JHE', memo_hash: 'a'.repeat(64), expires_at: new Date(Date.now() + 60000).toISOString()});
    mocks.fund.mockRejectedValueOnce(new Error('ambiguous network failure')).mockResolvedValueOnce({status: 'funded'});
    render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={vi.fn()} onFunded={done} />);
    await user.click(await screen.findByRole('button', {name: 'Prepare Stellar payment'}));
    expect(await screen.findByText('Public network — real XLM')).toBeVisible();
    expect(screen.getByText(/Send exactly 0.1234567 XLM/)).toBeVisible();
    expect(screen.getByText('a'.repeat(64))).toBeVisible();
    expect(mocks.fund).not.toHaveBeenCalled();
    const field = screen.getByLabelText('Stellar payment operation ID');
    await user.type(field, '123');
    await user.click(screen.getByRole('button', {name: 'Verify payment'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Payment was not confirmed');
    expect(field).toBeDisabled();
    await user.click(screen.getByRole('button', {name: 'Verify payment'}));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(mocks.fund.mock.calls[0]).toEqual(mocks.fund.mock.calls[1]);
    expect(mocks.fund.mock.calls[0]).toEqual(['sponsor', 'reward', 'stellar', '123', mocks.prepare.mock.calls[0][3], 'stellar-intent']);
  });

  it('permits correcting a conclusively rejected operation but never substitutes new intent instructions', async () => {
    const user = userEvent.setup();
    mocks.options.mockResolvedValue([{sourceType: 'stellar', available: true, reason: null}]);
    mocks.prepare.mockResolvedValue({id: 'stellar-intent', amount_stroops: 1, network: 'testnet',
      destination: 'GDJT327MIBUOVRXKDDSBOIT7J2ORZB2Y4FDIVAXM7UUVHFPVU4LW7JHE', memo_hash: 'a'.repeat(64), expires_at: new Date(Date.now() + 60000).toISOString()});
    mocks.fund.mockRejectedValue({response: {status: 402}});
    render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={vi.fn()} onFunded={vi.fn()} />);
    await user.click(await screen.findByRole('button', {name: 'Prepare Stellar payment'}));
    const field = await screen.findByLabelText('Stellar payment operation ID');
    await user.type(field, '123'); await user.click(screen.getByRole('button', {name: 'Verify payment'}));
    await waitFor(() => expect(field).not.toBeDisabled());
    await user.clear(field); await user.type(field, '456'); await user.click(screen.getByRole('button', {name: 'Verify payment'}));
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.fund.mock.calls.map(call => call[3])).toEqual(['123','456']);
    expect(mocks.fund.mock.calls[0][4]).toBe(mocks.fund.mock.calls[1][4]);
  });

  it('refuses malformed deposit instructions and does not offer verification', async () => {
    const user = userEvent.setup();
    mocks.options.mockResolvedValue([{sourceType: 'stellar', available: true, reason: null}]);
    mocks.prepare.mockResolvedValue({id: 'bad', amount_stroops: 1, network: 'unknown'});
    render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={vi.fn()} onFunded={vi.fn()} />);
    await user.click(await screen.findByRole('button', {name: 'Prepare Stellar payment'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not prepare Stellar payment instructions');
    expect(screen.queryByRole('button', {name: 'Verify payment'})).not.toBeInTheDocument();
    expect(mocks.fund).not.toHaveBeenCalled();
  });
  it('reserves an offered credit allocation and retains its reference after a funding rejection',async()=>{
    const user=userEvent.setup(),done=vi.fn();
    mocks.options.mockResolvedValue([{sourceType:'platform_credit',available:true,reason:null,creditGrants:[{id:'approved-credit',availableStroops:10000000}]}]);
    mocks.prepare.mockResolvedValue({id:'reserved-intent',reference:'approved-credit',amount_stroops:1234567,network:'public',expires_at:new Date(Date.now()+60000).toISOString()});
    mocks.fund.mockRejectedValueOnce({response:{status:402}}).mockResolvedValueOnce({status:'funded'});
    render(<RewardFundingDialog role="sponsor" rewardId="reward" onClose={vi.fn()} onFunded={done}/>);
    await user.click(await screen.findByRole('button',{name:'Reserve platform credit'}));
    expect(await screen.findByText(/Authorize 0.1234567 XLM from the reserved platform credit/)).toBeVisible();
    expect(screen.getByText('Public network — real XLM')).toBeVisible();
    expect(mocks.prepare.mock.calls[0][4]).toBe('approved-credit');
    await user.click(screen.getByRole('button',{name:'Authorize platform credit'}));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button',{name:'Authorize platform credit'}));
    await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
    expect(mocks.fund.mock.calls[0]).toEqual(mocks.fund.mock.calls[1]);
    expect(mocks.fund.mock.calls[0]).toEqual(['sponsor','reward','platform_credit','approved-credit',mocks.prepare.mock.calls[0][3],'reserved-intent']);
  });
});
