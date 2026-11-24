import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { User, Workspace } from '../types/api';

const mocks = vi.hoisted(() => ({ user: null as User | null, logout: vi.fn() }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: mocks.user, isAuthenticated: !!mocks.user, isLoading: false, logout: mocks.logout }) }));
vi.mock('../services/messageService', () => ({ messageService: { getUnreadCount: vi.fn().mockResolvedValue(0) } }));
vi.mock('../components/GlobalSearchBar', () => ({ default: () => null }));
vi.mock('../components/NotificationBell', () => ({ default: () => null }));
vi.mock('../services/api', () => ({ default: { get: vi.fn(() => new Promise(() => {})), post: vi.fn() }, setTokenGetter: vi.fn(), onUnauthorized: () => () => {} }));

import { canAccessPath } from '../utils/authorization';
import Layout from '../components/Layout';
import { AppRoutes } from '../App';

function user(workspace: Workspace, permissions: string[] = []): User {
  return { id: 'u', name: 'Pat Partner', email: 'p@example.invalid', role: 'student', walletAddress: null, walletLinkingStatus: 'none',
    workspaces: [workspace], defaultWorkspace: workspace, permissions } as User;
}
const nav = () => screen.getByRole('navigation', { name: 'Main navigation' });
function renderLayout(u: User, path: string) {
  mocks.user = u;
  return render(<MemoryRouter initialEntries={[path]}><Layout><p>Content</p></Layout></MemoryRouter>);
}

beforeEach(() => { vi.clearAllMocks(); mocks.user = null; });

describe('UX-017 capability rules', () => {
  it('main is not a scroll box on wide screens, so sticky side panels stay on screen', () => {
    // overflow:auto on <main> made it the sticky container while the window scrolled, so the
    // Manage Roles panel scrolled away. Checked in Chromium: with these classes it stays put.
    renderLayout(user('admin', []), '/admin');
    const classes = screen.getByRole('main').className.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['lg:overflow-visible', 'lg:overflow-x-clip']));
  });

  it('/admin/students needs user.manage; lecturer-level user.view_all is not enough', () => {
    expect(canAccessPath(user('admin', ['user.view_all']), '/admin/students')).toBe(false);
    expect(canAccessPath(user('admin', ['user.manage']), '/admin/students')).toBe(true);
  });

  it.each(['/admin/rewards', '/admin/platform-credit'])('%s needs reward.manage', path => {
    expect(canAccessPath(user('admin', []), path)).toBe(false);
    expect(canAccessPath(user('admin', ['reward.manage']), path)).toBe(true);
  });

  it('hides Rewards to authorize and Platform credit from an admin without reward.manage', () => {
    renderLayout(user('admin', ['user.view_all']), '/admin');
    expect(screen.queryByText('Rewards to authorize')).toBeNull();
    expect(screen.queryByText('Platform credit')).toBeNull();
  });

  it('/lecturer/submissions needs course.grade, not course.manage', () => {
    expect(canAccessPath(user('lecturer', ['course.grade']), '/lecturer/submissions')).toBe(true);
    expect(canAccessPath(user('lecturer', ['course.manage']), '/lecturer/submissions')).toBe(false);
  });
});

describe('UX-020 partner navigation', () => {
  it.each(['teaching-assistant', 'sponsor', 'employer', 'parent', 'teacher'] as Workspace[])('%s nav has Messages and Profile', ws => {
    renderLayout(user(ws), `/${ws === 'teaching-assistant' ? 'ta' : ws}`);
    const links = Array.from(nav().querySelectorAll('button')).map(b => b.textContent);
    expect(links).toContain('Messages');
    expect(links).toContain('Profile');
  });

  it('TA nav no longer lists Courses and Grade, which were the same page', () => {
    renderLayout(user('teaching-assistant', ['course.grade_pending']), '/ta');
    const items = Array.from(nav().querySelectorAll('button')).map(b => b.textContent);
    expect(items).toEqual(['Dashboard', 'Messages', 'Profile']);
  });

  it('header user menu reaches Profile, Notification settings and Sign out', async () => {
    renderLayout(user('sponsor'), '/sponsor');
    const trigger = screen.getByRole('button', { name: /account menu/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: 'Notification settings' })).toHaveAttribute('href', '/settings/notifications');
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.logout).toHaveBeenCalled();
  });
});

describe('UX-020 no silent redirects', () => {
  it.each([
    ['employer', '/employer/billing'], ['parent', '/parent/wallets'], ['parent', '/parent/billing'],
    ['teacher', '/teacher/analytics'], ['teacher', '/teacher/billing'], ['student', '/no-such-page'],
  ] as [Workspace, string][])('%s at %s sees a clear "not available" page with a way home', (ws, path) => {
    mocks.user = user(ws);
    render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'This page is not available' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your home page' })).toHaveAttribute('href', `/${ws}`);
  });

  it('a signed-out visitor on an unknown page is offered the home page', () => {
    render(<MemoryRouter initialEntries={['/teacher/billing']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Go to your home page' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('the Paystack return path goes to the learner payments page, not "not available"', async () => {
    mocks.user = user('student', ['billing.view_own']);
    render(<MemoryRouter initialEntries={['/payment/callback?reference=r1']}><AppRoutes /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'This page is not available' })).toBeNull();
  });
});
