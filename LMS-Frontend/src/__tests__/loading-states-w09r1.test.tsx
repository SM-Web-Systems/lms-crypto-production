/**
 * W09-R1 — Request ownership and truthful metric display: behavioral TDD
 *
 * Regressions at 2c6883c (W09 merge):
 *
 * R1 — False-zero metric: getDashboard() rejects → dashboard===null → childrenCount??0 renders
 *      "0" even though count is unknown. Fix: hide metric card when dashboard===null.
 *
 * R2 — Stale request override: load() has no reqIdRef guard. A Refresh started while the
 *      initial load is pending can complete first; when the initial load settles later it
 *      overwrites the newer result. Fix: reqIdRef monotonic counter (same pattern as
 *      RewardDashboard) checked before any state commits.
 *
 * Also covers RewardDashboard allocation expand error (W09 deferred, now fixed):
 * toggleAllocations previously silently collapsed on failure. Now shows error+retry.
 *
 * W9R1-PARENT-1: getDashboard fails → "Linked Children" metric NOT shown (not zero)
 * W9R1-PARENT-2: refresh while initial pending; newer count=9 first, older count=2 late → 9 kept
 * W9R1-PARENT-3: refresh while initial pending; newer count=5 succeeds, older fails late → 5 kept, no error
 * W9R1-PARENT-4: baseline ownership — single load settles; loading disappears, data shown
 * W9R1-ALLOC-1: getAllocations fails → error alert shown in expanded allocation row
 * W9R1-ALLOC-2: getAllocations fails → "Try again" button present
 * W9R1-ALLOC-3: getAllocations fails → retry → succeeds → allocations shown, error gone
 * W9R1-ALLOC-EPOCH: getAllocations in flight during target switch → old error does not appear on new target
 */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ──── ParentDashboard mocks ─────────────────────────────────────────────────

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
    listRewards: vi.fn(),
    getAllocations: vi.fn(),
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

// ──── Imports after mocks ────────────────────────────────────────────────────

import { useAuth } from '../context/useAuth';
import { parentService } from '../services/parentService';
import { rewardService } from '../services/rewardService';
import ParentDashboard from '../pages/ParentDashboard';
import { RewardDashboard } from '../components/RewardDashboard';

// ──── Auth helpers ───────────────────────────────────────────────────────────

function setParentAuth() {
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

function setSponsorAuth() {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: 's1',
      name: 'Sponsor User',
      email: 'sponsor@example.com',
      role: 'sponsor',
      walletAddress: null,
      walletLinkingStatus: 'none' as const,
      workspaces: ['sponsor'],
      defaultWorkspace: 'sponsor',
      permissions: [
        'reward.create', 'reward.activate', 'reward.cancel', 'reward.approve',
        'reward.release', 'reward.refund', 'reward.view_assigned',
        'cohort.manage', 'billing.view_own',
      ],
    } as any,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  } as any);
}

// ──── Error factory ──────────────────────────────────────────────────────────
// Empty-message errors so getErrorMessage(err, fallback) uses the fallback text.
const dashboardError = () => new Error();   // → 'Could not load parent data.'

// ──── ParentDashboard fixtures ───────────────────────────────────────────────

function renderParentAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ParentDashboard />
    </MemoryRouter>,
  );
}

async function waitForParentLoad() {
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
}

// ──── RewardDashboard fixtures ───────────────────────────────────────────────

// A minimal funded reward for allocation expand tests.
const fundedReward = {
  id: 'r1',
  reward_type: 'custom',
  amount_stroops: '10000000',
  status: 'funded',
  created_at: new Date().toISOString(),
  scope_id: 'scope1',
  target_type: 'family',
  description: null,
  auto_release: false,
};

function renderReward(scopeId = 'scope1') {
  return render(
    <MemoryRouter>
      <RewardDashboard role="sponsor" scopeId={scopeId} />
    </MemoryRouter>,
  );
}

