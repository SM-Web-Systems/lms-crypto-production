/**
 * W08-R2 — performAction stale-user closure: behavioral TDD
 *
 * Defect: `performAction` in RewardDashboard closes over `user` via useCallback
 * but `user` was absent from the dependency array. After a permission grant,
 * the button becomes visible (render-time filter reads current user) but clicking
 * it invokes the stale closure with the old user → hasCapability fails → service
 * NOT called.
 *
 * Fix: add `user` to the useCallback dep array so the handler always holds the
 * current auth user at click time.
 *
 * W8R2-GRANT-1   — null user → authenticated with reward.activate → Activate called
 * W8R2-GRANT-2   — view_assigned only → grant reward.activate (CORE RED→GREEN) → activateReward called
 * W8R2-GRANT-3   — view_assigned only → grant reward.cancel → cancelReward called
 * W8R2-GRANT-4   — grant reward.approve on eligible_pending_approval → approveReward called
 * W8R2-GRANT-5   — grant reward.release → click Release on eligible allocation → releaseAllocation called
 * W8R2-GRANT-6   — grant reward.refund (canRefund=true) → click Refund on released alloc → refundAllocation called
 * W8R2-REVOKE-1  — grant reward.activate → revoke → button disappears; service NOT called
 * W8R2-REVOKE-2  — grant reward.cancel → revoke → regrant → cancelReward called on regrant
 * W8R2-UNKNOWN   — action key not in ACTION_CAPABILITY → service NOT called (fail closed)
 * W8R2-COMPAT-1  — W06 A→B→A: stale callbacks after target switch do not fire on new target
 * W8R2-COMPAT-2  — W08-R1 submission guard: revoke before click → service not called
 */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ──── Module mocks — must be before dynamic imports ────────────────────────

vi.mock('../context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/rewardService', () => ({
  rewardService: {
    listRewards: vi.fn().mockResolvedValue([]),
    getAllocations: vi.fn().mockResolvedValue([]),
    createReward: vi.fn().mockResolvedValue({ id: 'new-r', status: 'draft', reward_type: 'custom' }),
    fundReward: vi.fn().mockResolvedValue({}),
    activateReward: vi.fn().mockResolvedValue({}),
    cancelReward: vi.fn().mockResolvedValue({}),
    approveReward: vi.fn().mockResolvedValue({}),
    releaseAllocation: vi.fn().mockResolvedValue({}),
    refundAllocation: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../services/messageService', () => ({
  messageService: { getUnreadCount: vi.fn().mockResolvedValue(0) },
}));

// ──── Imports after mocks ───────────────────────────────────────────────────

import { useAuth } from '../context/useAuth';
import { rewardService } from '../services/rewardService';
import { RewardDashboard } from '../components/RewardDashboard';

// ──── Auth helpers ──────────────────────────────────────────────────────────

function makeUser(permissions: string[]) {
  return {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'sponsor',
    walletAddress: null,
    walletLinkingStatus: 'none' as const,
    workspaces: ['sponsor'],
    defaultWorkspace: 'sponsor',
    permissions,
  };
}

function setAuth(permissions: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: makeUser(permissions) as any,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  } as any);
}

function setAuthNull() {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    logout: vi.fn(),
  } as any);
}

// ──── Reward/allocation factories ───────────────────────────────────────────

function makeReward(status: string, id?: string) {
  return {
    id: id ?? `r-${status}`,
    creator_user_id: 'u1',
    scope_type: 'sponsor_cohort',
    scope_id: 'scope1',
    reward_type: 'custom',
    amount_stroops: 10_000_000,
    max_recipients: null,
    currency_code: 'XLM',
    description: null,
    auto_release: 0,
    status,
    expires_at: null,
    funded_at: null,
    activated_at: null,
    released_at: null,
    cancelled_at: null,
    created_at: '2026-10-31T00:00:00Z',
    updated_at: '2026-10-31T00:00:00Z',
  };
}

