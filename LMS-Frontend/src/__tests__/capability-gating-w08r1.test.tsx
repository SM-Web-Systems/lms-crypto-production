/**
 * W08-R1 — Capability-gated portal controls: behavioral TDD
 *
 * Two failures found in post-merge independent testing of W08 (#133):
 * 1. Sponsor with reward.view_assigned only sees mutation controls (New Reward,
 *    Activate, Cancel) despite lacking reward.create/activate/cancel.
 * 2. Teacher without group.create sees New Class button; employer sees New Team
 *    despite both endpoints requiring group.create.
 *
 * W8R1-SPONSOR-1   — Sponsor w/ reward.view_assigned only: no New Reward button
 * W8R1-SPONSOR-2   — Same user: no Activate/Cancel for funded reward
 * W8R1-TEACHER-GC-1 — Teacher without group.create: no New Class button
 * W8R1-EMPLOYER-GC-1 — Employer without group.create: no New Team button
 * W8R1-TEACHER-GC-2 — Teacher WITH group.create: New Class button present and submittable
 * W8R1-EMPLOYER-GC-2 — Employer WITH group.create: New Team button present and submittable
 * W8R1-MATRIX-1    — reward.view_assigned only: no New Reward, no action buttons
 * W8R1-MATRIX-2    — reward.create only: New Reward visible; no lifecycle action buttons
 * W8R1-MATRIX-3    — reward.activate only: Activate for funded; no New Reward, no Cancel
 * W8R1-MATRIX-4    — reward.cancel only: Cancel for funded/active; no Activate, no New Reward
 * W8R1-MATRIX-5    — reward.approve only: Approve for eligible_pending_approval
 * W8R1-MATRIX-6    — reward.release only: Release for eligible allocation
 * W8R1-MATRIX-7    — reward.refund + canRefund=true: Refund for released allocation
 * W8R1-MATRIX-8    — canRefund=true but no reward.refund: no Refund button
 * W8R1-LOADING-1   — Unknown/loading user: no mutation controls
 * W8R1-REVOKE-1    — Revoke reward.create while create form open: form closes
 * W8R1-REVOKE-2    — Revoke group.create while class form open: form closes
 * W8R1-REVOKE-3    — Revoke capability before submission: service not called
 * W8R1-COMPAT-1    — Full-cap sponsor: New Reward + Activate + Cancel + Refund present
 * W8R1-COMPAT-2    — canRefund prop respected with reward.refund
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

vi.mock('../services/teacherService', () => ({
  teacherService: {
    getDashboard: vi.fn().mockResolvedValue({
      totalClasses: 1,
      totalStudents: 5,
      classes: [{ id: 'class1', name: 'Math 101', studentCount: 5 }],
    }),
    createClass: vi.fn().mockResolvedValue({ id: 'new-class', name: 'New Class' }),
  },
}));

vi.mock('../services/employerService', () => ({
  employerService: {
    getDashboard: vi.fn().mockResolvedValue({
      totalTeams: 1,
      totalMembers: 3,
      teams: [{ id: 'team1', name: 'Alpha Team', member_count: 3 }],
    }),
    getTeams: vi.fn().mockResolvedValue([{ id: 'team1', name: 'Alpha Team', member_count: 3 }]),
    createTeam: vi.fn().mockResolvedValue({ id: 'new-team', name: 'New Team' }),
  },
}));

vi.mock('../services/messageService', () => ({
  messageService: { getUnreadCount: vi.fn().mockResolvedValue(0) },
}));

// ──── Imports after mocks ───────────────────────────────────────────────────

import { useAuth } from '../context/useAuth';
import { rewardService } from '../services/rewardService';
import { teacherService } from '../services/teacherService';
import { employerService } from '../services/employerService';
import { RewardDashboard } from '../components/RewardDashboard';
import TeacherDashboard from '../pages/TeacherDashboard';
import EmployerDashboard from '../pages/EmployerDashboard';

// ──── Fixtures ─────────────────────────────────────────────────────────────

/** User with exactly the listed permissions and nothing else */
function makeUser(workspace: string, permissions: string[]) {
  return {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    role: workspace,
    walletAddress: null,
    walletLinkingStatus: 'none' as const,
    workspaces: [workspace],
    defaultWorkspace: workspace,
    permissions,
  };
}

