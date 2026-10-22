import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import type { SponsorBilling } from '../services/sponsorService';

const mock = vi.hoisted(() => ({
  user: {
    id: 'sponsor',
    name: 'Sponsor',
    role: 'student',
    permissions: [] as string[],
    workspaces: ['sponsor'],
  },
  courses: vi.fn(),
  options: vi.fn(),
  dashboard: vi.fn(),
  spending: vi.fn(),
  students: vi.fn(),
  export: vi.fn(),
  impact: vi.fn(),
  billing: vi.fn(),
  receipt: vi.fn(),
  adminCourses: vi.fn(),
  adminStudents: vi.fn(),
  adminExport: vi.fn(),
  listCohorts: vi.fn(),
  createCohort: vi.fn(),
}));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('../services/sponsorService', () => ({
  sponsorService: {
    getCourses: mock.courses,
    getCourseOptions: mock.options,
    getDashboard: mock.dashboard,
    getSpendingReport: mock.spending,
    getStudents: mock.students,
    exportCoursesCsv: mock.export,
    getImpactReport: mock.impact,
    getBilling: mock.billing,
    downloadReceipt: mock.receipt,
    exportImpactCsv: vi.fn(),
  },
}));
vi.mock('../services/analyticsService', () => ({
  analyticsService: {
    getCourseAnalytics: mock.adminCourses,
    getSponsorStudents: mock.adminStudents,
    exportCsv: mock.adminExport,
  },
}));
vi.mock('../services/cohortService', () => ({
  cohortService: {
    listCohorts: mock.listCohorts,
    createCohort: mock.createCohort,
    getSpendingReport: mock.spending,
  },
}));
vi.mock('../components/RewardDashboard', () => ({
  RewardDashboard: ({ scopeId }: { scopeId: string }) => <p>Reward cohort {scopeId}</p>,
}));

import SponsorDashboard from '../pages/SponsorDashboard';

const course = {
  courseId: 'course',
  courseName: 'Scoped course',
  courseCode: 'SC-1',
  sponsorLabel: 'Owned cohort',
  enrollmentsCount: 1,
  walletsLinkedCount: 1,
  nftsIssuedCount: 1,
  tiersEnabled: 'both',
};
const emptyBilling = { payments: [], total: 0 };
const ownBilling: SponsorBilling = {
  payments: [
    {
      id: 'own-payment',
      courseId: 'course',
      courseName: 'Sponsor invoice',
      amountCents: 2500,
      currency: 'ZAR',
      paymentMethod: 'manual',
      status: 'confirmed',
      createdAt: '2026-03-01',
    },
  ],
  total: 1,
};
const memberBilling: SponsorBilling = {
  payments: [
    {
      id: 'member-payment',
      courseId: 'course',
      courseName: 'Member course',
      payerName: 'Learner',
      amountCents: 1000,
      currency: 'USD',
      paymentMethod: 'manual',
      status: 'waived',
      createdAt: '2026-03-01',
    },
  ],
  total: 1,
};
const permissions = [
  'cohort.view_own',
  'cohort.manage',
  'student.view_assigned',
  'reward.view_assigned',
  'impact_report.read',
  'billing.view_own',
  'billing.view_all',
];
function Navigation() {
  const location = useLocation(),
    navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">{location.pathname}</output>
      <button onClick={() => navigate('/sponsor/billing')}>Sidebar billing</button>
      <button onClick={() => navigate('/sponsor/cohorts')}>Sidebar cohorts</button>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}
function page(path = '/sponsor') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SponsorDashboard />
      <Navigation />
    </MemoryRouter>,
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.user.permissions = [...permissions];
  mock.user.workspaces = ['sponsor'];
  mock.courses.mockResolvedValue([course]);
  mock.options.mockResolvedValue([{ id: 'course', title: 'Scoped course', tiersEnabled: 'both' }]);
  mock.dashboard.mockResolvedValue({ cohorts: [{ id: 'owned', name: 'Owned cohort' }] });
  mock.spending.mockResolvedValue({
    totalSpentCents: 2500,
    cohorts: [{ cohortId: 'owned', cohortName: 'Owned cohort' }],
  });
  mock.students.mockResolvedValue([]);
  mock.export.mockResolvedValue(undefined);
  mock.receipt.mockResolvedValue(undefined);
  mock.impact.mockResolvedValue({
    totalMembers: 0,
    totalCompleted: 0,
    totalCertificates: 0,
    completionPct: 0,
    cohorts: [],
  });
  mock.billing.mockImplementation((_range, scope) =>
    Promise.resolve(scope === 'cohort' ? memberBilling : ownBilling),
  );
  mock.listCohorts.mockResolvedValue([
    {
      cohortId: 'owned',
      name: 'Live cohort',
      courseName: 'Scoped course',
      memberCount: 1,
      status: 'active',
      selectedTier: 'paid',
    },
  ]);
});