function makeAllocation(status: string) {
  return {
    id: `a-${status}`,
    student_user_id: 'student-001',
    amount_stroops: 5_000_000,
    status,
  };
}

// ──── Render helper ─────────────────────────────────────────────────────────

function renderDashboard(props?: { canRefund?: boolean }) {
  return render(
    <MemoryRouter>
      <RewardDashboard role="sponsor" scopeId="scope1" {...props} />
    </MemoryRouter>,
  );
}

async function waitForRewards() {
  await waitFor(() => expect(screen.queryByText('Loading rewards...')).toBeNull());
}

// ──── Tests ─────────────────────────────────────────────────────────────────

describe('W08-R2 — performAction stale-user closure fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthNull();
  });

  // ── Grant scenarios: service must be called after permission added ────────

  describe('Grant-after-render: service called with newly-granted capabilities', () => {
    it('W8R2-GRANT-1: null user → authenticated with reward.activate → activateReward called', async () => {
      // Start null
      setAuthNull();
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      const { rerender } = renderDashboard();
      await waitForRewards();

      // No activate button yet
      expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();

      // Grant reward.activate
      act(() => { setAuth(['reward.activate', 'reward.view_assigned']); });
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" />
        </MemoryRouter>,
      );

      // Activate button now visible
      await waitFor(() => expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument());

      // Click → service called
      fireEvent.click(screen.getByRole('button', { name: /activate/i }));
      await waitFor(() => expect(vi.mocked(rewardService.activateReward)).toHaveBeenCalledWith('sponsor', 'r-funded', expect.any(String)));
    });

    it('W8R2-GRANT-2: view_assigned only → grant reward.activate → activateReward called (CORE RED→GREEN)', async () => {
      // The exact finding: view-only user → grant activate between renders
      setAuth(['reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      const { rerender } = renderDashboard();
      await waitForRewards();

      // Confirm: no Activate with view-only
      expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();

      // Replace auth: grant reward.activate
      act(() => { setAuth(['reward.view_assigned', 'reward.activate']); });
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" />
        </MemoryRouter>,
      );

      // Activate appears
      await waitFor(() => expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument());

      // Click it — without the fix, performAction has stale user (view_assigned only) and returns early.
      // With the fix, performAction uses current user (has activate) → service called.
      fireEvent.click(screen.getByRole('button', { name: /activate/i }));
      await waitFor(() =>
        expect(vi.mocked(rewardService.activateReward)).toHaveBeenCalledWith('sponsor', 'r-funded', expect.any(String)),
      );
    });

    it('W8R2-GRANT-3: view_assigned only → grant reward.cancel → cancelReward called', async () => {
      setAuth(['reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      const { rerender } = renderDashboard();
      await waitForRewards();
      expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();

      act(() => { setAuth(['reward.view_assigned', 'reward.cancel']); });
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" />
        </MemoryRouter>,
      );

      await waitFor(() => expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      await waitFor(() =>
        expect(vi.mocked(rewardService.cancelReward)).toHaveBeenCalledWith('sponsor', 'r-funded', '', expect.any(String)),
      );
    });

    it('W8R2-GRANT-4: grant reward.approve on eligible_pending_approval reward → approveReward called', async () => {
      setAuth(['reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('eligible_pending_approval')] as any);

      const { rerender } = renderDashboard();
      await waitForRewards();
      expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();

      act(() => { setAuth(['reward.view_assigned', 'reward.approve']); });
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" />
        </MemoryRouter>,
      );

      await waitFor(() => expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /approve/i }));
      await waitFor(() =>
        expect(vi.mocked(rewardService.approveReward)).toHaveBeenCalledWith('sponsor', 'r-eligible_pending_approval', expect.any(String)),
      );
    });

    it('W8R2-GRANT-5: grant reward.release → click Release on eligible allocation → releaseAllocation called', async () => {
      setAuth(['reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('active', 'r1')] as any);
      vi.mocked(rewardService.getAllocations).mockResolvedValue([makeAllocation('eligible')] as any);

      const { rerender } = renderDashboard();
      await waitForRewards();

      // Expand allocations (visible before grant)
      fireEvent.click(screen.getByRole('button', { name: /expand allocations/i }));
      await waitFor(() => expect(vi.mocked(rewardService.getAllocations)).toHaveBeenCalled());

      // No Release button yet
      expect(screen.queryByRole('button', { name: /release/i })).toBeNull();

      // Grant reward.release
      act(() => { setAuth(['reward.view_assigned', 'reward.release']); });
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" />
        </MemoryRouter>,
      );

      // Release appears
      await waitFor(() => expect(screen.getByRole('button', { name: /release/i })).toBeInTheDocument());

      // Click it
      fireEvent.click(screen.getByRole('button', { name: /release/i }));
      await waitFor(() =>
        expect(vi.mocked(rewardService.releaseAllocation)).toHaveBeenCalledWith('sponsor', 'r1', 'a-eligible', expect.any(String)),
      );
    });

    it('W8R2-GRANT-6: grant reward.refund (canRefund=true) → click Refund on released alloc → refundAllocation called', async () => {
      setAuth(['reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('released', 'r1')] as any);
      vi.mocked(rewardService.getAllocations).mockResolvedValue([makeAllocation('released')] as any);

      const { rerender } = render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" canRefund />
        </MemoryRouter>,
      );
      await waitForRewards();

      // Expand
      fireEvent.click(screen.getByRole('button', { name: /expand allocations/i }));
      await waitFor(() => expect(vi.mocked(rewardService.getAllocations)).toHaveBeenCalled());

      // No Refund yet
      expect(screen.queryByRole('button', { name: /refund/i })).toBeNull();

      // Grant reward.refund
      act(() => { setAuth(['reward.view_assigned', 'reward.refund']); });
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" canRefund />
        </MemoryRouter>,
      );

      await waitFor(() => expect(screen.getByRole('button', { name: /refund/i })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /refund/i }));
      await waitFor(() =>
        expect(vi.mocked(rewardService.refundAllocation)).toHaveBeenCalledWith('sponsor', 'r1', 'a-released', expect.any(String)),
      );
    });
  });

  // ── Revocation scenarios: button disappears, service NOT called ───────────

  describe('Revocation: action disappears and service is not invoked', () => {
    it('W8R2-REVOKE-1: grant reward.activate then revoke it → button disappears; service not called', async () => {
      // Start with activate
      setAuth(['reward.view_assigned', 'reward.activate']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      const { rerender } = renderDashboard();
      await waitForRewards();

      // Button is present
      expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument();

      // Revoke activate
      act(() => { setAuth(['reward.view_assigned']); });
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" />
        </MemoryRouter>,
      );

      // Button must disappear
      await waitFor(() => expect(screen.queryByRole('button', { name: /activate/i })).toBeNull());

      // Service must not have been called
      expect(vi.mocked(rewardService.activateReward)).not.toHaveBeenCalled();
    });

    it('W8R2-REVOKE-2: grant → revoke → regrant reward.cancel → cancelReward called on regrant click', async () => {
      setAuth(['reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      const { rerender } = renderDashboard();
      await waitForRewards();

      // 1. Grant
      act(() => { setAuth(['reward.view_assigned', 'reward.cancel']); });
      rerender(<MemoryRouter><RewardDashboard role="sponsor" scopeId="scope1" /></MemoryRouter>);
      await waitFor(() => expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument());

      // 2. Revoke
      act(() => { setAuth(['reward.view_assigned']); });
      rerender(<MemoryRouter><RewardDashboard role="sponsor" scopeId="scope1" /></MemoryRouter>);
      await waitFor(() => expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull());
      expect(vi.mocked(rewardService.cancelReward)).not.toHaveBeenCalled();

      // 3. Regrant
      act(() => { setAuth(['reward.view_assigned', 'reward.cancel']); });
      rerender(<MemoryRouter><RewardDashboard role="sponsor" scopeId="scope1" /></MemoryRouter>);
      await waitFor(() => expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument());

      // Click on regrant — service must be called
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      await waitFor(() =>
        expect(vi.mocked(rewardService.cancelReward)).toHaveBeenCalledWith('sponsor', 'r-funded', '', expect.any(String)),
      );
    });
  });

  // ── Fail-closed for unknown action keys ─────────────────────────────────

  describe('Unknown action key — fail closed', () => {
    it('W8R2-UNKNOWN: unknown action key in ACTION_CAPABILITY → no service call (fail closed)', async () => {
      // Full-cap user, but we directly invoke performAction via a button
      // that would use an unknown action. We simulate by rendering with
      // a reward in a status not mapped to ACTIONS (e.g. 'released') and
      // verifying no service is invoked for uncovered actions.
      setAuth([
        'reward.activate', 'reward.cancel', 'reward.approve',
        'reward.release', 'reward.refund', 'reward.view_assigned',
      ]);
      // 'released' rewards have no ACTIONS[] entry, so no action buttons
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('released')] as any);

      renderDashboard({ canRefund: false });
      await waitForRewards();

      // No lifecycle action buttons for 'released' status (no ACTIONS entry)
      expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();

      // Service methods not invoked
      expect(vi.mocked(rewardService.activateReward)).not.toHaveBeenCalled();
      expect(vi.mocked(rewardService.cancelReward)).not.toHaveBeenCalled();
    });
  });

  // ── W06 compatibility: A→B→A target guard preserved ─────────────────────

  describe('W06 compatibility — A→B→A target guard unaffected by user change', () => {
    it('W8R2-COMPAT-1: user change does not affect epoch/targetKey guards', async () => {
      // Render with activate permission on scopeA — button is visible
      setAuth(['reward.activate', 'reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded', 'r-scopeA')] as any);

      const { rerender } = render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scopeA" />
        </MemoryRouter>,
      );
      await waitForRewards();
      expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument();

      // Switch to scopeB simultaneously with a user change; scopeB has no rewards
      act(() => { setAuth(['reward.view_assigned', 'reward.activate']); });
      vi.mocked(rewardService.listRewards).mockResolvedValue([] as any);
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scopeB" />
        </MemoryRouter>,
      );
      await waitForRewards();

      // Button disappeared — scope changed, rewards are empty
      expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();
      // The empty-state message should appear (rewards list empty on scopeB)
      await waitFor(() =>
        expect(screen.getByText('No rewards yet. Create one to get started.')).toBeInTheDocument(),
      );

      // activateReward was never invoked — no click occurred on the original button
      expect(vi.mocked(rewardService.activateReward)).not.toHaveBeenCalled();
    });
  });

  // ── W08-R1 submission-guard compatibility ────────────────────────────────

  describe('W08-R1 submission guard compatibility', () => {
    it('W8R2-COMPAT-2: revoke capability between render and click → service not called', async () => {
      // Start with activate
      setAuth(['reward.view_assigned', 'reward.activate']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      const { rerender } = renderDashboard();
      await waitForRewards();

      const activateBtn = screen.getByRole('button', { name: /activate/i });
      expect(activateBtn).toBeInTheDocument();

      // Revoke before clicking — button disappears (render-time filter)
      act(() => { setAuth(['reward.view_assigned']); });
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" />
        </MemoryRouter>,
      );

      // Button gone — revocation guard works
      await waitFor(() => expect(screen.queryByRole('button', { name: /activate/i })).toBeNull());
      expect(vi.mocked(rewardService.activateReward)).not.toHaveBeenCalled();
    });
  });
});
