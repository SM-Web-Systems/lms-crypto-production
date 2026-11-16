import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPlatformCredit, { stellarPayLink } from '../../pages/AdminPlatformCredit';
import { xlmToStroops, stroopsToXlm } from '../../services/platformCreditService';

const m = vi.hoisted(() => ({ summary: vi.fn(), beneficiaries: vi.fn(), createBackingIntent: vi.fn(), verifyBackingDeposit: vi.fn(), requestCredit: vi.fn(), approve: vi.fn(), cancel: vi.fn(), releaseReservation: vi.fn(), reconcile: vi.fn() }));
vi.mock('../../services/platformCreditService', async (orig) => ({ ...(await orig<typeof import('../../services/platformCreditService')>()), platformCreditService: m }));
beforeEach(() => vi.resetAllMocks());

const summary = {
  pools: [{ network: 'public', currency: 'XLM', depositedStroops: 20000000, allocatedStroops: 5000000, reservedStroops: 1000000, availableStroops: 14000000 }],
  requests: [{ id: 'q1', requester_user_id: 'u1', beneficiary_user_id: 'u2', network: 'public', amount_stroops: 1000000, reason: 'fund rewards', status: 'pending', effective_status: 'pending', expires_at: '2026-11-20', created_at: '2026-11-16T10:00:00Z' }],
  backingIntents: [{ id: 'i1', network: 'public', destination: 'GPOOL', memo_hash: 'ab', amount_stroops: 20000000, reason: 'backing', expires_at: '2026-11-20', created_at: '2026-11-16T09:00:00Z', effective_status: 'awaiting_deposit' }],
  reservations: [], audit: [],
};

describe('xlm helpers', () => {
  it('converts exactly and rejects bad input', () => {
    expect(xlmToStroops('0.1')).toBe('1000000');
    expect(xlmToStroops('1.5')).toBe('15000000');
    expect(xlmToStroops('0')).toBeNull();
    expect(xlmToStroops('0.12345678')).toBeNull();
    expect(xlmToStroops('abc')).toBeNull();
    expect(stroopsToXlm(14000000)).toBe('1.4');
  });
});

