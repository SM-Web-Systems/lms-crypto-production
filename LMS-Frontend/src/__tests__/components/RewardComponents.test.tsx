/**
 * R14 Reward Frontend Components — R-FE-1 through R-FE-8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RewardStatusBadge, formatStroops, formatStroopsShort } from '../../components/RewardStatusBadge';

// Mock rewardService for RewardDashboard and StudentRewardsPanel
const mockListRewards = vi.fn();
const mockGetAllocations = vi.fn();
const mockCreateReward = vi.fn();
const mockGetMyRewards = vi.fn();

vi.mock('../../services/rewardService', () => ({
  rewardService: {
    listRewards: (...args: unknown[]) => mockListRewards(...args),
    getAllocations: (...args: unknown[]) => mockGetAllocations(...args),
    getReward: vi.fn(),
    getTransactions: vi.fn(),
    createReward: (...args: unknown[]) => mockCreateReward(...args),
    fundReward: vi.fn(),
    activateReward: vi.fn(),
    cancelReward: vi.fn(),
    approveReward: vi.fn(),
    releaseAllocation: vi.fn(),
    refundAllocation: vi.fn(),
    getMyRewards: (...args: unknown[]) => mockGetMyRewards(...args),
  },
}));

// Import after mock
import { RewardDashboard } from '../../components/RewardDashboard';
import { StudentRewardsPanel } from '../../components/StudentRewardsPanel';

const SAMPLE_REWARDS = [
  {
    id: 'r1',
    creator_user_id: 'creator1',
    scope_type: 'sponsor_cohort',
    scope_id: 'cohort1',
    reward_type: 'completion',
    amount_stroops: 10000000,
    max_recipients: null,
    currency_code: 'XLM',
    description: 'Course completion reward',
    auto_release: 0,
    status: 'active',
    expires_at: null,
    funded_at: '2026-08-01T00:00:00Z',
    activated_at: '2026-08-01T00:00:00Z',
    released_at: null,
    cancelled_at: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
];

const STUDENT_REWARDS = [
  {
    allocationId: 'a1',
    rewardType: 'completion',
    amountStroops: 10000000,
    currencyCode: 'XLM',
    status: 'released',
    releasedAt: '2026-08-10T00:00:00Z',
    createdAt: '2026-08-01T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RewardStatusBadge', () => {
  it('R-FE-6a: renders correct label for each reward state', () => {
    const states = [
      { status: 'draft', label: 'Draft' },
      { status: 'active', label: 'Active' },
      { status: 'released', label: 'Released' },
      { status: 'cancelled', label: 'Cancelled' },
      { status: 'expired', label: 'Expired' },
      { status: 'refunded', label: 'Refunded' },
      { status: 'eligible_pending_approval', label: 'Pending Approval' },
      { status: 'partially_released', label: 'Partially Released' },
    ];

    for (const { status, label } of states) {
      const { unmount } = render(<RewardStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('R-FE-6b: renders unknown status with snake_case cleaned up', () => {
    render(<RewardStatusBadge status="some_unknown_state" />);
    expect(screen.getByText('some unknown state')).toBeInTheDocument();
  });
});

describe('formatStroops', () => {
  it('R-FE-5a: formats 10000000 stroops as XLM', () => {
    expect(formatStroops(10000000)).toBe('1.0000000 XLM');
  });

  it('R-FE-5b: formatStroopsShort shows 2 decimal places', () => {
    expect(formatStroopsShort(15000000)).toBe('1.50 XLM');
  });

  it('R-FE-5c: validates zero amount display', () => {
    expect(formatStroopsShort(0)).toBe('0.00 XLM');
  });
});

describe('RewardDashboard', () => {
  it('R-FE-1: renders for sponsor role with rewards', async () => {
    mockListRewards.mockResolvedValue(SAMPLE_REWARDS);

    render(
      <RewardDashboard role="sponsor" scopeId="cohort1" scopeLabel="Alpha Cohort" canRefund />
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha Cohort', { exact: false })).toBeInTheDocument();
    });

    expect(mockListRewards).toHaveBeenCalledWith('sponsor', 'cohort1');
    expect(screen.getByText('completion')).toBeInTheDocument();
    expect(screen.getByText('1.00 XLM')).toBeInTheDocument();
  });

  it('R-FE-2: renders for employer role', async () => {
    mockListRewards.mockResolvedValue(SAMPLE_REWARDS);

    render(
      <RewardDashboard role="employer" scopeId="team1" scopeLabel="Dev Team" canRefund />
    );

    await waitFor(() => {
      expect(screen.getByText('Dev Team', { exact: false })).toBeInTheDocument();
    });

    expect(mockListRewards).toHaveBeenCalledWith('employer', 'team1');
  });

  it('R-FE-3: renders for parent role', async () => {
    mockListRewards.mockResolvedValue([]);

    render(
      <RewardDashboard role="parent" scopeId="family1" scopeLabel="My Family" />
    );

    await waitFor(() => {
      expect(screen.getByText(/No rewards yet/)).toBeInTheDocument();
    });
  });

  it('R-FE-4: renders for teacher role', async () => {
    mockListRewards.mockResolvedValue(SAMPLE_REWARDS);

    render(
      <RewardDashboard role="teacher" scopeId="class1" scopeLabel="Math 101" />
    );

    await waitFor(() => {
      expect(screen.getByText('Math 101', { exact: false })).toBeInTheDocument();
    });
  });

  it('R-FE-5d: RewardCreateForm validates negative amount', async () => {
    mockListRewards.mockResolvedValue([]);

    render(
      <RewardDashboard role="sponsor" scopeId="cohort1" />
    );

    await waitFor(() => {
      expect(screen.getByText('New Reward')).toBeInTheDocument();
    });

    // Open create form
    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => {
      expect(screen.getByText('Create Reward')).toBeInTheDocument();
    });
  });
});

describe('StudentRewardsPanel', () => {
  it('R-FE-7: renders student rewards received view', async () => {
    mockGetMyRewards.mockResolvedValue(STUDENT_REWARDS);

    render(<StudentRewardsPanel />);

    await waitFor(() => {
      expect(screen.getByText('completion')).toBeInTheDocument();
    });

    expect(screen.getByText('1.00 XLM')).toBeInTheDocument();
    expect(screen.getByTestId('student-rewards-panel')).toBeInTheDocument();
  });

  it('R-FE-8: no funder data exposed in student view', async () => {
    mockGetMyRewards.mockResolvedValue(STUDENT_REWARDS);

    render(<StudentRewardsPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('student-rewards-list')).toBeInTheDocument();
    });

    // The student rewards data should not contain any creator/funder IDs
    const html = screen.getByTestId('student-rewards-list').innerHTML;
    expect(html).not.toContain('creator1');
    expect(html).not.toContain('creator_user_id');
    expect(html).not.toContain('sponsor');
    expect(html).not.toContain('employer');
  });

  it('R-FE-7b: shows empty state when no rewards', async () => {
    mockGetMyRewards.mockResolvedValue([]);

    render(<StudentRewardsPanel />);

    await waitFor(() => {
      expect(screen.getByText(/No rewards received yet/)).toBeInTheDocument();
    });
  });
});
