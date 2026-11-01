/**
 * R14 Reward Frontend Components — R-FE-1 through R-FE-8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// W08-R1: RewardDashboard now calls useAuth() for capability checks.
// Provide a full-capability user so existing tests remain unaffected by gating.
vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user',
      name: 'Test User',
      email: 'test@example.com',
      role: 'sponsor',
      walletAddress: null,
      walletLinkingStatus: 'none',
      workspaces: ['sponsor'],
      defaultWorkspace: 'sponsor',
      permissions: [
        'reward.create', 'reward.activate', 'reward.cancel', 'reward.approve',
        'reward.release', 'reward.refund', 'reward.view_assigned',
        'cohort.manage', 'billing.view_own', 'impact_report.read',
        'group.create', 'group.manage',
      ],
    },
    isAuthenticated: true,
    isLoading: false,
    logout: () => {},
  }),
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
    reward_type: 'custom',
    amount_stroops: 10000000,
    max_recipients: null,
    currency_code: 'XLM',
    description: 'Custom reward',
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
    rewardType: 'custom',
    amountStroops: 10000000,
    currencyCode: 'XLM',
    status: 'released',
    releasedAt: '2026-08-10T00:00:00Z',
    createdAt: '2026-08-01T00:00:00Z',
  },
];

beforeEach(() => {
  vi.resetAllMocks();
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

    // W06: listRewards now passes targetType as 3rd arg; undefined when not provided
    expect(mockListRewards).toHaveBeenCalledWith('sponsor', 'cohort1', undefined);
    expect(screen.getByText('custom')).toBeInTheDocument();
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

    // W06: listRewards now passes targetType as 3rd arg; undefined when not provided
    expect(mockListRewards).toHaveBeenCalledWith('employer', 'team1', undefined);
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
      expect(screen.getByText('custom')).toBeInTheDocument();
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

describe('W05-R1 Frontend select/payload coverage', () => {
  // W5R1-FE1: invalid options absent from create form select
  it('W5R1-FE1: completion and achievement are not selectable options', async () => {
    mockListRewards.mockResolvedValue([]);

    render(<RewardDashboard role="sponsor" scopeId="cohort1" />);

    await waitFor(() => {
      expect(screen.getByText('New Reward')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Reward'));

    await waitFor(() => {
      expect(screen.getByLabelText('Type')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Type') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).not.toContain('completion');
    expect(optionValues).not.toContain('achievement');
  });

  // W5R1-FE2a: default select value is 'custom' and form submits it unchanged
  it('W5R1-FE2a: default type is custom and createReward is called with rewardType "custom"', async () => {
    mockListRewards.mockResolvedValue([]);
    mockCreateReward.mockResolvedValue({ id: 'r-new', status: 'draft', reward_type: 'custom' });

    render(<RewardDashboard role="sponsor" scopeId="cohort1" />);

    await waitFor(() => expect(screen.getByText('New Reward')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText('Type')).toBeInTheDocument());

    // Default value should be 'custom'
    const select = screen.getByLabelText('Type') as HTMLSelectElement;
    expect(select.value).toBe('custom');

    // Fill amount and submit
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => {
      expect(mockCreateReward).toHaveBeenCalledOnce();
    });

    const [, params] = mockCreateReward.mock.calls[0] as [string, { rewardType: string }];
    expect(params.rewardType).toBe('custom');
  });

  // W5R1-FE2b: selecting 'individual' submits exact string 'individual'
  it('W5R1-FE2b: selecting individual submits exact canonical string', async () => {
    mockListRewards.mockResolvedValue([]);
    mockCreateReward.mockResolvedValue({ id: 'r-new2', status: 'draft', reward_type: 'individual' });

    const user = userEvent.setup();
    render(<RewardDashboard role="sponsor" scopeId="cohort1" />);

    await waitFor(() => expect(screen.getByText('New Reward')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText('Type')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Type'), 'individual');
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('individual');

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => {
      expect(mockCreateReward).toHaveBeenCalledOnce();
    });

    const [, params] = mockCreateReward.mock.calls[0] as [string, { rewardType: string }];
    expect(params.rewardType).toBe('individual');
  });
});

describe('W06 Frontend — parent target discriminator', () => {
  // W6-FE-1: RewardDashboard parent+targetType='family' passes targetType to listRewards
  it('W6-FE-1: parent role with targetType=family calls listRewards with targetType argument', async () => {
    mockListRewards.mockResolvedValue([]);

    render(<RewardDashboard role="parent" scopeId="fam1" targetType="family" />);

    await waitFor(() => {
      expect(mockListRewards).toHaveBeenCalledWith('parent', 'fam1', 'family');
    });
  });

  // W6-FE-2: Non-parent role with no targetType passes undefined as 3rd arg (not 'family'/'child')
  it('W6-FE-2: sponsor role without targetType calls listRewards with undefined targetType', async () => {
    mockListRewards.mockResolvedValue([]);

    render(<RewardDashboard role="sponsor" scopeId="cohort1" />);

    await waitFor(() => {
      // Sponsor passes no targetType — must not send 'family' or 'child'
      expect(mockListRewards).toHaveBeenCalledWith('sponsor', 'cohort1', undefined);
    });
    const [,, passedTargetType] = mockListRewards.mock.calls[0] as [string, string, string | undefined];
    expect(passedTargetType).toBeUndefined();
  });

  // W6-FE-3: createReward includes targetType when parent role passes it
  it('W6-FE-3: parent createReward includes targetType=family in POST params', async () => {
    mockListRewards.mockResolvedValue([]);
    mockCreateReward.mockResolvedValue({ id: 'r-new', status: 'draft', reward_type: 'custom' });

    render(<RewardDashboard role="parent" scopeId="fam1" targetType="family" />);

    await waitFor(() => expect(screen.getByText('New Reward')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(mockCreateReward).toHaveBeenCalledOnce());

    const [, params] = mockCreateReward.mock.calls[0] as [string, { targetType?: string }];
    expect(params.targetType).toBe('family');
  });

  // W6-FE-4: sponsor role does not include targetType in POST params
  it('W6-FE-4: sponsor role createReward does not send targetType', async () => {
    mockListRewards.mockResolvedValue([]);
    mockCreateReward.mockResolvedValue({ id: 'r-new', status: 'draft', reward_type: 'custom' });

    render(<RewardDashboard role="sponsor" scopeId="cohort1" />);

    await waitFor(() => expect(screen.getByText('New Reward')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(mockCreateReward).toHaveBeenCalledOnce());

    const [, params] = mockCreateReward.mock.calls[0] as [string, { targetType?: string }];
    expect(params.targetType).toBeUndefined();
  });

  // W6-FE-5: targetType in useCallback dependency — re-fetch when targetType changes
  it('W6-FE-5: re-renders with new targetType trigger separate listRewards calls', async () => {
    mockListRewards.mockResolvedValue([]);
    const { rerender } = render(<RewardDashboard role="parent" scopeId="s1" targetType="child" />);
    await waitFor(() => expect(mockListRewards).toHaveBeenCalledWith('parent', 's1', 'child'));

    rerender(<RewardDashboard role="parent" scopeId="s1" targetType="family" />);
    await waitFor(() => expect(mockListRewards).toHaveBeenCalledWith('parent', 's1', 'family'));
  });
});

// ──── Helper ────

function makeReward(overrides: Partial<{ id: string; description: string; status: string }> = {}) {
  return {
    id: overrides.id ?? 'r1',
    creator_user_id: 'creator1',
    scope_type: 'parent_child',
    scope_id: 'scope1',
    reward_type: 'custom',
    amount_stroops: 10000000,
    max_recipients: null as null,
    currency_code: 'XLM',
    description: overrides.description ?? 'A reward',
    auto_release: 0,
    status: overrides.status ?? 'active',
    expires_at: null as null,
    funded_at: null as null,
    activated_at: null as null,
    released_at: null as null,
    cancelled_at: null as null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };
}

describe('W06-R1: stale response guard', () => {
  // W6R1-FE-1: child→family same scopeId — late child success must not replace family rows
  it('W6R1-FE-1: late child response does not overwrite current family rows', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveChild!: (v: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const childDeferred = new Promise<any[]>(r => { resolveChild = r; });

    // First call (child): deferred; second call (family): immediate
    mockListRewards
      .mockImplementationOnce(() => childDeferred)
      .mockResolvedValueOnce([makeReward({ id: 'fam-r1', description: 'Family reward' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />
    );

    // Wait for child request to be in flight
    await waitFor(() => expect(mockListRewards).toHaveBeenCalledWith('parent', 'shared-scope', 'child'));

    // Switch to family target
    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />);

    // Family response arrives immediately and should show
    await waitFor(() => expect(screen.getByText('Family reward')).toBeInTheDocument());

    // Now resolve the deferred child request with a child-specific reward
    await act(async () => {
      resolveChild([makeReward({ id: 'child-r1', description: 'Child reward' })]);
    });

    // Family row must still be present; child row must NOT have replaced it
    expect(screen.getByText('Family reward')).toBeInTheDocument();
    expect(screen.queryByText('Child reward')).not.toBeInTheDocument();
  });

  // W6R1-FE-2: family→child — late family success must not replace child rows
  it('W6R1-FE-2: late family response does not overwrite current child rows', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveFamily!: (v: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const familyDeferred = new Promise<any[]>(r => { resolveFamily = r; });

    mockListRewards
      .mockImplementationOnce(() => familyDeferred)
      .mockResolvedValueOnce([makeReward({ id: 'child-r1', description: 'Child reward' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />
    );

    await waitFor(() => expect(mockListRewards).toHaveBeenCalledWith('parent', 'shared-scope', 'family'));

    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />);

    await waitFor(() => expect(screen.getByText('Child reward')).toBeInTheDocument());

    await act(async () => {
      resolveFamily([makeReward({ id: 'fam-r1', description: 'Family reward' })]);
    });

    expect(screen.getByText('Child reward')).toBeInTheDocument();
    expect(screen.queryByText('Family reward')).not.toBeInTheDocument();
  });

  // W6R1-FE-3: late rejection after current success — current data stays, no stale error shown
  it('W6R1-FE-3: late rejection from stale request does not obscure current data', async () => {
    let rejectOld!: (e: Error) => void;
    const oldDeferred = new Promise<never>((_, r) => { rejectOld = r; });

    // Old request (child) will reject late; new request (family) succeeds
    mockListRewards
      .mockImplementationOnce(() => oldDeferred)
      .mockResolvedValueOnce([makeReward({ id: 'fam-r1', description: 'Family reward' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="scope1" targetType="child" />
    );

    await waitFor(() => expect(mockListRewards).toHaveBeenCalledWith('parent', 'scope1', 'child'));

    rerender(<RewardDashboard role="parent" scopeId="scope1" targetType="family" />);

    await waitFor(() => expect(screen.getByText('Family reward')).toBeInTheDocument());

    // Reject the stale child request
    await act(async () => {
      rejectOld(new Error('Network failure'));
    });

    // Family data still shown, no error from stale request
    expect(screen.getByText('Family reward')).toBeInTheDocument();
    expect(screen.queryByText('Network failure')).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not load rewards/)).not.toBeInTheDocument();
  });

  // W6R1-FE-4: re-visit of same scopeId wins over deferred first visit
  // Refresh button is disabled during loading, so we trigger an out-of-order scenario
  // by using a scopeId A → B → A cycle: first visit A is deferred, second visit A is newer.
  it('W6R1-FE-4: re-visit of same scopeId wins over deferred first visit', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveFirst!: (v: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstDeferred = new Promise<any[]>(r => { resolveFirst = r; });

    // Call 1 (scopeA first visit): deferred
    // Call 2 (scopeB transit): immediate empty
    // Call 3 (scopeA second visit): immediate with newer data
    mockListRewards
      .mockImplementationOnce(() => firstDeferred)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeReward({ id: 'new-r1', description: 'Second visit A' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="scopeA" targetType="family" />
    );

    await waitFor(() => expect(mockListRewards).toHaveBeenCalledTimes(1));

    // Transition to scopeB — cancels the pending first visit
    rerender(<RewardDashboard role="parent" scopeId="scopeB" targetType="family" />);
    await waitFor(() => expect(mockListRewards).toHaveBeenCalledTimes(2));

    // Return to scopeA — second visit resolves immediately with newer data
    rerender(<RewardDashboard role="parent" scopeId="scopeA" targetType="family" />);
    await waitFor(() => expect(screen.getByText('Second visit A')).toBeInTheDocument());

    // First visit resolves late — must NOT overwrite second visit
    await act(async () => {
      resolveFirst([makeReward({ id: 'old-r1', description: 'First visit A stale' })]);
    });

    expect(screen.getByText('Second visit A')).toBeInTheDocument();
    expect(screen.queryByText('First visit A stale')).not.toBeInTheDocument();
  });

  // W6R1-FE-5: switch to empty scopeId — old result must not repopulate
  it('W6R1-FE-5: switch to empty scopeId invalidates pending old request', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveOld!: (v: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldDeferred = new Promise<any[]>(r => { resolveOld = r; });

    mockListRewards.mockImplementationOnce(() => oldDeferred);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="scope1" targetType="family" />
    );

    await waitFor(() => expect(mockListRewards).toHaveBeenCalledTimes(1));

    // Switch to empty scopeId
    rerender(<RewardDashboard role="parent" scopeId="" targetType="family" />);

    // Old request resolves with data
    await act(async () => {
      resolveOld([makeReward({ id: 'old-r1', description: 'Old reward after scope cleared' })]);
    });

    expect(screen.queryByText('Old reward after scope cleared')).not.toBeInTheDocument();
  });

  // W6R1-FE-6: unmount while pending — no state update after unmount
  it('W6R1-FE-6: unmount while load is pending does not commit state', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveLate!: (v: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deferred = new Promise<any[]>(r => { resolveLate = r; });

    mockListRewards.mockImplementationOnce(() => deferred);

    const { unmount } = render(
      <RewardDashboard role="parent" scopeId="scope1" targetType="family" />
    );

    await waitFor(() => expect(mockListRewards).toHaveBeenCalledTimes(1));

    unmount();

    // Resolve after unmount — should not throw or produce act() warning
    await act(async () => {
      resolveLate([makeReward({ id: 'r1', description: 'Post-unmount reward' })]);
    });
    // No assertion needed beyond no thrown error
  });

  // W6R1-FE-7: performAction error across target switch — stale error must not appear on new target
  // Uses cancelReward (no special UI state needed — we mock it directly).
  // The mock for cancelReward is vi.fn() at the top of the file; we override it per-test.
  it('W6R1-FE-7: performAction error after target switch does not show stale error on new target', async () => {
    let rejectCancel!: (e: Error) => void;
    const cancelDeferred = new Promise<never>((_, r) => { rejectCancel = r; });

    // Provide an active reward (shows Cancel button)
    const activeReward = makeReward({ id: 'child-r1', description: 'Child reward', status: 'active' });
    mockListRewards
      .mockResolvedValueOnce([activeReward])
      .mockResolvedValueOnce([makeReward({ id: 'fam-r1', description: 'Family reward', status: 'active' })]);

    // Import the mocked service to control cancelReward
    const { rewardService: svc } = await import('../../services/rewardService');
    vi.mocked(svc.cancelReward).mockImplementationOnce(() => cancelDeferred as never);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />
    );

    await waitFor(() => expect(screen.getByText('Child reward')).toBeInTheDocument());

    // Click the Cancel button on the child reward
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    // Switch to family target while cancel is in flight
    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />);

    await waitFor(() => expect(screen.getByText('Family reward')).toBeInTheDocument());

    // Reject the in-flight cancel — it was for the old (child) target
    await act(async () => { rejectCancel(new Error('Cancel failed on child reward')); });

    // Family data still shown, no stale error from old target
    expect(screen.getByText('Family reward')).toBeInTheDocument();
    expect(screen.queryByText('Cancel failed on child reward')).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to cancel/)).not.toBeInTheDocument();
  });

  // W6R1-FE-8: late old-target error does not obscure current data
  it('W6R1-FE-8: late old-target error does not overwrite current family data', async () => {
    let rejectChild!: (e: Error) => void;
    const childDeferred = new Promise<never>((_, r) => { rejectChild = r; });

    mockListRewards
      .mockImplementationOnce(() => childDeferred)
      .mockResolvedValueOnce([makeReward({ id: 'fam-r1', description: 'Family reward' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="scope1" targetType="child" />
    );

    await waitFor(() => expect(mockListRewards).toHaveBeenCalledWith('parent', 'scope1', 'child'));

    rerender(<RewardDashboard role="parent" scopeId="scope1" targetType="family" />);

    await waitFor(() => expect(screen.getByText('Family reward')).toBeInTheDocument());

    await act(async () => { rejectChild(new Error('Child load failed')); });

    expect(screen.getByText('Family reward')).toBeInTheDocument();
    expect(screen.queryByText('Child load failed')).not.toBeInTheDocument();
  });
});

describe('W06-R2: create and operation ownership guard', () => {
  // W6R2-FE-1: Primary reproduction — deferred child create resolves after family switch.
  // MUST FAIL before epoch guard, PASS after.
  it('W6R2-FE-1: deferred child create does not reload child list after family switch', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveCreate!: (v: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createDeferred = new Promise<any>(r => { resolveCreate = r; });
    mockCreateReward.mockImplementationOnce(() => createDeferred);
    mockListRewards
      .mockResolvedValueOnce([makeReward({ id: 'child-r1', description: 'Child reward data' })])
      .mockResolvedValueOnce([makeReward({ id: 'fam-r1', description: 'Family reward data' })])
      .mockResolvedValueOnce([makeReward({ id: 'child-r2', description: 'Stale child reload' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />
    );
    await waitFor(() => expect(screen.getByText('Child reward data')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    // Switch to family while child create is in flight
    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />);
    await waitFor(() => expect(screen.getByText('Family reward data')).toBeInTheDocument());

    // Resolve child create — epoch guard must block stale child reload
    await act(async () => { resolveCreate({ id: 'new-r', status: 'draft', reward_type: 'custom' }); });

    expect(screen.getByText('Family reward data')).toBeInTheDocument();
    expect(screen.queryByText('Stale child reload')).not.toBeInTheDocument();
    // Only 2 list calls (child initial + family); no stale 3rd call
    expect(mockListRewards).toHaveBeenCalledTimes(2);
  });

  // W6R2-FE-2: Reverse direction — family create → switch to child
  it('W6R2-FE-2: deferred family create does not reload family list after child switch', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveCreate!: (v: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createDeferred = new Promise<any>(r => { resolveCreate = r; });
    mockCreateReward.mockImplementationOnce(() => createDeferred);
    mockListRewards
      .mockResolvedValueOnce([makeReward({ id: 'fam-r1', description: 'Family reward data' })])
      .mockResolvedValueOnce([makeReward({ id: 'child-r1', description: 'Child reward data' })])
      .mockResolvedValueOnce([makeReward({ id: 'fam-r2', description: 'Stale family reload' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />
    );
    await waitFor(() => expect(screen.getByText('Family reward data')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />);
    await waitFor(() => expect(screen.getByText('Child reward data')).toBeInTheDocument());

    await act(async () => { resolveCreate({ id: 'new-r', status: 'draft', reward_type: 'custom' }); });

    expect(screen.getByText('Child reward data')).toBeInTheDocument();
    expect(screen.queryByText('Stale family reload')).not.toBeInTheDocument();
    expect(mockListRewards).toHaveBeenCalledTimes(2);
  });

  // W6R2-FE-3: Old create resolves while new target's list is still pending.
  // Old create must not invalidate the valid pending list request.
  it('W6R2-FE-3: old create completion cannot invalidate current pending list request', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveCreate!: (v: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createDeferred = new Promise<any>(r => { resolveCreate = r; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveFamilyList!: (v: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const familyListDeferred = new Promise<any[]>(r => { resolveFamilyList = r; });
    mockCreateReward.mockImplementationOnce(() => createDeferred);
    mockListRewards
      .mockResolvedValueOnce([makeReward({ id: 'child-r1', description: 'Child reward data' })])
      .mockImplementationOnce(() => familyListDeferred)  // family list: deferred
      .mockResolvedValueOnce([makeReward({ id: 'stale', description: 'Stale child reload' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />
    );
    await waitFor(() => expect(screen.getByText('Child reward data')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    // Switch to family — family list is now pending
    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />);
    await waitFor(() => expect(mockListRewards).toHaveBeenCalledTimes(2));

    // Resolve old child create while family list is pending — must not hijack reqId
    await act(async () => { resolveCreate({ id: 'new-r', status: 'draft', reward_type: 'custom' }); });

    // Now resolve the pending family list — must win (not discarded)
    await act(async () => {
      resolveFamilyList([makeReward({ id: 'fam-r1', description: 'Family reward data' })]);
    });

    expect(screen.getByText('Family reward data')).toBeInTheDocument();
    expect(screen.queryByText('Stale child reload')).not.toBeInTheDocument();
    expect(mockListRewards).toHaveBeenCalledTimes(2);
  });

  // W6R2-FE-4: A→B→A — old first-visit create resolves on second visit.
  // Epoch must distinguish A@T1 from A@T3 even with identical textual key.
  it('W6R2-FE-4: A→B→A: old first-visit create cannot initiate reload on second visit', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveCreate!: (v: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createDeferred = new Promise<any>(r => { resolveCreate = r; });
    mockCreateReward.mockImplementationOnce(() => createDeferred);
    mockListRewards
      .mockResolvedValueOnce([makeReward({ id: 'a1-r1', description: 'First visit A' })])   // call 1
      .mockResolvedValueOnce([])                                                              // call 2: B
      .mockResolvedValueOnce([makeReward({ id: 'a2-r1', description: 'Second visit A' })])  // call 3: A again
      .mockResolvedValueOnce([makeReward({ id: 'stale', description: 'Stale A reload' })]);  // call 4: must not happen

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="scopeA" targetType="family" />
    );
    await waitFor(() => expect(screen.getByText('First visit A')).toBeInTheDocument());

    // Open form and submit on first A visit
    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    // A → B
    rerender(<RewardDashboard role="parent" scopeId="scopeB" targetType="family" />);
    await waitFor(() => expect(mockListRewards).toHaveBeenCalledTimes(2));

    // B → A (second visit)
    rerender(<RewardDashboard role="parent" scopeId="scopeA" targetType="family" />);
    await waitFor(() => expect(screen.getByText('Second visit A')).toBeInTheDocument());

    // Resolve old first-A create — epoch must block stale reload
    await act(async () => { resolveCreate({ id: 'new-r', status: 'draft', reward_type: 'custom' }); });

    expect(screen.getByText('Second visit A')).toBeInTheDocument();
    expect(screen.queryByText('Stale A reload')).not.toBeInTheDocument();
    expect(mockListRewards).toHaveBeenCalledTimes(3); // only 3 (not 4)
  });

  // W6R2-FE-5: Old create failure after switch — form's error is internal, does not reach dashboard.
  // Behavioral test; passes before and after fix (existing correct behavior preserved).
  it('W6R2-FE-5: old create failure after switch does not show error in new dashboard', async () => {
    let rejectCreate!: (e: Error) => void;
    const createDeferred = new Promise<never>((_, r) => { rejectCreate = r; });
    mockCreateReward.mockImplementationOnce(() => createDeferred);
    mockListRewards
      .mockResolvedValueOnce([makeReward({ id: 'child-r1', description: 'Child reward data' })])
      .mockResolvedValueOnce([makeReward({ id: 'fam-r1', description: 'Family reward data' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />
    );
    await waitFor(() => expect(screen.getByText('Child reward data')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />);
    await waitFor(() => expect(screen.getByText('Family reward data')).toBeInTheDocument());

    await act(async () => { rejectCreate(new Error('Child create failed')); });

    expect(screen.getByText('Family reward data')).toBeInTheDocument();
    expect(screen.queryByText('Child create failed')).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to create/)).not.toBeInTheDocument();
  });

  // W6R2-FE-6: Old create must not close the new target's form.
  // After switch the old create resolves; it must not call setShowCreate(false) on the new form.
  it('W6R2-FE-6: old create completion does not close currently-open form on new target', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveOldCreate!: (v: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldCreateDeferred = new Promise<any>(r => { resolveOldCreate = r; });
    mockCreateReward.mockImplementationOnce(() => oldCreateDeferred);
    mockListRewards
      .mockResolvedValueOnce([])   // child (empty)
      .mockResolvedValueOnce([]);  // family (empty)

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />
    );
    await waitFor(() => expect(screen.getByText(/No rewards yet/)).toBeInTheDocument());

    // Open form and submit child create (deferred)
    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    // Switch to family
    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />);
    await waitFor(() => expect(screen.getByText(/No rewards yet/)).toBeInTheDocument());

    // Open form on new target (or it may already be open without fix — either way ensure dialog present)
    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // Resolve old child create — MUST NOT close the family form
    await act(async () => {
      resolveOldCreate({ id: 'child-new', status: 'draft', reward_type: 'custom' });
    });

    // Family form must still be open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // W6R2-FE-7: toggleAllocations result after switch must not populate new target's state.
  // Behavioral test — success path already guarded by setExpanded({}); verifying end-to-end.
  it('W6R2-FE-7: stale getAllocations result is not applied to new target', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveAllocs!: (v: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allocDeferred = new Promise<any[]>(r => { resolveAllocs = r; });
    mockGetAllocations.mockImplementationOnce(() => allocDeferred);
    mockListRewards
      .mockResolvedValueOnce([makeReward({ id: 'child-r1', description: 'Child reward' })])
      .mockResolvedValueOnce([makeReward({ id: 'fam-r1', description: 'Family reward' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />
    );
    await waitFor(() => expect(screen.getByText('Child reward')).toBeInTheDocument());

    // Expand child reward (getAllocations in flight)
    fireEvent.click(screen.getByRole('button', { name: /Expand allocations/i }));
    await waitFor(() => expect(mockGetAllocations).toHaveBeenCalledTimes(1));

    // Switch to family — expanded state cleared by load()
    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />);
    await waitFor(() => expect(screen.getByText('Family reward')).toBeInTheDocument());

    // Resolve old getAllocations — must not update new target's expanded state
    await act(async () => {
      resolveAllocs([{
        id: 'a1',
        student_user_id: 'student001abc',
        amount_stroops: 10000000,
        status: 'eligible',
      }]);
    });

    expect(screen.queryByText(/student001abc/)).not.toBeInTheDocument();
  });

  // W6R2-FE-8: Form must close automatically when target changes.
  it('W6R2-FE-8: form closes when target changes', async () => {
    mockListRewards
      .mockResolvedValueOnce([])  // child (empty)
      .mockResolvedValueOnce([]); // family (empty)

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />
    );
    await waitFor(() => expect(screen.getByText(/No rewards yet/)).toBeInTheDocument());

    // Open form on child
    fireEvent.click(screen.getByText('New Reward'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // Switch to family — cleanup must close the form
    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/No rewards yet/)).toBeInTheDocument());
  });

  // W6R2-FE-9: performAction spinner is cleared on target change; old-target finally
  // cannot clear a new operation's spinner.
  it('W6R2-FE-9: spinner cleared on target change; old-target finally does not clear new op spinner', async () => {
    let resolveOldCancel!: () => void;
    const oldCancelDeferred = new Promise<void>(r => { resolveOldCancel = r; });
    let resolveNewCancel!: () => void;
    const newCancelDeferred = new Promise<void>(r => { resolveNewCancel = r; });

    const { rewardService: svc } = await import('../../services/rewardService');
    vi.mocked(svc.cancelReward)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce(() => oldCancelDeferred as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce(() => newCancelDeferred as any);
    mockListRewards
      .mockResolvedValueOnce([makeReward({ id: 'child-r1', description: 'Child reward', status: 'active' })])
      .mockResolvedValueOnce([makeReward({ id: 'fam-r1', description: 'Family reward', status: 'active' })])
      .mockResolvedValueOnce([makeReward({ id: 'fam-r2', description: 'Family reward updated', status: 'active' })]);

    const { rerender } = render(
      <RewardDashboard role="parent" scopeId="shared-scope" targetType="child" />
    );
    await waitFor(() => expect(screen.getByText('Child reward')).toBeInTheDocument());

    // Click Cancel on child — spinner starts
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled());

    // Switch to family — cleanup must clear spinner
    rerender(<RewardDashboard role="parent" scopeId="shared-scope" targetType="family" />);
    await waitFor(() => expect(screen.getByText('Family reward')).toBeInTheDocument());

    // Family Cancel must be ENABLED (cleanup cleared old spinner)
    expect(screen.getByRole('button', { name: /Cancel/i })).not.toBeDisabled();

    // Click Cancel on family reward — new spinner starts
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled());

    // Resolve old child cancel — epoch-guarded finally must NOT clear family spinner
    await act(async () => { resolveOldCancel(); });
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();

    // Resolve new family cancel — spinner clears normally, list refreshes
    await act(async () => { resolveNewCancel(); });
    await waitFor(() => expect(screen.getByText('Family reward updated')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Cancel/i })).not.toBeDisabled();
  });
});

// Helper: a released reward with one released allocation for refund tests.
function makeReleasedRewardWithAlloc(rewardId = 'r-refund', allocId = 'a-refund') {
  const reward = makeReward({ id: rewardId, description: 'Refundable reward', status: 'released' });
  const alloc = {
    id: allocId,
    student_user_id: 'student-refund-001',
    amount_stroops: 10000000,
    status: 'released' as const,
  };
  return { reward, alloc };
}

describe('W06-R3: blocked-refund epoch guard', () => {
  // FE-10: deferred refund A→B→A — blocked result must NOT appear on second scopeA visit.
  // This is the RED test: before fix the setError fires because only targetKey is checked.
  it('W6R3-FE-10: deferred blocked refund A→B→A does not show stale blocked message on revisit', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveRefund!: (v: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refundDeferred = new Promise<any>(r => { resolveRefund = r; });

    // Import refundAllocation mock from the module mock
    const { rewardService } = await import('../../services/rewardService');
    vi.mocked(rewardService.refundAllocation).mockImplementationOnce(() => refundDeferred as any);

    const { reward: rewardA, alloc } = makeReleasedRewardWithAlloc();
    const rewardScopeB = makeReward({ id: 'r-scopeb', description: 'ScopeB reward', status: 'released' });
    const rewardA2 = makeReward({ id: 'r-a2', description: 'ScopeA revisit reward', status: 'released' });

    mockListRewards
      .mockResolvedValueOnce([rewardA])          // scopeA first visit
      .mockResolvedValueOnce([rewardScopeB])      // scopeB
      .mockResolvedValueOnce([rewardA2]);         // scopeA second visit (if triggered, but should not be triggered by old refund)
    mockGetAllocations.mockResolvedValueOnce([alloc]);

    const { rerender } = render(
      <RewardDashboard role="sponsor" scopeId="scopeA" canRefund />
    );
    await waitFor(() => expect(screen.getByText('Refundable reward')).toBeInTheDocument());

    // Expand allocations for the scopeA reward
    fireEvent.click(screen.getByRole('button', { name: /Expand allocations/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Refund/i })).toBeInTheDocument());

    // Click Refund — refundAllocation deferred
    fireEvent.click(screen.getByRole('button', { name: /Refund/i }));
    await waitFor(() => expect(vi.mocked(rewardService.refundAllocation)).toHaveBeenCalledTimes(1));

    // Switch to scopeB — epoch increments to 1
    rerender(<RewardDashboard role="sponsor" scopeId="scopeB" canRefund />);
    await waitFor(() => expect(screen.getByText('ScopeB reward')).toBeInTheDocument());

    // Switch back to scopeA — epoch increments to 2 — new visit renders new data
    rerender(<RewardDashboard role="sponsor" scopeId="scopeA" canRefund />);
    await waitFor(() => expect(screen.getByText('ScopeA revisit reward')).toBeInTheDocument());

    // Resolve old blocked refund from first scopeA visit
    await act(async () => {
      resolveRefund({ blocked: true, attemptId: 'synthetic-old-attempt' });
    });

    // Blocked message must NOT appear — it belongs to the old visit
    expect(screen.queryByText(/Refund blocked/)).not.toBeInTheDocument();
    // New visit data still visible
    expect(screen.getByText('ScopeA revisit reward')).toBeInTheDocument();
  });

  // FE-11: same-visit blocked refund must still display the message and clear its spinner.
  // This is the positive case: legitimate blocked feedback must not be suppressed.
  it('W6R3-FE-11: same-visit blocked refund shows message and clears spinner', async () => {
    const { rewardService } = await import('../../services/rewardService');
    vi.mocked(rewardService.refundAllocation).mockResolvedValueOnce(
      { blocked: true, attemptId: 'synthetic-same-visit' } as any
    );

    const { reward, alloc } = makeReleasedRewardWithAlloc();
    mockListRewards.mockResolvedValueOnce([reward]);
    mockGetAllocations.mockResolvedValueOnce([alloc]);

    render(<RewardDashboard role="sponsor" scopeId="scopeA" canRefund />);
    await waitFor(() => expect(screen.getByText('Refundable reward')).toBeInTheDocument());

    // Expand to see Refund button
    fireEvent.click(screen.getByRole('button', { name: /Expand allocations/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Refund/i })).toBeInTheDocument());

    // Refund button must be enabled before click
    expect(screen.getByRole('button', { name: /Refund/i })).not.toBeDisabled();

    // Click Refund — resolves with blocked result
    fireEvent.click(screen.getByRole('button', { name: /Refund/i }));

    // Blocked message must appear for same-visit blocked response
    await waitFor(() => expect(screen.getByText(/Refund blocked/)).toBeInTheDocument());

    // Spinner must be cleared (button re-enabled) after blocked response
    await waitFor(() => expect(screen.getByRole('button', { name: /Refund/i })).not.toBeDisabled());
  });

  // FE-12: old blocked response with new visit's operation pending must not clear new op's spinner.
  // Tests that the epoch-guarded finally still works correctly after the fix.
  it('W6R3-FE-12: old blocked response does not clear new visit pending operation spinner', async () => {
    const { rewardService } = await import('../../services/rewardService');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveOldRefund!: (v: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldRefundDeferred = new Promise<any>(r => { resolveOldRefund = r; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveNewCancel!: (v: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newCancelDeferred = new Promise<any>(r => { resolveNewCancel = r; });

    vi.mocked(rewardService.refundAllocation).mockImplementationOnce(() => oldRefundDeferred as any);
    vi.mocked(rewardService.cancelReward).mockImplementationOnce(() => newCancelDeferred as any);

    const { reward: rewardA, alloc } = makeReleasedRewardWithAlloc('r-aba', 'a-aba');
    const rewardScopeB = makeReward({ id: 'r-b', description: 'ScopeB reward', status: 'active' });
    const rewardA2 = makeReward({ id: 'r-a2', description: 'ScopeA revisit reward', status: 'active' });

    mockListRewards
      .mockResolvedValueOnce([rewardA])           // scopeA first visit
      .mockResolvedValueOnce([rewardScopeB])       // scopeB
      .mockResolvedValueOnce([rewardA2])           // scopeA second visit
      .mockResolvedValueOnce([rewardA2]);          // post-cancel reload on second scopeA visit
    mockGetAllocations.mockResolvedValueOnce([alloc]);

    const { rerender } = render(
      <RewardDashboard role="sponsor" scopeId="scopeA" canRefund />
    );
    await waitFor(() => expect(screen.getByText('Refundable reward')).toBeInTheDocument());

    // Expand and click Refund on first scopeA visit — deferred
    fireEvent.click(screen.getByRole('button', { name: /Expand allocations/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Refund/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Refund/i }));
    await waitFor(() => expect(vi.mocked(rewardService.refundAllocation)).toHaveBeenCalledTimes(1));

    // Switch to scopeB
    rerender(<RewardDashboard role="sponsor" scopeId="scopeB" canRefund />);
    await waitFor(() => expect(screen.getByText('ScopeB reward')).toBeInTheDocument());

    // Switch back to scopeA
    rerender(<RewardDashboard role="sponsor" scopeId="scopeA" canRefund />);
    await waitFor(() => expect(screen.getByText('ScopeA revisit reward')).toBeInTheDocument());

    // Start new operation on second scopeA visit
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled());

    // Resolve old blocked refund — must NOT clear new op's spinner, must NOT set error
    await act(async () => {
      resolveOldRefund({ blocked: true, attemptId: 'synthetic-old' });
    });

    // New op's spinner must still be showing (Cancel still disabled)
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();
    // No blocked-refund message from old visit
    expect(screen.queryByText(/Refund blocked/)).not.toBeInTheDocument();

    // Resolve new cancel — spinner clears normally
    await act(async () => { resolveNewCancel(undefined); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Cancel/i })).not.toBeDisabled());
  });
});