describe('admin: platform credit', () => {
  it('shows the pool and approves a pending request', async () => {
    m.summary.mockResolvedValue(summary); m.beneficiaries.mockResolvedValue([{ id: 'u2', name: 'Tester', email: 't@x.test' }]); m.approve.mockResolvedValue({});
    render(<AdminPlatformCredit />);
    expect(await screen.findByText('Public (real XLM)')).toBeInTheDocument();
    expect(screen.getByText('1.4 XLM')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(m.approve).toHaveBeenCalledWith('q1', expect.stringContaining('0.1 XLM')));
    expect(await screen.findByRole('status')).toHaveTextContent('Credit approved.');
  });

  it('verifies a deposit with the operation ID and requests credit with whole stroops', async () => {
    m.summary.mockResolvedValue(summary); m.beneficiaries.mockResolvedValue([{ id: 'u2', name: 'Tester', email: 't@x.test' }]);
    m.verifyBackingDeposit.mockResolvedValue({}); m.requestCredit.mockResolvedValue({});
    render(<AdminPlatformCredit />);
    await userEvent.type(await screen.findByLabelText('Operation ID'), ' 123456 ');
    await userEvent.click(screen.getByRole('button', { name: 'Verify deposit' }));
    await waitFor(() => expect(m.verifyBackingDeposit).toHaveBeenCalledWith('i1', '123456'));
    await userEvent.selectOptions(screen.getByLabelText('Person'), 'u2');
    await userEvent.type(screen.getAllByLabelText('Amount (XLM)')[1], '0.1');
    await userEvent.type(screen.getAllByLabelText('Reason')[1], 'fund rewards');
    await userEvent.click(screen.getByRole('button', { name: 'Request credit' }));
    await waitFor(() => expect(m.requestCredit).toHaveBeenCalledWith('u2', '1000000', 'fund rewards'));
  });

  it('shows the transfer instructions after creating a deposit request, and shows load errors', async () => {
    m.summary.mockResolvedValue(summary); m.beneficiaries.mockResolvedValue([]);
    m.createBackingIntent.mockResolvedValue({ ...summary.backingIntents[0], id: 'i2', amount_stroops: 10000000, memo_hash: 'ca'.repeat(32), text_memo: 'LMS-ABCDEFGHJKLM' });
    render(<AdminPlatformCredit />);
    await userEvent.type(await screen.findByLabelText('Amount (XLM)', { selector: 'input[placeholder="1.0"]' }), '1');
    await userEvent.type(screen.getByPlaceholderText('Back platform credit for reward funding'), 'backing');
    await userEvent.click(screen.getByRole('button', { name: 'Create deposit request' }));
    const box = within((await screen.findAllByTestId('deposit-instructions'))[0]);
    expect(box.getByLabelText('Memo (text)')).toHaveValue('LMS-ABCDEFGHJKLM');
    expect(box.getByLabelText('Memo (hash, hex)')).toHaveValue('ca'.repeat(32));
    expect(box.getByLabelText('Amount (XLM)')).toHaveValue('1');
    expect(box.getByLabelText('Send to')).toHaveValue('GPOOL');
    expect(m.createBackingIntent).toHaveBeenCalledWith('10000000', 'backing');
    m.summary.mockRejectedValue(new Error('boom'));
    await userEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('stellarPayLink', () => {
  it('builds a SEP-7 pay link with the text memo, or the hash memo as base64 when there is no code', () => {
    const base = { destination: 'GPOOL', amount_stroops: 5000000, memo_hash: 'ab'.repeat(32), network: 'public' };
    const text = new URL(stellarPayLink({ ...base, text_memo: 'LMS-ABCDEFGHJKLM' }).replace('web+stellar:', 'https://x/'));
    expect(text.searchParams.get('amount')).toBe('0.5');
    expect(text.searchParams.get('memo')).toBe('LMS-ABCDEFGHJKLM');
    expect(text.searchParams.get('memo_type')).toBe('MEMO_TEXT');
    const hash = new URL(stellarPayLink({ ...base, text_memo: null }).replace('web+stellar:', 'https://x/'));
    expect(hash.searchParams.get('memo_type')).toBe('MEMO_HASH');
    expect(atob(hash.searchParams.get('memo')!).length).toBe(32);
  });
});

describe('admin: deposit flow messages', () => {
  it('says it is waiting for the payment and shows clear errors for a wrong operation ID', async () => {
    m.summary.mockResolvedValue(summary); m.beneficiaries.mockResolvedValue([]); m.verifyBackingDeposit.mockRejectedValue({ response: { data: { error: { message: 'That payment does not match this request.' } } } });
    render(<AdminPlatformCredit />);
    expect(await screen.findByTestId('waiting-note')).toHaveTextContent('Waiting for the payment');
    const box = await screen.findByLabelText('Operation ID');
    await userEvent.type(box, 'a'.repeat(64));
    await userEvent.click(screen.getByRole('button', { name: 'Verify deposit' }));
    expect(await screen.findByTestId('verify-error-i1')).toHaveTextContent('transaction hash');
    expect(m.verifyBackingDeposit).not.toHaveBeenCalled();
    await userEvent.clear(box); await userEvent.type(box, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Verify deposit' }));
    expect(await screen.findByTestId('verify-error-i1')).toHaveTextContent('digits only');
    await userEvent.clear(box); await userEvent.type(box, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify deposit' }));
    await waitFor(() => expect(m.verifyBackingDeposit).toHaveBeenCalledWith('i1', '123456'));
    expect(await screen.findByTestId('verify-error-i1')).toHaveTextContent(/./);
  });
  it('shows the server message next to the form when a second open request is refused', async () => {
    m.summary.mockResolvedValue({ ...summary, backingIntents: [] }); m.beneficiaries.mockResolvedValue([]);
    m.createBackingIntent.mockRejectedValue({ response: { data: { error: { message: 'You already have an open deposit request.' } } } });
    render(<AdminPlatformCredit />);
    await userEvent.type(await screen.findByPlaceholderText('1.0'), '0.5');
    await userEvent.type(screen.getByPlaceholderText('Back platform credit for reward funding'), 'again');
    await userEvent.click(screen.getByRole('button', { name: 'Create deposit request' }));
    expect(await screen.findByTestId('create-error')).toBeInTheDocument();
  });
});
