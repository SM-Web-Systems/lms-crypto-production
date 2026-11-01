/** W09-R2: stale refresh data and parent account ownership. */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ──── Module mocks — must precede dynamic imports ───────────────────────────

vi.mock('../context/useAuth', () => ({ useAuth: vi.fn() }));

vi.mock('../services/parentService', () => ({
  parentService: {
    getDashboard: vi.fn(),
    getGroups: vi.fn(),
    createGroup: vi.fn(),
    deleteGroup: vi.fn(),
    updateGroup: vi.fn(),
  },
}));

vi.mock('../services/rewardService', () => ({
  rewardService: {
    listRewards: vi.fn().mockResolvedValue([]),
    getAllocations: vi.fn().mockResolvedValue([]),
    createReward: vi.fn(),
    fundReward: vi.fn(),
    activateReward: vi.fn(),
    cancelReward: vi.fn(),
    approveReward: vi.fn(),
    releaseAllocation: vi.fn(),
    refundAllocation: vi.fn(),
  },
}));

vi.mock('../services/messageService', () => ({
  messageService: { getUnreadCount: vi.fn().mockResolvedValue(0) },
}));

// ──── Imports after mocks ───────────────────────────────────────────────────

import { useAuth } from '../context/useAuth';
import { parentService } from '../services/parentService';
import ParentDashboard from '../pages/ParentDashboard';

// ──── Auth helpers ──────────────────────────────────────────────────────────

function setAuth() {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: 'u1',
      name: 'Parent User',
      email: 'parent@example.com',
      role: 'parent',
      walletAddress: null,
      walletLinkingStatus: 'none' as const,
      workspaces: ['parent'],
      defaultWorkspace: 'parent',
      permissions: ['reward.view_assigned', 'reward.create', 'reward.activate', 'reward.cancel'],
    } as any,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  } as any);
}

// ──── Error factories — empty message so getErrorMessage uses the fallback ──
// getErrorMessage(err, fallback) returns err.message when non-empty, else fallback.
// Using new Error() (no message) ensures the component renders our expected text.


// ──── Fixtures ──────────────────────────────────────────────────────────────

const dashboardData = { childrenCount: 2, children: [{ id: 'c1', name: 'Alice', email: 'alice@x.com' }] };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ParentDashboard />
    </MemoryRouter>,
  );
}


// ──── Tests ─────────────────────────────────────────────────────────────────

describe('W09-R2 parent state ownership', () => {
  beforeEach(() => { vi.resetAllMocks(); setAuth(); });
  it('does not present an old child count as current after a failed refresh', async () => {
    vi.mocked(parentService.getDashboard).mockResolvedValueOnce(dashboardData as any).mockRejectedValueOnce(new Error('dashboard refresh failed'));
    vi.mocked(parentService.getGroups).mockResolvedValue([]);
    renderAt('/parent');
    await screen.findByText('2');
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await screen.findByText('dashboard refresh failed');
    expect(screen.queryByText('2')).toBeNull();
  });
  it('does not retain a previous account children list after account identity changes', async () => {
    vi.mocked(parentService.getDashboard).mockResolvedValueOnce(dashboardData as any).mockResolvedValue({ childrenCount: 0, children: [] } as any);
    vi.mocked(parentService.getGroups).mockResolvedValue([]);
    const view = renderAt('/parent');
    await screen.findByText('Alice');
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'other-parent', name: 'Other Parent', permissions: [], workspaces: ['parent'] }, isAuthenticated: true, isLoading: false, logout: vi.fn() } as any);
    view.rerender(<MemoryRouter initialEntries={['/parent']}><ParentDashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText('Alice')).toBeNull());
  });
  it('discards a previous account response that arrives after an identity change', async () => {
    let resolveOld!: (value: any) => void;
    const oldRequest = new Promise<any>((resolve) => { resolveOld = resolve; });
    vi.mocked(parentService.getDashboard).mockReturnValueOnce(oldRequest).mockResolvedValue({ childrenCount: 0, children: [] } as any);
    vi.mocked(parentService.getGroups).mockResolvedValue([]);
    const view = renderAt('/parent');
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'other-parent', name: 'Other Parent', permissions: [], workspaces: ['parent'] }, isAuthenticated: true, isLoading: false, logout: vi.fn() } as any);
    view.rerender(<MemoryRouter initialEntries={['/parent']}><ParentDashboard /></MemoryRouter>);
    await screen.findByText('0');
    await act(async () => { resolveOld(dashboardData); await oldRequest; });
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('0')).toBeTruthy();
  });
});