async function waitForRewardData() {
  await waitFor(() => expect(screen.queryByText('Loading rewards...')).toBeNull());
}

// ──── ParentDashboard tests ──────────────────────────────────────────────────

describe('W09-R1 — ParentDashboard request ownership + truthful metric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setParentAuth();
  });

  // ── R1: false-zero metric ─────────────────────────────────────────────────

  it('W9R1-PARENT-1: getDashboard fails → metric card (Linked Children) NOT rendered', async () => {
    vi.mocked(parentService.getDashboard).mockRejectedValue(dashboardError());
    vi.mocked(parentService.getGroups).mockResolvedValue([]);

    renderParentAt('/parent');
    await waitForParentLoad();

    // Top-level error shown
    expect(screen.getByText(/could not load parent data/i)).toBeInTheDocument();

    // Metric card must NOT be rendered — no false-zero claim
    expect(screen.queryByText(/linked children/i)).toBeNull();
  });

  // ── R2: stale request overwrite ────────────────────────────────────────────

  it('W9R1-PARENT-2: refresh during initial load — older count=2 does not overwrite newer count=9', async () => {
    let resolveDash1!: (v: any) => void;
    let resolveDash2!: (v: any) => void;
    vi.mocked(parentService.getDashboard)
      .mockReturnValueOnce(new Promise((res) => { resolveDash1 = res; }))
      .mockReturnValueOnce(new Promise((res) => { resolveDash2 = res; }));
    vi.mocked(parentService.getGroups).mockResolvedValue([]);

    renderParentAt('/parent');
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Click Refresh while initial load is still pending → second load starts
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    // Settle the newer (second) load first — count=9
    await act(async () => { resolveDash2({ childrenCount: 9, children: [] }); });
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
    expect(screen.getByText('9')).toBeInTheDocument();

    // Settle the older (first) load — count=2 — must be discarded by reqIdRef guard
    await act(async () => { resolveDash1({ childrenCount: 2, children: [] }); });

    // 9 must still be shown; 2 must never appear
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.queryByText('2')).toBeNull();
  });

  it('W9R1-PARENT-3: late failure from first load does not clear second load success', async () => {
    let rejectDash1!: (e: any) => void;
    let resolveDash2!: (v: any) => void;
    vi.mocked(parentService.getDashboard)
      .mockReturnValueOnce(new Promise((_, rej) => { rejectDash1 = rej; }))
      .mockReturnValueOnce(new Promise((res) => { resolveDash2 = res; }));
    vi.mocked(parentService.getGroups).mockResolvedValue([]);

    renderParentAt('/parent');
    // Click Refresh while initial load is still pending
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    // Settle newer (second) successfully — count=5
    await act(async () => { resolveDash2({ childrenCount: 5, children: [] }); });
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
    expect(screen.getByText('5')).toBeInTheDocument();

    // Late failure from first — must be discarded
    await act(async () => { rejectDash1(dashboardError()); });

    // Error from first must NOT appear; second's data intact
    expect(screen.queryByText(/could not load parent data/i)).toBeNull();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  // ── Baseline (single load) ─────────────────────────────────────────────────

  it('W9R1-PARENT-4: single load — loading disappears and count shown correctly', async () => {
    vi.mocked(parentService.getDashboard).mockResolvedValue({ childrenCount: 3, children: [] } as any);
    vi.mocked(parentService.getGroups).mockResolvedValue([]);

    renderParentAt('/parent');
    await waitForParentLoad();

    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText(/could not load parent data/i)).toBeNull();
  });
});

// ──── RewardDashboard allocation expand error tests ──────────────────────────

