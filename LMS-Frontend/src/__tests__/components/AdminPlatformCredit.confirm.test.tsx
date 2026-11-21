/**
 * UX-001 AC1 AC2 AC7 — platform credit Approve, Cancel and reservation Release ask first.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPlatformCredit from '../../pages/AdminPlatformCredit';

const m = vi.hoisted(() => ({ summary: vi.fn(), beneficiaries: vi.fn(), createBackingIntent: vi.fn(), verifyBackingDeposit: vi.fn(), requestCredit: vi.fn(), approve: vi.fn(), cancel: vi.fn(), releaseReservation: vi.fn(), reconcile: vi.fn() }));
vi.mock('../../services/platformCreditService', async (orig) => ({ ...(await orig<typeof import('../../services/platformCreditService')>()), platformCreditService: m }));

const summary = {
  pools: [{ network: 'public', currency: 'XLM', depositedStroops: 20000000, allocatedStroops: 5000000, reservedStroops: 1000000, availableStroops: 14000000 }],
  requests: [{ id: 'q1', requester_user_id: 'u1', beneficiary_user_id: 'u2', network: 'public', amount_stroops: 1000000, reason: 'fund rewards', status: 'pending', effective_status: 'pending', expires_at: '2026-11-20', created_at: '2026-11-16T10:00:00Z' }],
  backingIntents: [],
  reservations: [{ intent_id: 'r1', owner_user_id: 'u2', amount_stroops: 2500000, effective_status: 'held' }],
  audit: [],
};
const people = [{ id: 'u1', name: 'Requester Rae', email: 'r@x.test' }, { id: 'u2', name: 'Beneficiary Bo', email: 'b@x.test' }];

beforeEach(() => {
  vi.resetAllMocks();
  m.summary.mockResolvedValue(summary);
  m.beneficiaries.mockResolvedValue(people);
});

describe('platform credit asks before moving value (UX-001)', () => {
  it('approve asks first, naming amount, beneficiary and requester; nothing sent until confirmed', async () => {
    m.approve.mockResolvedValue({});
    render(<AdminPlatformCredit />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Approve 0.1 XLM for Beneficiary Bo.');
    expect(dialog).toHaveTextContent('Requester Rae');
    expect(m.approve).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve 0.1 XLM' }));
    await waitFor(() => expect(m.approve).toHaveBeenCalledTimes(1));
    expect(m.approve).toHaveBeenCalledWith('q1', expect.stringContaining('0.1 XLM'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByRole('status')).toHaveTextContent('Credit approved.');
  });

  it('cancel and Escape send nothing and return focus to Approve', async () => {
    render(<AdminPlatformCredit />);
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await userEvent.click(approve);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(approve).toHaveFocus();
    await userEvent.click(approve);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(approve).toHaveFocus();
    expect(m.approve).not.toHaveBeenCalled();
  });

  it('cancelling a request asks first', async () => {
    m.cancel.mockResolvedValue({});
    render(<AdminPlatformCredit />);
    const row = (await screen.findByTestId('request-q1')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Cancel this request.');
    expect(m.cancel).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(m.cancel).toHaveBeenCalledWith('q1', expect.any(String)));
  });

  it('releasing a reservation asks first and names the owner', async () => {
    m.releaseReservation.mockResolvedValue({});
    render(<AdminPlatformCredit />);
    await userEvent.click(await screen.findByRole('button', { name: 'Release' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Release 0.25 XLM held for Beneficiary Bo.');
    expect(m.releaseReservation).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Release 0.25 XLM' }));
    await waitFor(() => expect(m.releaseReservation).toHaveBeenCalledWith('r1'));
  });

  it('a failed approve keeps the dialog open with the error; a double click sends one request', async () => {
    let reject!: (e: unknown) => void;
    m.approve.mockReturnValue(new Promise((_, r) => { reject = r; }));
    render(<AdminPlatformCredit />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Approve 0.1 XLM' });
    await userEvent.dblClick(confirm);
    expect(m.approve).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Working…/ })).toBeDisabled();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    reject(new Error('You cannot approve your own request.'));
    const alert = await within(screen.getByRole('alertdialog')).findByRole('alert');
    expect(alert).toHaveTextContent('You cannot approve your own request.');
  });
});
