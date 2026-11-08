import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '../types/api';
const mocks = vi.hoisted(() => ({post: vi.fn(), status: vi.fn()}));
vi.mock('../services/api', () => ({default: {post: mocks.post}}));
vi.mock('../services/walletService', () => ({getWalletStatus: mocks.status}));
vi.mock('../context/useAuth', () => ({useAuth: () => ({login: vi.fn()})}));
import AmmaWalletConnection, {walletNavigation} from '../components/AmmaWalletConnection';
import StudentWalletStatusCard from '../components/StudentWalletStatusCard';
import Login from '../pages/Login';
const user: User = {id: 'owner', name: 'Owner', email: 'owner@example.invalid',
  walletAddress: null, walletLinkingStatus: 'none', authProvider: 'local'};
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });
describe('Wallet connection and recovery journeys', () => {
  it('collects explicit password consent before conversion and navigates only to the server-issued URL', async () => {
    const go = vi.spyOn(walletNavigation, 'go').mockImplementation(() => {});
    mocks.post.mockResolvedValue({data: {success: true, data: {url: 'https://wallet.example.invalid/sso/login?state=signed'}}});
    render(<AmmaWalletConnection user={user}/>);
    expect(screen.getByText(/ends its existing LMS sessions/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Current LMS password'), 'password-proof');
    await userEvent.click(screen.getByRole('button', {name: 'Connect AmmaWallet'}));
    await waitFor(() => expect(go).toHaveBeenCalledWith('https://wallet.example.invalid/sso/login?state=signed'));
    expect(mocks.post).toHaveBeenCalledWith('/auth/amma-link', {password: 'password-proof'});
    expect(screen.getByLabelText('Current LMS password')).toHaveValue('');
  });
  it('shows a local password error without starting Wallet navigation', async () => {
    const go = vi.spyOn(walletNavigation, 'go').mockImplementation(() => {});
    mocks.post.mockRejectedValue(new Error('Confirm your current LMS password.'));
    render(<AmmaWalletConnection user={user}/>);
    await userEvent.type(screen.getByLabelText('Current LMS password'), 'wrong');
    await userEvent.click(screen.getByRole('button', {name: 'Connect AmmaWallet'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirm your current LMS password.');
    expect(go).not.toHaveBeenCalled();
  });
  it('refreshes a bound Wallet identity without another local password and explains recipient selection', async () => {
    const go = vi.spyOn(walletNavigation, 'go').mockImplementation(() => {});
    mocks.post.mockResolvedValue({data: {success: true, data: {url: 'https://wallet.example.invalid/sso/login?state=refresh'}}});
    render(<AmmaWalletConnection user={{...user, authProvider: 'ammawallet', walletAddress: 'FULL_RECIPIENT_ADDRESS'}}/>);
    expect(screen.queryByLabelText('Current LMS password')).not.toBeInTheDocument();
    expect(screen.getByText('FULL_RECIPIENT_ADDRESS')).toBeInTheDocument();
    expect(screen.getByText(/newest active mainnet wallet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Refresh from AmmaWallet'}));
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(mocks.post).toHaveBeenCalledWith('/auth/amma-link', {});
  });
  it.each(['email_required', 'email_unverified'])('offers Wallet settings for %s', code => {
    render(<MemoryRouter initialEntries={['/login?sso_error='+code]}><Login/></MemoryRouter>);
    expect(screen.getByRole('link', {name: 'Open AmmaWallet settings'})).toHaveAttribute('href', 'https://ammawallet.com/settings');
  });
  it('keeps connection errors visible in the authenticated profile', () => {
    render(<AmmaWalletConnection user={user} errorCode="link_email_mismatch"/>);
    expect(screen.getByRole('alert')).toHaveTextContent('same verified email');
    expect(screen.getByRole('button', {name: 'Connect AmmaWallet'})).toBeInTheDocument();
  });
  it('opens the internal sign-in form with safe connection instructions', () => {
    render(<MemoryRouter initialEntries={['/login?sso_error=link_required']}><Login/></MemoryRouter>);
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText(/choose Connect AmmaWallet/)).toBeInTheDocument();
  });
  it('renders cleared server linkage rather than stale user context', async () => {
    mocks.status.mockResolvedValue({walletAddress: null, walletLinkingStatus: 'none', xlmBalance: null, network: null});
    render(<MemoryRouter><StudentWalletStatusCard user={{...user, walletAddress: 'OLD_ADDRESS', walletLinkingStatus: 'linked'}}/></MemoryRouter>);
    expect(await screen.findByText('Wallet not linked')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Manage wallet connection'})).toHaveAttribute('href', '/profile');
    expect(screen.queryByLabelText('Copy wallet address')).not.toBeInTheDocument();
  });
  it('uses the status response address for its matching balance', async () => {
    mocks.status.mockResolvedValue({walletAddress: 'NEW_ADDRESS', walletLinkingStatus: 'linked', xlmBalance: 2, network: 'mainnet'});
    render(<MemoryRouter><StudentWalletStatusCard user={{...user, walletAddress: 'OLD_ADDRESS', walletLinkingStatus: 'linked'}}/></MemoryRouter>);
    expect(await screen.findByText('2.00 XLM')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Copy wallet address'})).toHaveAttribute('title', 'NEW_ADDRESS');
  });
});