describe('W09-R1 — RewardDashboard allocation expand error display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSponsorAuth();
    vi.mocked(rewardService.listRewards).mockResolvedValue([fundedReward] as any);
  });

  // ── W9R1-ALLOC-1: error alert rendered ────────────────────────────────────

  it('W9R1-ALLOC-1: getAllocations fails → error alert shown in expanded row', async () => {
    vi.mocked(rewardService.getAllocations).mockRejectedValue(new Error());

    renderReward();
    await waitForRewardData();

    const expandBtn = await screen.findByRole('button', { name: /expand allocations/i });
    fireEvent.click(expandBtn);

    await waitFor(() =>
      expect(screen.getByText(/could not load allocations/i)).toBeInTheDocument()
    );
  });

  // ── W9R1-ALLOC-2: retry button present ────────────────────────────────────

  it('W9R1-ALLOC-2: getAllocations fails → "Try again" button present in allocation row', async () => {
    vi.mocked(rewardService.getAllocations).mockRejectedValue(new Error());

    renderReward();
    await waitForRewardData();

    const expandBtn = await screen.findByRole('button', { name: /expand allocations/i });
    fireEvent.click(expandBtn);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    );
  });

  // ── W9R1-ALLOC-3: retry succeeds → error gone, allocs shown ───────────────

  it('W9R1-ALLOC-3: getAllocations fails → retry → succeeds → allocations shown, error gone', async () => {
    const alloc = {
      id: 'a1',
      reward_id: 'r1',
      student_user_id: 'abc1def2ghi34567',   // .slice(0,8) = 'abc1def2' → 'abc1def2...'
      amount_stroops: '10000000',
      status: 'eligible',
      created_at: new Date().toISOString(),
    };
    vi.mocked(rewardService.getAllocations)
      .mockRejectedValueOnce(new Error())        // first expand fails
      .mockResolvedValueOnce([alloc] as any);    // retry succeeds

    renderReward();
    await waitForRewardData();

    const expandBtn = await screen.findByRole('button', { name: /expand allocations/i });
    fireEvent.click(expandBtn);

    // Error shown
    await waitFor(() =>
      expect(screen.getByText(/could not load allocations/i)).toBeInTheDocument()
    );

    // Click Try again
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // Error gone; allocation table shown (verified by "Student" column header)
    await waitFor(() =>
      expect(screen.queryByText(/could not load allocations/i)).toBeNull()
    );
    expect(screen.getByText('Student')).toBeInTheDocument();
  });

  // ── W9R1-ALLOC-EPOCH: W06 epoch guard on allocation error ─────────────────

  it('W9R1-ALLOC-EPOCH: stale getAllocations failure after target switch does not appear on new target', async () => {
    // Pre-create the deferred promise so the reject handle is available before the click.
    // The Promise constructor runs synchronously, so rejectAllocs is set immediately.
    let rejectAllocs: (e: any) => void = () => {};
    const allocsDeferred = new Promise<any>((_, rej) => { rejectAllocs = rej; });
    vi.mocked(rewardService.getAllocations).mockReturnValueOnce(allocsDeferred);

    const { rerender } = renderReward('scope1');
    await waitForRewardData();

    // Expand allocations on scope1 — getAllocations in flight
    const expandBtn = await screen.findByRole('button', { name: /expand allocations/i });
    fireEvent.click(expandBtn);

    // Confirm getAllocations was called (so the mock was consumed)
    await waitFor(() =>
      expect(vi.mocked(rewardService.getAllocations)).toHaveBeenCalledTimes(1)
    );

    // Switch target — this increments targetEpochRef in useEffect cleanup
    vi.mocked(rewardService.listRewards).mockResolvedValue([fundedReward] as any);
    rerender(
      <MemoryRouter>
        <RewardDashboard role="sponsor" scopeId="scope2" />
      </MemoryRouter>,
    );
    await waitForRewardData();

    // Reject the old getAllocations — epoch guard must prevent error appearing on new target
    await act(async () => { rejectAllocs(new Error('stale error')); });

    // The allocation error from scope1 must not appear in scope2's view
    expect(screen.queryByText(/could not load allocations/i)).toBeNull();
  });
});