describe('A08 — URL is the tab state', () => {
  it('tabs, sidebar, Back, Forward and reload agree without unmounting between navigation', async () => {
    const user = userEvent.setup();
    let view = page('/sponsor/cohorts');
    expect(screen.getByRole('tab', { name: 'Cohorts tab' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Rewards tab' }));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/sponsor/rewards');
    await user.click(screen.getByText('Sidebar billing'));
    expect(screen.getByRole('tab', { name: 'Billing tab' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByText('Back'));
    expect(screen.getByRole('tab', { name: 'Rewards tab' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByText('Forward'));
    expect(screen.getByRole('tab', { name: 'Billing tab' })).toHaveAttribute('aria-selected', 'true');
    const url = screen.getByLabelText('Current URL').textContent!;
    view.unmount();
    view = page(url);
    expect(screen.getByRole('tab', { name: 'Billing tab' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByText('Sponsor invoice')).toBeInTheDocument());
    view.unmount();
  });
  it('keyboard tab navigation changes the URL and focuses the selected tab', async () => {
    page();
    const user = userEvent.setup();
    screen.getByRole('tab', { name: 'Sponsor Overview tab' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/sponsor/cohorts');
    expect(screen.getByRole('tab', { name: 'Cohorts tab' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/sponsor/billing');
    expect(screen.getByRole('tab', { name: 'Billing tab' })).toHaveFocus();
  });
  it('unavailable capabilities hide tabs and keyboard navigation skips them', async () => {
    mock.user.permissions = permissions.filter((p) => p !== 'billing.view_own');
    page();
    expect(screen.queryByRole('tab', { name: 'Billing tab' })).not.toBeInTheDocument();
    screen.getByRole('tab', { name: 'Sponsor Overview tab' }).focus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Impact Report tab' })).toHaveFocus();
  });
  it('unknown tab URLs normalize to the overview', async () => {
    page('/sponsor/unknown');
    await waitFor(() => expect(screen.getByLabelText('Current URL').textContent).toBe('/sponsor'));
  });
});

describe('A05 — independent loading and scoped transport', () => {
  it('overview failure does not turn successful reward cohorts into an empty state', async () => {
    mock.courses.mockRejectedValue(new Error('Overview unavailable'));
    page();
    await screen.findByText('Overview unavailable');
    expect(screen.queryByText(/No sponsored courses yet/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Rewards tab' }));
    await screen.findByText('Reward cohort owned');
    expect(screen.queryByText(/No cohorts found/)).not.toBeInTheDocument();
    expect(mock.adminCourses).not.toHaveBeenCalled();
    expect(mock.spending).not.toHaveBeenCalled();
  });
  it('spending failure preserves course options and the live cohort list', async () => {
    mock.spending.mockRejectedValue(new Error('Spending unavailable'));
    page('/sponsor/cohorts');
    await screen.findByText('Spending unavailable');
    await screen.findByText('Live cohort');
    expect(screen.getByRole('button', { name: 'Create Cohort' })).toBeEnabled();
    expect(mock.courses).not.toHaveBeenCalled();
    expect(mock.listCohorts).toHaveBeenCalledWith(undefined, 'own');
  });
  it('catalog failure disables creation while preserving cohorts and successful spending', async () => {
    mock.options.mockRejectedValue(new Error('Catalog unavailable'));
    page('/sponsor/cohorts');
    await screen.findByText('Catalog unavailable');
    await screen.findByText('Live cohort');
    expect(screen.getByTestId('total-spent')).toHaveTextContent('25.00');
    expect(screen.getByRole('button', { name: 'Create Cohort' })).toBeDisabled();
  });
  it('cohort list failure displays retry without a false empty state', async () => {
    mock.listCohorts.mockRejectedValueOnce(new Error('Cohorts unavailable'));
    page('/sponsor/cohorts');
    await screen.findByText('Cohorts unavailable');
    expect(screen.queryByText('No cohorts yet. Create one to get started.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry cohorts' }));
    await screen.findByText('Live cohort');
  });
  it('reward cohort errors can be retried without loading analytics or spending', async () => {
    mock.dashboard.mockRejectedValueOnce(new Error('Roster unavailable'));
    page('/sponsor/rewards');
    await screen.findByText('Roster unavailable');
    expect(screen.queryByText(/No cohorts found/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Reward cohort owned');
    expect(mock.adminCourses).not.toHaveBeenCalled();
  });
  it('member drill-down errors remain visible and retry the sponsor endpoint', async () => {
    mock.students
      .mockRejectedValueOnce(new Error('Members unavailable'))
      .mockResolvedValueOnce([
        {
          userId: 'learner',
          name: 'Scoped learner',
          email: 'learner@example.invalid',
          walletAddress: null,
          nftStatus: 'none',
        },
      ]);
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Scoped course' }));
    await screen.findByText('Members unavailable');
    expect(screen.queryByText('No students enrolled')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Scoped learner');
    expect(mock.students).toHaveBeenCalledWith('course');
    expect(mock.adminStudents).not.toHaveBeenCalled();
  });
  it('collapsing and reopening a row ignores an older in-flight response', async () => {
    const old = deferred<unknown[]>(),
      current = deferred<unknown[]>();
    mock.students.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    page();
    const row = await screen.findByRole('button', { name: 'Scoped course' });
    const user = userEvent.setup();
    await user.click(row);
    await user.click(row);
    await user.click(row);
    await act(async () => old.resolve([{ userId: 'old', name: 'Old learner' }]));
    expect(screen.queryByText('Old learner')).not.toBeInTheDocument();
    await act(async () =>
      current.resolve([
        {
          userId: 'new',
          name: 'Current learner',
          email: 'current@example.invalid',
          walletAddress: null,
          nftStatus: 'none',
        },
      ]),
    );
    await screen.findByText('Current learner');
  });
  it('CSV export failure retains overview data and retries the scoped export', async () => {
    mock.export.mockRejectedValueOnce(new Error('Export unavailable'));
    page();
    await screen.findByText('Scoped course');
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await screen.findByText('Export unavailable');
    expect(screen.getByText('Scoped course')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mock.export).toHaveBeenCalledTimes(2);
    expect(mock.adminExport).not.toHaveBeenCalled();
  });
});

describe('A06 — independent personal and member billing', () => {
  it('a personal billing failure preserves member payments and currency semantics', async () => {
    mock.billing.mockImplementation((_range, scope) =>
      scope === 'cohort'
        ? Promise.resolve(memberBilling)
        : Promise.reject(new Error('Own billing unavailable')),
    );
    page('/sponsor/billing');
    await screen.findByText('Own billing unavailable');
    await screen.findByText('Member course');
    expect(screen.getByText(/not amounts paid by you/)).toBeInTheDocument();
    expect(mock.adminCourses).not.toHaveBeenCalled();
  });
  it('a member billing failure preserves personal payments, currency and receipt actions', async () => {
    mock.billing.mockImplementation((_range, scope) =>
      scope === 'cohort'
        ? Promise.reject(new Error('Member billing unavailable'))
        : Promise.resolve(ownBilling),
    );
    page('/sponsor/billing');
    await screen.findByText('Member billing unavailable');
    await screen.findByText('Sponsor invoice');
    expect(
      within(screen.getByRole('region', { name: 'Your payments' })).getByText(/ZAR/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Download receipt for Sponsor invoice/ }));
    expect(mock.receipt).toHaveBeenCalledWith('own-payment');
  });
  it('receipts use the selected payment ID; failures retain the payment tables', async () => {
    mock.receipt.mockRejectedValueOnce(new Error('Receipt unavailable'));
    page('/sponsor/billing');
    await userEvent.click(await screen.findByRole('button', { name: /Download receipt for Member course/ }));
    await screen.findByText('Receipt unavailable');
    expect(mock.receipt).toHaveBeenCalledWith('member-payment');
    expect(screen.getByText('Member course')).toBeInTheDocument();
    expect(screen.getByText('Sponsor invoice')).toBeInTheDocument();
  });
  it('a late response for an old billing range cannot overwrite the current range', async () => {
    const old = deferred<SponsorBilling>();
    mock.billing.mockImplementation((range, scope) =>
      scope === 'cohort' ? Promise.resolve(emptyBilling) : range ? Promise.resolve(ownBilling) : old.promise,
    );
    page('/sponsor/billing');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply date filter' }));
    await screen.findByText('Sponsor invoice');
    await act(async () =>
      old.resolve({ ...ownBilling, payments: [{ ...ownBilling.payments[0], courseName: 'Old invoice' }] }),
    );
    expect(screen.queryByText('Old invoice')).not.toBeInTheDocument();
    expect(screen.getByText('Sponsor invoice')).toBeInTheDocument();
    expect(mock.billing).toHaveBeenCalledWith({ from: '2026-03-01' });
  });
});
