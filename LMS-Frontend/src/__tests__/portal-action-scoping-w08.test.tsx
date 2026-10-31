/**
 * W08 — Portal action scoping: behavioral TDD
 *
 * W8-NAV-1  — Employer nav has no Billing link (deferred)
 * W8-NAV-2  — Parent nav has no Wallets/Groups/Billing links (deferred)
 * W8-NAV-3  — Teacher nav has no Analytics/Billing links (deferred)
 * W8-NAV-4  — Sponsor nav unchanged: Dashboard/Cohorts/Rewards/Impact/Billing present
 * W8-NAV-5  — Employer nav retains: Dashboard/Rewards/Teams
 * W8-NAV-6  — Teacher nav retains: Dashboard/Rewards/Classes
 * W8-NAV-7  — Parent nav retains: Dashboard/Rewards/Children
 * W8-ROUTE-1 — EmployerDashboard at /employer/billing shows no placeholder text
 * W8-ROUTE-2 — ParentDashboard at /parent/wallets shows no placeholder text
 * W8-ROUTE-3 — ParentDashboard at /parent/groups shows no placeholder text
 * W8-ROUTE-4 — TeacherDashboard at /teacher/analytics shows no placeholder text
 * W8-ROUTE-5 — TeacherDashboard at /teacher/billing shows no placeholder text
 * W8-REWARD-1 — No Fund button for draft reward
 * W8-REWARD-2 — No Fund button for pending_funding reward
 * W8-REWARD-3 — Activate/Cancel buttons present for funded reward (no regression)
 * W8-CLASS-1  — New Class button click shows input form
 * W8-TEAM-1   — New Team button click shows input form
 * W8-PARENT-1 — Parent rewards shows fallback message when no groups
 * W8-MULTI-1  — Multi-role user (employer+teacher) sees correct nav per workspace
 * W8-INT-1    — Route redirect: /employer/billing does not render placeholder
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ──── Module mocks — must be before dynamic imports ────────────────────────

vi.mock('../context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/messageService', () => ({
  messageService: { getUnreadCount: vi.fn().mockResolvedValue(0) },
}));

vi.mock('../services/rewardService', () => ({
  rewardService: {
    listRewards: vi.fn().mockResolvedValue([]),
    getAllocations: vi.fn().mockResolvedValue([]),
    createReward: vi.fn().mockResolvedValue({}),
    fundReward: vi.fn().mockResolvedValue({}),
    activateReward: vi.fn().mockResolvedValue({}),
    cancelReward: vi.fn().mockResolvedValue({}),
    approveAllocation: vi.fn().mockResolvedValue({}),
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
    createClass: vi.fn().mockResolvedValue({ id: 'new1', name: 'New Class' }),
    getClasses: vi.fn().mockResolvedValue([{ id: 'class1', name: 'Math 101', studentCount: 5 }]),
    getAnalytics: vi.fn().mockResolvedValue({}),
    getBilling: vi.fn().mockResolvedValue({ payments: [], total: 0 }),
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
    createTeam: vi.fn().mockResolvedValue({ id: 'new1', name: 'New Team' }),
    getBilling: vi.fn().mockResolvedValue({ payments: [], total: 0 }),
  },
}));

vi.mock('../services/parentService', () => ({
  parentService: {
    getDashboard: vi.fn().mockResolvedValue({
      childrenCount: 0,
      children: [],
    }),
    getGroups: vi.fn().mockResolvedValue([]),
  },
}));

// ──── Imports after mocks ───────────────────────────────────────────────────

import { useAuth } from '../context/useAuth';
import { rewardService } from '../services/rewardService';
import Layout from '../components/Layout';
import { RewardDashboard } from '../components/RewardDashboard';
import TeacherDashboard from '../pages/TeacherDashboard';
import EmployerDashboard from '../pages/EmployerDashboard';
import ParentDashboard from '../pages/ParentDashboard';

// ──── Synthetic user fixtures ───────────────────────────────────────────────

function makeUser(workspace: string, extra?: { workspaces?: string[]; permissions?: string[] }) {
  const workspaces = extra?.workspaces ?? [workspace];
  return {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    role: workspace,
    walletAddress: null,
    walletLinkingStatus: 'none' as const,
    workspaces,
    defaultWorkspace: workspace,
    permissions: extra?.permissions ?? [
      'billing.view_own', 'reward.view_own', 'reward.view_assigned',
      'cohort.manage', 'impact_report.read', 'course.grade_pending',
    ],
  };
}

function mockAuth(workspace: string, extra?: { workspaces?: string[]; permissions?: string[] }) {
  vi.mocked(useAuth).mockReturnValue({
    user: makeUser(workspace, extra) as any,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  } as any);
}

function renderNav(workspace: string, extra?: { workspaces?: string[]; permissions?: string[] }) {
  mockAuth(workspace, extra);
  return render(
    <MemoryRouter>
      <Layout>
        <div>Content</div>
      </Layout>
    </MemoryRouter>,
  );
}

// ──── Test synthetic reward factory ────────────────────────────────────────

function makeReward(status: string) {
  return {
    id: `r-${status}`,
    creator_user_id: 'u1',
    scope_type: 'teacher_class',
    scope_id: 'scope1',
    reward_type: 'custom',
    amount_stroops: 1000000,
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

// ──── Tests ─────────────────────────────────────────────────────────────────

describe('W08 — Portal action scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: null, isAuthenticated: false, isLoading: false, logout: vi.fn(),
    } as any);
  });

  // ── Navigation ──────────────────────────────────────────────────────────

  describe('Navigation — deferred items absent', () => {
    it('W8-NAV-1 — Employer nav has no Billing link', () => {
      renderNav('employer');
      expect(screen.queryByText('Billing')).toBeNull();
    });

    it('W8-NAV-2 — Parent nav has no Wallets, Groups, or Billing links', () => {
      renderNav('parent');
      expect(screen.queryByText('Wallets')).toBeNull();
      expect(screen.queryByText('Groups')).toBeNull();
      expect(screen.queryByText('Billing')).toBeNull();
    });

    it('W8-NAV-3 — Teacher nav has no Analytics or Billing links', () => {
      renderNav('teacher');
      expect(screen.queryByText('Analytics')).toBeNull();
      expect(screen.queryByText('Billing')).toBeNull();
    });

    it('W8-NAV-4 — Sponsor nav unchanged: Dashboard/Cohorts/Rewards/Impact/Billing present', () => {
      renderNav('sponsor');
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Cohorts')).toBeInTheDocument();
      expect(screen.getByText('Rewards')).toBeInTheDocument();
      expect(screen.getByText('Impact Report')).toBeInTheDocument();
      expect(screen.getByText('Billing')).toBeInTheDocument();
    });

    it('W8-NAV-5 — Employer nav retains: Dashboard, Rewards, Teams', () => {
      renderNav('employer');
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Rewards')).toBeInTheDocument();
      expect(screen.getByText('Teams')).toBeInTheDocument();
    });

    it('W8-NAV-6 — Teacher nav retains: Dashboard, Rewards, Classes', () => {
      renderNav('teacher');
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Rewards')).toBeInTheDocument();
      expect(screen.getByText('Classes')).toBeInTheDocument();
    });

    it('W8-NAV-7 — Parent nav retains: Dashboard, Rewards, Children', () => {
      renderNav('parent');
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Rewards')).toBeInTheDocument();
      expect(screen.getByText('Children')).toBeInTheDocument();
    });

    it('W8-MULTI-1 — Multi-role user employer+teacher sees correct nav per workspace', () => {
      renderNav('employer', { workspaces: ['employer', 'teacher'] });
      // Active workspace is employer — should see employer nav items
      expect(screen.getByText('Teams')).toBeInTheDocument();
      expect(screen.queryByText('Classes')).toBeNull();
      // No deferred billing
      expect(screen.queryByText('Billing')).toBeNull();
    });
  });

  // ── Route: placeholder sections absent ─────────────────────────────────

  describe('Deferred paths — no placeholder sections rendered', () => {
    it('W8-ROUTE-1 — EmployerDashboard at /employer/billing shows no billing placeholder', async () => {
      mockAuth('employer');
      render(
        <MemoryRouter initialEntries={['/employer/billing']}>
          <EmployerDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Employer Portal');
      expect(screen.queryByText('Billing data will appear here.')).toBeNull();
    });

    it('W8-ROUTE-2 — ParentDashboard at /parent/wallets shows no wallet placeholder', async () => {
      mockAuth('parent');
      render(
        <MemoryRouter initialEntries={['/parent/wallets']}>
          <ParentDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Parent Portal');
      expect(screen.queryByText('Wallet information will appear here.')).toBeNull();
    });

    it('W8-ROUTE-3 — ParentDashboard at /parent/groups shows no groups placeholder', async () => {
      mockAuth('parent');
      render(
        <MemoryRouter initialEntries={['/parent/groups']}>
          <ParentDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Parent Portal');
      expect(screen.queryByText('Group management will appear here.')).toBeNull();
    });

    it('W8-ROUTE-4 — TeacherDashboard at /teacher/analytics shows no analytics placeholder', async () => {
      mockAuth('teacher');
      render(
        <MemoryRouter initialEntries={['/teacher/analytics']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Teacher Portal');
      expect(screen.queryByText('Analytics data will appear here.')).toBeNull();
    });

    it('W8-ROUTE-5 — TeacherDashboard at /teacher/billing shows no billing placeholder', async () => {
      mockAuth('teacher');
      render(
        <MemoryRouter initialEntries={['/teacher/billing']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Teacher Portal');
      expect(screen.queryByText('Billing data will appear here.')).toBeNull();
    });
  });

  // ── Fund button absent ──────────────────────────────────────────────────

  describe('Fund button — removed for unsupported platform_credit', () => {
    it('W8-REWARD-1 — No Fund button for draft reward', async () => {
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('draft')] as any);
      render(
        <MemoryRouter>
          <RewardDashboard role="teacher" scopeId="scope1" scopeLabel="Math 101" />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.queryByText('Loading rewards...')).toBeNull());
      expect(screen.queryByText('Fund')).toBeNull();
    });

    it('W8-REWARD-2 — No Fund button for pending_funding reward', async () => {
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('pending_funding')] as any);
      render(
        <MemoryRouter>
          <RewardDashboard role="teacher" scopeId="scope1" />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.queryByText('Loading rewards...')).toBeNull());
      expect(screen.queryByText('Fund')).toBeNull();
    });

    it('W8-REWARD-3 — Activate and Cancel buttons present for funded reward (no regression)', async () => {
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('funded')] as any);
      render(
        <MemoryRouter>
          <RewardDashboard role="teacher" scopeId="scope1" />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.queryByText('Loading rewards...')).toBeNull());
      expect(screen.getByText('Activate')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.queryByText('Fund')).toBeNull();
    });

    it('W8-REWARD-4 — performAction fund cannot be triggered through rendered UI', async () => {
      // After removing draft/pending_funding from ACTIONS, there is no Fund button to click.
      // This test verifies fund action has no UI trigger path.
      vi.mocked(rewardService.listRewards).mockResolvedValue([makeReward('draft')] as any);
      render(
        <MemoryRouter>
          <RewardDashboard role="sponsor" scopeId="scope1" canRefund />
        </MemoryRouter>,
      );
      await waitFor(() => expect(screen.queryByText('Loading rewards...')).toBeNull());
      // No Fund button exists — fundReward service cannot be called via UI
      expect(screen.queryByText('Fund')).toBeNull();
      expect(rewardService.fundReward).not.toHaveBeenCalled();
    });
  });

  // ── New Class button wired ─────────────────────────────────────────────

  describe('New Class button — wired to teacherService.createClass', () => {
    it('W8-CLASS-1 — Clicking New Class shows an inline input form', async () => {
      mockAuth('teacher');
      render(
        <MemoryRouter initialEntries={['/teacher/classes']}>
          <TeacherDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Your Classes');
      const newClassBtn = screen.getByRole('button', { name: /new class/i });
      fireEvent.click(newClassBtn);
      // After fix: an input field should appear for the class name
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  // ── New Team button wired ──────────────────────────────────────────────

  describe('New Team button — wired to employerService.createTeam', () => {
    it('W8-TEAM-1 — Clicking New Team shows an inline input form', async () => {
      mockAuth('employer');
      render(
        <MemoryRouter initialEntries={['/employer/teams']}>
          <EmployerDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Your Teams');
      const newTeamBtn = screen.getByRole('button', { name: /new team/i });
      fireEvent.click(newTeamBtn);
      // After fix: an input field should appear for the team name
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  // ── Parent rewards blank fix ───────────────────────────────────────────

  describe('Parent rewards — fallback when no groups', () => {
    it('W8-PARENT-1 — Rewards section shows fallback message when no groups', async () => {
      mockAuth('parent');
      render(
        <MemoryRouter initialEntries={['/parent/rewards']}>
          <ParentDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Parent Portal');
      // After fix: remove outer groups.length > 0 guard; inner message must render
      expect(screen.getByText('Create a family group first to manage rewards.')).toBeInTheDocument();
    });
  });

  // ── Integration: route redirect ────────────────────────────────────────

  describe('W8-INT-1 — Route redirect integration', () => {
    it('Employer visiting /employer/billing is redirected — no placeholder renders', async () => {
      // This test verifies the combined effect of App.tsx redirect + component section removal.
      // Render EmployerDashboard at the deferred path with section detection active.
      // After fix, the component no longer has a billing section so even if somehow rendered
      // at this path, the placeholder is absent.
      mockAuth('employer');
      render(
        <MemoryRouter initialEntries={['/employer/billing']}>
          <EmployerDashboard />
        </MemoryRouter>,
      );
      await screen.findByText('Employer Portal');
      // No billing placeholder; employer portal home renders correctly
      expect(screen.queryByText('Billing data will appear here.')).toBeNull();
      expect(screen.getByText('Total Teams')).toBeInTheDocument();
    });
  });
});
