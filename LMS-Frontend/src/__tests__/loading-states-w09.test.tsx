/**
 * W09 — Truthful dashboard loading, error and empty states: behavioral TDD
 *
 * Defect: ParentDashboard calls getGroups().catch(() => []) which silently
 * converts a failed request into an empty array.  In /parent/rewards, the user
 * sees "Create a family group first" even when groups exist but the fetch failed.
 *
 * Fix: Promise.allSettled with independent groupsError state; rewards section
 * shows an error alert + retry when getGroups fails, not the empty-groups message.
 *
 * W9-PARENT-1: Both succeed → groups rendered in rewards section
 * W9-PARENT-2: getDashboard fails → top-level error alert shown
 * W9-PARENT-3: getGroups fails → groups error shown in rewards section (NOT empty-groups message)
 * W9-PARENT-4: getGroups fails → retry → getGroups succeeds → groups appear
 * W9-PARENT-5: Both fail → top-level error shown (getDashboard dominant)
 * W9-PARENT-6: Loading state visible while requests pending
 * W9-PARENT-7: getDashboard succeeds + getGroups fails → dashboard data still shown
 * W9-PARENT-COMPAT-1: W08 portal compat — no wallets/groups placeholder on /parent/wallets
 */

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

const dashboardError = () => new Error(); // → 'Could not load parent data.'
const groupsApiError = () => new Error(); // → 'Could not load family groups.'

// ──── Fixtures ──────────────────────────────────────────────────────────────

const dashboardData = { childrenCount: 2, children: [{ id: 'c1', name: 'Alice', email: 'alice@x.com' }] };
const groupData = [{ id: 'g1', name: 'Family Alpha', member_count: 2 }];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ParentDashboard />
    </MemoryRouter>,
  );
}

async function waitForLoad() {
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
}

// ──── Tests ─────────────────────────────────────────────────────────────────

describe('W09 — ParentDashboard data-fetch truthful states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuth();
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  it('W9-PARENT-1: both succeed → groups rendered in rewards section', async () => {
    vi.mocked(parentService.getDashboard).mockResolvedValue(dashboardData as any);
    vi.mocked(parentService.getGroups).mockResolvedValue(groupData as any);

    renderAt('/parent/rewards');
    await waitForLoad();

    // Groups shown — no error, no "create a family group" placeholder
    expect(screen.queryByText(/create a family group/i)).toBeNull();
    expect(screen.queryByText(/could not load family groups/i)).toBeNull();

    // RewardDashboard rendered for each group (scoped by group label or loading)
    // The RewardDashboard renders loading then empty; we just confirm no error text
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // ── getDashboard failure ────────────────────────────────────────────────

  it('W9-PARENT-2: getDashboard fails → top-level error alert shown', async () => {
    vi.mocked(parentService.getDashboard).mockRejectedValue(dashboardError());
    vi.mocked(parentService.getGroups).mockResolvedValue(groupData as any);

    renderAt('/parent');
    await waitForLoad();

    // Top-level error visible
    expect(screen.getByText(/could not load parent data/i)).toBeInTheDocument();
  });

  // ── getGroups failure — the core W09 RED test ──────────────────────────

  it('W9-PARENT-3: getGroups fails → groups error shown in rewards section (NOT empty-groups message)', async () => {
    vi.mocked(parentService.getDashboard).mockResolvedValue(dashboardData as any);
    vi.mocked(parentService.getGroups).mockRejectedValue(groupsApiError());

    renderAt('/parent/rewards');
    await waitForLoad();

    // MUST show an error about failing to load groups
    expect(screen.getByText(/could not load family groups/i)).toBeInTheDocument();

    // Must NOT show the empty-groups message (that would be the defect)
    expect(screen.queryByText(/create a family group first/i)).toBeNull();
  });

  it('W9-PARENT-3b: getGroups fails → retry button present in rewards section', async () => {
    vi.mocked(parentService.getDashboard).mockResolvedValue(dashboardData as any);
    vi.mocked(parentService.getGroups).mockRejectedValue(groupsApiError());

    renderAt('/parent/rewards');
    await waitForLoad();

    // Retry button must exist
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  // ── Retry works ────────────────────────────────────────────────────────

  it('W9-PARENT-4: getGroups fails → retry → getGroups succeeds → error replaced by groups', async () => {
    vi.mocked(parentService.getDashboard).mockResolvedValue(dashboardData as any);
    // First call: fail; second call (after retry): succeed
    vi.mocked(parentService.getGroups)
      .mockRejectedValueOnce(groupsApiError())
      .mockResolvedValueOnce(groupData as any);

    renderAt('/parent/rewards');
    await waitForLoad();

    // Error shown
    expect(screen.getByText(/could not load family groups/i)).toBeInTheDocument();

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // After retry succeeds, error should be gone
    await waitFor(() => expect(screen.queryByText(/could not load family groups/i)).toBeNull());

    // And "create a family group" placeholder should also be absent (groups present)
    expect(screen.queryByText(/create a family group first/i)).toBeNull();
  });

  // ── Both fail ──────────────────────────────────────────────────────────

  it('W9-PARENT-5: both fail → top-level error shown; no empty-groups message', async () => {
    vi.mocked(parentService.getDashboard).mockRejectedValue(dashboardError());
    vi.mocked(parentService.getGroups).mockRejectedValue(groupsApiError());

    renderAt('/parent/rewards');
    await waitForLoad();

    // Top-level error (getDashboard failure)
    expect(screen.getByText(/could not load parent data/i)).toBeInTheDocument();

    // No empty-groups message when both fail
    expect(screen.queryByText(/create a family group first/i)).toBeNull();
  });

  // ── Loading state ───────────────────────────────────────────────────────

  it('W9-PARENT-6: loading state visible while requests pending', async () => {
    let resolveDashboard!: (v: any) => void;
    let resolveGroups!: (v: any) => void;
    vi.mocked(parentService.getDashboard).mockReturnValue(new Promise((res) => { resolveDashboard = res; }));
    vi.mocked(parentService.getGroups).mockReturnValue(new Promise((res) => { resolveGroups = res; }));

    renderAt('/parent');

    // Loading shown immediately before resolution
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Resolve both
    act(() => {
      resolveDashboard(dashboardData);
      resolveGroups([]);
    });

    // Loading gone after resolution
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  });

  // ── Partial failure: dashboard data preserved ──────────────────────────

  it('W9-PARENT-7: getDashboard succeeds + getGroups fails → dashboard data (children count) still shown', async () => {
    vi.mocked(parentService.getDashboard).mockResolvedValue(dashboardData as any);
    vi.mocked(parentService.getGroups).mockRejectedValue(groupsApiError());

    renderAt('/parent');
    await waitForLoad();

    // Dashboard data is visible — children count (2) from dashboardData
    expect(screen.getByText('2')).toBeInTheDocument(); // childrenCount metric

    // No top-level error (getDashboard succeeded)
    expect(screen.queryByText(/could not load parent data/i)).toBeNull();
  });

  // ── W08 portal compatibility regression ────────────────────────────────

  it('W9-PARENT-COMPAT-1: /parent/wallets shows no placeholder text (W08 deferred redirect preserved)', async () => {
    vi.mocked(parentService.getDashboard).mockResolvedValue(dashboardData as any);
    vi.mocked(parentService.getGroups).mockResolvedValue([] as any);

    renderAt('/parent/wallets');
    await waitForLoad();

    // No deferred-feature placeholder text
    expect(screen.queryByText(/wallets coming soon/i)).toBeNull();
    expect(screen.queryByText(/not yet available/i)).toBeNull();
  });
});