function setAuth(workspace: string, permissions: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: makeUser(workspace, permissions) as any,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  } as any);
}

function setAuthLoading() {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: true,
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

// ──── Reward factory ────────────────────────────────────────────────────────

function makeReward(status: string, id?: string) {
  return {
    id: id ?? `r-${status}`,
    creator_user_id: 'u1',
    scope_type: 'sponsor_cohort',
    scope_id: 'scope1',
    reward_type: 'custom',
    amount_stroops: 10000000,
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
    amount_stroops: 5000000,
    status,
  };
}

// ──── Helpers ───────────────────────────────────────────────────────────────

async function waitForRewards() {
  await waitFor(() => expect(screen.queryByText('Loading rewards...')).toBeNull());
}

// ──── Tests ─────────────────────────────────────────────────────────────────

describe('W08-R1 — Capability-gated portal controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthNull();
  });

  // ── Exact failure reproductions ─────────────────────────────────────────

  describe('Exact post-W08 failures — RED before fix, GREEN after', () => {
    it('W8R1-SPONSOR-1: sponsor with only reward.view_assigned sees NO New Reward button', async () => {
      // EXACT reproduction: W08 test fixture + funded reward
      setAuth('sponsor', ['reward.view_assigned', 'billing.view_own', 'cohort.manage', 'impact_report.read']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="cohort1" scopeLabel="Alpha Cohort" />
        </MemoryRouter>,
      );
      await waitForRewards();

      // User lacks reward.create — New Reward MUST NOT appear
      expect(screen.queryByRole('button', { name: /new reward/i })).toBeNull();
    });

    it('W8R1-SPONSOR-2: same user sees NO Activate or Cancel for funded reward', async () => {
      // EXACT reproduction: view-only sponsor watching a funded reward
      setAuth('sponsor', ['reward.view_assigned', 'billing.view_own', 'cohort.manage', 'impact_report.read']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="cohort1" />
        </MemoryRouter>,
      );
      await waitForRewards();

      // User lacks reward.activate and reward.cancel — neither button may appear
      expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
    });

    it('W8R1-TEACHER-GC-1: teacher with group.manage but NO group.create sees NO New Class button', async () => {
      // EXACT reproduction: teacher with group.manage + student.view_assigned, NO group.create
      setAuth('teacher', ['group.manage', 'student.view_assigned', 'reward.view_assigned', 'billing.view_own']);

      render(
        <MemoryRouter initialEntries={['/teacher/classes']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Your Classes');

      // No group.create → New Class MUST NOT appear
      expect(screen.queryByRole('button', { name: /new class/i })).toBeNull();
    });

    it('W8R1-EMPLOYER-GC-1: employer without group.create sees NO New Team button', async () => {
      setAuth('employer', ['group.manage', 'student.view_assigned', 'reward.view_assigned', 'billing.view_own']);

      render(
        <MemoryRouter initialEntries={['/employer/teams']}>
          <EmployerDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Your Teams');

      expect(screen.queryByRole('button', { name: /new team/i })).toBeNull();
    });
  });

  // ── Authorized users can still perform actions ──────────────────────────

  describe('Authorized users retain create capability', () => {
    it('W8R1-TEACHER-GC-2: teacher WITH group.create sees New Class and can submit', async () => {
      setAuth('teacher', [
        'group.create', 'group.manage', 'student.view_assigned', 'reward.view_assigned',
        'reward.create', 'reward.activate', 'reward.cancel', 'reward.approve', 'reward.release',
        'billing.view_own',
      ]);

      render(
        <MemoryRouter initialEntries={['/teacher/classes']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Your Classes');

      // New Class button MUST be present
      const btn = screen.getByRole('button', { name: /new class/i });
      expect(btn).toBeInTheDocument();

      // Click opens form
      fireEvent.click(btn);
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      // Submit invokes service
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Physics 101' } });
      fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
      await waitFor(() => expect(vi.mocked(teacherService.createClass)).toHaveBeenCalledWith('Physics 101'));
    });

    it('W8R1-EMPLOYER-GC-2: employer WITH group.create sees New Team and can submit', async () => {
      setAuth('employer', [
        'group.create', 'group.manage', 'student.view_assigned', 'reward.view_assigned',
        'reward.create', 'reward.activate', 'reward.cancel', 'reward.approve', 'reward.release',
        'billing.view_own',
      ]);

      render(
        <MemoryRouter initialEntries={['/employer/teams']}>
          <EmployerDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Your Teams');

      const btn = screen.getByRole('button', { name: /new team/i });
      expect(btn).toBeInTheDocument();

      fireEvent.click(btn);
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Beta Squad' } });
      fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
      await waitFor(() => expect(vi.mocked(employerService.createTeam)).toHaveBeenCalledWith('Beta Squad'));
    });
  });

  // ── Per-capability action matrix ────────────────────────────────────────

  describe('Per-capability reward action matrix', () => {
    it('W8R1-MATRIX-1: reward.view_assigned only — no New Reward, no action buttons for any status', async () => {
      setAuth('sponsor', ['reward.view_assigned']);

      for (const status of ['funded', 'active', 'eligible_pending_approval']) {
        vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward(status)] as any);
        const { unmount } = render(
          <MemoryRouter>
            <RewardDashboard role="sponsor" scopeId="s1" />
          </MemoryRouter>,
        );
        await waitForRewards();
        expect(screen.queryByRole('button', { name: /new reward/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
        unmount();
      }
    });

    it('W8R1-MATRIX-2: reward.create only — New Reward visible; funded reward has no Activate/Cancel', async () => {
      setAuth('sponsor', ['reward.create', 'reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="s1" />
        </MemoryRouter>,
      );
      await waitForRewards();

      expect(screen.getByRole('button', { name: /new reward/i })).toBeInTheDocument();
      // No activate or cancel — lacks those capabilities
      expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
    });

    it('W8R1-MATRIX-3: reward.activate only — Activate shown for funded; no New Reward, no Cancel', async () => {
      setAuth('sponsor', ['reward.activate', 'reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="s1" />
        </MemoryRouter>,
      );
      await waitForRewards();

      expect(screen.queryByRole('button', { name: /new reward/i })).toBeNull();
      expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
    });

    it('W8R1-MATRIX-4: reward.cancel only — Cancel shown for funded/active; no Activate, no New Reward', async () => {
      setAuth('sponsor', ['reward.cancel', 'reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="s1" />
        </MemoryRouter>,
      );
      await waitForRewards();

      expect(screen.queryByRole('button', { name: /new reward/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();
      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    });

    it('W8R1-MATRIX-5: reward.approve only — Approve shown for eligible_pending_approval', async () => {
      setAuth('sponsor', ['reward.approve', 'reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('eligible_pending_approval')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="s1" />
        </MemoryRouter>,
      );
      await waitForRewards();

      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /new reward/i })).toBeNull();
    });

    it('W8R1-MATRIX-6: reward.release only — Release shown for eligible allocation', async () => {
      setAuth('teacher', ['reward.release', 'reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('active', 'r1')] as any);
      vi.mocked(rewardService.getAllocations).mockResolvedValue([makeAllocation('eligible')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="teacher" scopeId="class1" />
        </MemoryRouter>,
      );
      await waitForRewards();

      // Expand allocations
      fireEvent.click(screen.getByRole('button', { name: /expand allocations/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: /release/i })).toBeInTheDocument());
    });

    it('W8R1-MATRIX-7: reward.refund + canRefund=true — Refund shown for released allocation', async () => {
      setAuth('sponsor', ['reward.refund', 'reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('released', 'r1')] as any);
      vi.mocked(rewardService.getAllocations).mockResolvedValue([makeAllocation('released')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="cohort1" canRefund />
        </MemoryRouter>,
      );
      await waitForRewards();

      fireEvent.click(screen.getByRole('button', { name: /expand allocations/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: /refund/i })).toBeInTheDocument());
    });

    it('W8R1-MATRIX-8: canRefund=true but no reward.refund — Refund NOT shown', async () => {
      // canRefund prop is true but user lacks reward.refund capability
      setAuth('sponsor', ['reward.view_assigned']); // no reward.refund
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('released', 'r1')] as any);
      vi.mocked(rewardService.getAllocations).mockResolvedValue([makeAllocation('released')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="cohort1" canRefund />
        </MemoryRouter>,
      );
      await waitForRewards();

      fireEvent.click(screen.getByRole('button', { name: /expand allocations/i }));
      await waitFor(() => expect(screen.queryByText('Loading rewards...')).toBeNull());

      // canRefund=true but no capability — Refund must not appear
      expect(screen.queryByRole('button', { name: /refund/i })).toBeNull();
    });
  });

  // ── Unknown/loading user ─────────────────────────────────────────────────

  describe('Unknown and loading user — fails closed', () => {
    it('W8R1-LOADING-1: null user sees no mutation controls for funded reward', async () => {
      setAuthNull();
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="s1" />
        </MemoryRouter>,
      );
      await waitForRewards();

      expect(screen.queryByRole('button', { name: /new reward/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
    });

    it('W8R1-LOADING-2: loading user sees no New Class button', async () => {
      setAuthLoading();
      vi.mocked(teacherService.getDashboard).mockResolvedValue({
        totalClasses: 1, totalStudents: 0,
        classes: [{ id: 'c1', name: 'Math', studentCount: 0 }],
      } as any);

      render(
        <MemoryRouter initialEntries={['/teacher/classes']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Your Classes');

      expect(screen.queryByRole('button', { name: /new class/i })).toBeNull();
    });
  });

  // ── Revocation scenarios ─────────────────────────────────────────────────

  describe('Capability revocation while form/action is pending', () => {
    it('W8R1-REVOKE-1: revoke reward.create while create form is open — form closes', async () => {
      // Start with reward.create
      setAuth('sponsor', ['reward.create', 'reward.view_assigned']);
      vi.mocked(rewardService.listRewards).mockResolvedValue([]);

      const { rerender } = render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="s1" />
        </MemoryRouter>,
      );
      await waitForRewards();

      // Open the create form
      fireEvent.click(screen.getByRole('button', { name: /new reward/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Revoke reward.create — simulate token refresh returning fewer permissions
      act(() => {
        setAuth('sponsor', ['reward.view_assigned']); // capability gone
      });

      // Re-render with updated auth (simulates context update propagating)
      rerender(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="s1" />
        </MemoryRouter>,
      );

      // Form must close — no unauthorized create path
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('W8R1-REVOKE-2: revoke group.create while class form is open — form closes', async () => {
      setAuth('teacher', [
        'group.create', 'group.manage', 'student.view_assigned',
        'reward.view_assigned', 'billing.view_own',
      ]);

      const { rerender } = render(
        <MemoryRouter initialEntries={['/teacher/classes']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Your Classes');

      // Open the create form
      fireEvent.click(screen.getByRole('button', { name: /new class/i }));
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      // Revoke group.create
      act(() => {
        setAuth('teacher', ['group.manage', 'student.view_assigned', 'reward.view_assigned', 'billing.view_own']);
      });

      rerender(
        <MemoryRouter initialEntries={['/teacher/classes']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );

      // Form must close
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
      // Button also gone (no longer has group.create)
      expect(screen.queryByRole('button', { name: /new class/i })).toBeNull();
    });

    it('W8R1-REVOKE-3: teacher without group.create cannot invoke createClass via direct submission', async () => {
      // Set up with group.create initially
      setAuth('teacher', [
        'group.create', 'group.manage', 'student.view_assigned', 'reward.view_assigned',
      ]);

      const { rerender } = render(
        <MemoryRouter initialEntries={['/teacher/classes']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Your Classes');

      // Open form
      fireEvent.click(screen.getByRole('button', { name: /new class/i }));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Test Class' } });

      // Revoke capability BEFORE clicking Create
      act(() => {
        setAuth('teacher', ['group.manage', 'student.view_assigned', 'reward.view_assigned']);
      });

      // Re-render with updated auth so the revocation effect sees the new state.
      rerender(
        <MemoryRouter initialEntries={['/teacher/classes']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );

      // The revocation effect closes the form — form must disappear and service not called.
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
      expect(vi.mocked(teacherService.createClass)).not.toHaveBeenCalled();
    });
  });

  // ── Compatibility: authorized users retain full access ───────────────────

  describe('Compatibility — authorized users retain controls (non-regression)', () => {
    it('W8R1-COMPAT-1: full-cap sponsor sees New Reward, Activate, Cancel for funded reward', async () => {
      setAuth('sponsor', [
        'reward.create', 'reward.activate', 'reward.cancel', 'reward.approve',
        'reward.release', 'reward.refund', 'reward.view_assigned',
        'cohort.manage', 'billing.view_own', 'impact_report.read',
      ]);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);

      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="cohort1" />
        </MemoryRouter>,
      );
      await waitForRewards();

      expect(screen.getByRole('button', { name: /new reward/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    });

    it('W8R1-COMPAT-2: canRefund=true + reward.refund: Refund appears; canRefund=false: absent', async () => {
      const allCaps = [
        'reward.create', 'reward.activate', 'reward.cancel', 'reward.approve',
        'reward.release', 'reward.refund', 'reward.view_assigned',
      ];
      setAuth('sponsor', allCaps);
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('released', 'r1')] as any);
      vi.mocked(rewardService.getAllocations).mockResolvedValue([makeAllocation('released')] as any);

      const { unmount } = render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="cohort1" canRefund />
        </MemoryRouter>,
      );
      await waitForRewards();
      fireEvent.click(screen.getByRole('button', { name: /expand allocations/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: /refund/i })).toBeInTheDocument());
      unmount();

      // Without canRefund prop — Refund must not appear even with reward.refund
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('released', 'r2')] as any);
      vi.mocked(rewardService.getAllocations).mockResolvedValue([makeAllocation('released')] as any);
      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="cohort1" canRefund={false} />
        </MemoryRouter>,
      );
      await waitForRewards();
      fireEvent.click(screen.getByRole('button', { name: /expand allocations/i }));
      // Wait for allocations to load
      await waitFor(() => expect(vi.mocked(rewardService.getAllocations)).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: /refund/i })).toBeNull();
    });

    it('W8R1-COMPAT-3: No Fund button for draft/pending_funding (W08 regression guard)', async () => {
      // W08 already removed Fund — verify it stays absent even with full caps
      setAuth('sponsor', [
        'reward.create', 'reward.fund', 'reward.activate', 'reward.cancel',
        'reward.approve', 'reward.release', 'reward.refund', 'reward.view_assigned',
      ]);
      for (const status of ['draft', 'pending_funding']) {
        vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward(status)] as any);
        const { unmount } = render(
          <MemoryRouter>
            <RewardDashboard role="sponsor" scopeId="s1" />
          </MemoryRouter>,
        );
        await waitForRewards();
        expect(screen.queryByRole('button', { name: /^fund$/i })).toBeNull();
        unmount();
      }
    });
  });
});
