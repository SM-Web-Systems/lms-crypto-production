import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { CohortManagement } from '../components/CohortManagement';
import { RewardDashboard } from '../components/RewardDashboard';
import { analyticsService, type CourseAnalytics, type SponsorStudent } from '../services/analyticsService';
import { cohortService } from '../services/cohortService';
import { sponsorService, type ImpactReport, type DateRange } from '../services/sponsorService';
import { SponsorBillingPanel } from '../components/SponsorBillingPanel';
import { useAuth } from '../context/useAuth';
import { hasCapability } from '../utils/authorization';
import { getErrorMessage } from '../utils/apiError';
import {
  RefreshCw,
  AlertCircle,
  Award,
  Users,
  Wallet,
  BookOpen,
  Tag,
  Download,
  ChevronDown,
  ChevronRight,
  Loader2,
  DollarSign,
  BarChart2,
  CheckCircle,
  TrendingDown,
  Filter,
} from 'lucide-react';

interface SponsorGroup {
  label: string;
  courses: CourseAnalytics[];
  totalEnrollments: number;
  totalWallets: number;
  totalNfts: number;
}

function groupBySponsor(courses: CourseAnalytics[]): SponsorGroup[] {
  const map = new Map<string, CourseAnalytics[]>();
  for (const c of courses) {
    const key = c.sponsorLabel ?? '(No sponsor)';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return Array.from(map.entries())
    .map(([label, items]) => ({
      label,
      courses: items,
      totalEnrollments: items.reduce((n, c) => n + c.enrollmentsCount, 0),
      totalWallets: items.reduce((n, c) => n + c.walletsLinkedCount, 0),
      totalNfts: items.reduce((n, c) => n + c.nftsIssuedCount, 0),
    }))
    .sort((a, b) => {
      if (a.label === '(No sponsor)') return 1;
      if (b.label === '(No sponsor)') return -1;
      return a.label.localeCompare(b.label);
    });
}

function truncateWallet(address: string | null): string {
  if (!address) return '—';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ─── Date Range Filter ────────────────────────────────────────────────────

const DateRangeFilter: React.FC<{
  onApply: (range: DateRange) => void;
  onClear: () => void;
}> = ({ onApply, onClear }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleApply = () => {
    setValidationError(null);
    if (from && to && from > to) {
      setValidationError('"From" must be before "To".');
      return;
    }
    const range: DateRange = {};
    if (from) range.from = from;
    if (to) range.to = to;
    onApply(range);
  };

  const handleClear = () => {
    setFrom('');
    setTo('');
    setValidationError(null);
    onClear();
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="filter-from" className="block text-xs text-neutral-500 mb-1">
          From
        </label>
        <input
          id="filter-from"
          type="date"
          value={from}
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'filter-error' : undefined}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="filter-to" className="block text-xs text-neutral-500 mb-1">
          To
        </label>
        <input
          id="filter-to"
          type="date"
          value={to}
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'filter-error' : undefined}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <Button variant="outline" size="sm" onClick={handleApply} aria-label="Apply date filter">
        <Filter className="h-3.5 w-3.5 mr-1" aria-hidden />
        Apply
      </Button>
      <Button variant="outline" size="sm" onClick={handleClear} aria-label="Clear date filter">
        Clear
      </Button>
      {validationError && <p id="filter-error" role="alert" className="text-xs text-red-600 w-full">{validationError}</p>}
    </div>
  );
};

// ─── Impact Report Tab ─────────────────────────────────────────────────────

const ImpactReportTab: React.FC<{ refreshTick: number }> = ({ refreshTick }) => {
  const generation = useRef(0);
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [exportingCsv, setExportingCsv] = useState(false);

  const loadImpact = useCallback(async (range?: DateRange) => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const data = await sponsorService.getImpactReport(range);
      if (current === generation.current) setImpact(data);
    } catch (e) {
      if (current === generation.current) setError(getErrorMessage(e, 'Could not load impact report.'));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImpact(dateRange);
    return () => {
      generation.current++;
    };
  }, [loadImpact, dateRange, refreshTick]);

  const handleDateApply = useCallback(
    (range: DateRange) => {
      setDateRange(range);
    },
    [loadImpact],
  );

  const handleDateClear = useCallback(() => {
    setDateRange(undefined);
  }, [loadImpact]);

  const handleExportCsv = useCallback(async () => {
    setExportingCsv(true);
    try {
      await sponsorService.exportImpactCsv(dateRange);
    } catch (e) {
      setError(getErrorMessage(e, 'CSV export failed.'));
    } finally {
      setExportingCsv(false);
    }
  }, [dateRange]);

  if (loading)
    return (
      <div className="space-y-4">
        <DateRangeFilter onApply={handleDateApply} onClear={handleDateClear} />
        <div className="py-12 text-center text-neutral-500 text-sm">Loading impact report…</div>
      </div>
    );

  if (error)
    return (
      <div className="space-y-3">
        <DateRangeFilter onApply={handleDateApply} onClear={handleDateClear} />
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadImpact(dateRange)}>
          Try again
        </Button>
      </div>
    );

  if (!impact || impact.cohorts.length === 0)
    return (
      <div className="space-y-4">
        <DateRangeFilter onApply={handleDateApply} onClear={handleDateClear} />
        <div className="py-12 text-center">
          <BarChart2 className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
          <p className="text-neutral-500 text-sm">
            No cohort data yet. Create a cohort to see impact metrics.
          </p>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-neutral-600">
          Completion and certification metrics across your sponsored cohorts.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={exportingCsv}
          aria-label="Export impact report as CSV"
        >
          {exportingCsv ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4 mr-1.5" aria-hidden />
          )}
          Export Impact CSV
        </Button>
      </div>

      <DateRangeFilter onApply={handleDateApply} onClear={handleDateClear} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-500 shrink-0" aria-hidden />
            <div>
              <p className="text-xs text-neutral-500">Total Students</p>
              <p className="text-lg font-bold text-neutral-900">{impact.totalMembers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500 shrink-0" aria-hidden />
            <div>
              <p className="text-xs text-neutral-500">Completed</p>
              <p className="text-lg font-bold text-neutral-900">{impact.totalCompleted}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <Award className="h-5 w-5 text-purple-500 shrink-0" aria-hidden />
            <div>
              <p className="text-xs text-neutral-500">Certificates</p>
              <p className="text-lg font-bold text-neutral-900">{impact.totalCertificates}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <BarChart2 className="h-5 w-5 text-accent-teal shrink-0" aria-hidden />
            <div>
              <p className="text-xs text-neutral-500">Completion Rate</p>
              <p className="text-lg font-bold text-neutral-900">{impact.completionPct}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-cohort table */}
      <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
        <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-primary-50/30 px-5 py-3">
          <CardTitle className="border-0 p-0 text-neutral-900 text-sm">Cohort Breakdown</CardTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Cohort</th>
                <th className="px-4 py-2.5 font-medium text-right">Members</th>
                <th className="px-4 py-2.5 font-medium text-right">Completed</th>
                <th className="px-4 py-2.5 font-medium text-right">Certificates</th>
                <th className="px-4 py-2.5 font-medium text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {impact.cohorts.map((c) => (
                <tr key={c.cohortId} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-neutral-900">{c.cohortName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{c.memberCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{c.completedCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{c.certificateCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                    {c.memberCount > 0 ? Math.round((c.completedCount / c.memberCount) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Drop-off analysis */}
      <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
        <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-primary-50/30 px-5 py-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-orange-500" aria-hidden />
            <CardTitle className="border-0 p-0 text-neutral-900 text-sm">Drop-off Analysis</CardTitle>
          </div>
        </div>
        {impact.dropOff && impact.dropOff.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">Course</th>
                  <th className="px-4 py-2.5 font-medium">Lesson Item</th>
                  <th className="px-4 py-2.5 font-medium text-right">Completions</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total Members</th>
                  <th className="px-4 py-2.5 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {impact.dropOff.map((d) => (
                  <tr key={`${d.courseId}-${d.itemId}`} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-neutral-900">{d.courseName}</td>
                    <td className="px-4 py-3 text-neutral-700 font-mono text-xs">{d.itemId}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{d.completions}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{d.totalMembers}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={`font-medium ${d.completionRate < 30 ? 'text-red-600' : d.completionRate < 60 ? 'text-orange-600' : 'text-neutral-700'}`}
                      >
                        {d.completionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-6 text-center text-neutral-500 text-sm">
            No drop-off data available for your cohorts.
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Billing Tab ───────────────────────────────────────────────────────────

const BillingTab: React.FC<{ refreshTick: number }> = ({ refreshTick }) => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Payment history</h2>
      <DateRangeFilter onApply={setDateRange} onClear={() => setDateRange(undefined)} />
      <SponsorBillingPanel dateRange={dateRange} refreshTick={refreshTick} />
    </div>
  );
};

function useResource<T>(loader: () => Promise<T>, enabled: boolean) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setPending(true);
    setError('');
    setData(null);
    try {
      const value = await loader();
      if (current === generation.current) setData(value);
    } catch (err) {
      if (current === generation.current) setError(getErrorMessage(err, 'Could not load this section.'));
    } finally {
      if (current === generation.current) {
        setPending(false);
        setLoaded(true);
      }
    }
  }, [loader]);
  useEffect(() => {
    if (enabled) void load();
    return () => {
      generation.current++;
    };
  }, [enabled, load]);
  return { data, error, loading: enabled && (pending || !loaded), load };
}
const ResourceError: React.FC<{ message: string; retry: () => void }> = ({ message, retry }) => (
  <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 space-y-2">
    <p className="text-sm text-red-800">{message}</p>
    <Button size="sm" variant="outline" onClick={retry}>
      Try again
    </Button>
  </div>
);

// ─── Main Dashboard ────────────────────────────────────────────────────────

type TabId = 'overview' | 'cohorts' | 'rewards' | 'impact' | 'billing';
const ALL_TABS: TabId[] = ['overview', 'cohorts', 'rewards', 'impact', 'billing'];

const SponsorDashboard: React.FC = () => {
  const location = useLocation(),
    navigate = useNavigate();
  const { user } = useAuth();
  const adminMode = location.pathname.startsWith('/admin/sponsor');
  const base = adminMode ? '/admin/sponsor' : '/sponsor';
  const TAB_ORDER = useMemo(() => {
    const capabilities: Record<TabId, string> = {
      overview: adminMode ? 'system.view_audit_log' : 'cohort.view_own',
      cohorts: 'cohort.manage',
      rewards: 'reward.view_assigned',
      impact: 'impact_report.read',
      billing: 'billing.view_own',
    };
    return ALL_TABS.filter((tab) => user?.permissions?.includes(capabilities[tab]));
  }, [adminMode, user?.permissions]);
  const slug = location.pathname.slice(base.length).replace(/^\//, '');
  const activeTab: TabId = ALL_TABS.includes(slug as TabId) ? (slug as TabId) : 'overview';
  const selectTab = useCallback(
    (tab: TabId) => navigate(base + (tab === 'overview' ? '' : '/' + tab)),
    [navigate, base],
  );
  useEffect(() => {
    if (slug && !TAB_ORDER.includes(slug as TabId)) navigate(base, { replace: true });
  }, [slug, base, navigate, TAB_ORDER]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState('');
  const coursesLoader = useCallback(
    () => (adminMode ? analyticsService.getCourseAnalytics() : sponsorService.getCourses()),
    [adminMode],
  );
  const reportLoader = useCallback(
    () => (adminMode ? cohortService.getSpendingReport() : sponsorService.getSpendingReport()),
    [adminMode],
  );
  const cohortLoader = useCallback(async () => {
    if (!adminMode) return sponsorService.getDashboard();
    return { cohorts: (await cohortService.listCohorts()).map((c) => ({ id: c.cohortId, name: c.name })) };
  }, [adminMode]);
  const optionsLoader = useCallback(
    async () =>
      adminMode
        ? (await analyticsService.getCourseAnalytics()).map((c) => ({
            id: c.courseId,
            title: c.courseName,
            tiersEnabled: c.tiersEnabled,
          }))
        : sponsorService.getCourseOptions(),
    [adminMode],
  );
  const courseResource = useResource(coursesLoader, activeTab === 'overview');
  const reportResource = useResource(reportLoader, activeTab === 'cohorts');
  const cohortResource = useResource(cohortLoader, activeTab === 'rewards');
  const optionResource = useResource(optionsLoader, activeTab === 'cohorts');
  const courses = courseResource.data ?? [],
    loading = courseResource.loading,
    error = courseResource.error;
  const spendingReport = reportResource.data;
  const load = useCallback(() => {
    setRefreshTick((n) => n + 1);
    if (activeTab === 'overview') void courseResource.load();
    if (activeTab === 'cohorts') {
      void reportResource.load();
      void optionResource.load();
    }
    if (activeTab === 'rewards') void cohortResource.load();
  }, [activeTab, courseResource.load, reportResource.load, optionResource.load, cohortResource.load]);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    overview: null,
    cohorts: null,
    rewards: null,
    impact: null,
    billing: null,
  });
  const tabListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const revealSelectedTab = () => {
      const list = tabListRef.current, tab = tabRefs.current[activeTab];
      if (!list || !tab) return;
      const container = list.getBoundingClientRect(), selected = tab.getBoundingClientRect();
      if (selected.left < container.left) list.scrollLeft -= container.left - selected.left;
      else if (selected.right > container.right) list.scrollLeft += selected.right - container.right;
    };
    revealSelectedTab();
    window.addEventListener('resize', revealSelectedTab);
    return () => window.removeEventListener('resize', revealSelectedTab);
  }, [activeTab, TAB_ORDER]);
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = TAB_ORDER.indexOf(activeTab);
      let nextIdx = idx;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TAB_ORDER.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = TAB_ORDER.length - 1;
      else return;
      e.preventDefault();
      selectTab(TAB_ORDER[nextIdx]);
      tabRefs.current[TAB_ORDER[nextIdx]]?.focus();
    },
    [activeTab, selectTab, TAB_ORDER],
  );
  const [expanded, setExpanded] = useState<Record<string, SponsorStudent[] | 'loading' | { error: string }>>(
    {},
  );
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const drillGeneration = useRef(0);
  const rowRequests = useRef<Record<string, number>>({});
  useEffect(() => {
    setExpanded({});
    drillGeneration.current++;
  }, [adminMode, courseResource.data]);

  const toggleRow = useCallback(
    async (courseId: string, retry = false) => {
      const existing = expandedRef.current[courseId];
      const rowRequest = (rowRequests.current[courseId] ?? 0) + 1;
      rowRequests.current[courseId] = rowRequest;
      if (existing && !retry) {
        setExpanded((p) => {
          const next = { ...p };
          delete next[courseId];
          return next;
        });
        return;
      }
      const current = drillGeneration.current;
      setExpanded((p) => ({ ...p, [courseId]: 'loading' }));
      try {
        const students = await (adminMode
          ? analyticsService.getSponsorStudents(courseId)
          : sponsorService.getStudents(courseId));
        if (current === drillGeneration.current && rowRequests.current[courseId] === rowRequest)
          setExpanded((p) => (p[courseId] === 'loading' ? { ...p, [courseId]: students } : p));
      } catch (err) {
        if (current === drillGeneration.current && rowRequests.current[courseId] === rowRequest)
          setExpanded((p) =>
            p[courseId] === 'loading'
              ? { ...p, [courseId]: { error: getErrorMessage(err, 'Could not load members.') } }
              : p,
          );
      }
    },
    [adminMode],
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      setExportError('');
      await (adminMode ? analyticsService.exportCsv() : sponsorService.exportCoursesCsv());
    } catch (e) {
      setExportError(getErrorMessage(e, 'CSV export failed.'));
    } finally {
      setExporting(false);
    }
  }, [adminMode]);

  const groups = groupBySponsor(courses);

  return (
    <div className="pb-10 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Sponsor / Cohort Portal</h1>
          <p className="text-sm text-neutral-600 mt-0.5">
            {adminMode
              ? 'Platform enrollment and certificate analytics.'
              : 'Enrollment, wallets and certificates for members of your owned cohorts.'}
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'overview' && (adminMode || hasCapability(user, 'student.view_assigned')) && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleExport}
              disabled={exporting || loading}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4 mr-1.5" aria-hidden />
              )}
              Export CSV
            </Button>
          )}
          <Button variant="outline" size="sm" type="button" onClick={load}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tab navigation */}
      <div
        ref={tabListRef}
        className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-neutral-200"
        role="tablist"
        aria-label="Sponsor portal sections"
        onKeyDown={handleTabKeyDown}
      >
        {TAB_ORDER.includes('overview') && (
          <button
            ref={(el) => {
              tabRefs.current.overview = el;
            }}
            id="tab-overview"
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
            onClick={() => selectTab('overview')}
            aria-label="Sponsor Overview tab"
            aria-selected={activeTab === 'overview'}
            aria-controls="tabpanel-overview"
            tabIndex={activeTab === 'overview' ? 0 : -1}
            role="tab"
          >
            Sponsor Overview
          </button>
        )}
        {TAB_ORDER.includes('cohorts') && (
          <button
            ref={(el) => {
              tabRefs.current.cohorts = el;
            }}
            id="tab-cohorts"
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'cohorts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
            onClick={() => selectTab('cohorts')}
            aria-label="Cohorts tab"
            aria-selected={activeTab === 'cohorts'}
            aria-controls="tabpanel-cohorts"
            tabIndex={activeTab === 'cohorts' ? 0 : -1}
            role="tab"
          >
            Cohorts
          </button>
        )}
        {TAB_ORDER.includes('rewards') && (
          <button
            ref={(el) => {
              tabRefs.current.rewards = el;
            }}
            id="tab-rewards"
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'rewards' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
            onClick={() => selectTab('rewards')}
            aria-label="Rewards tab"
            aria-selected={activeTab === 'rewards'}
            aria-controls="tabpanel-rewards"
            tabIndex={activeTab === 'rewards' ? 0 : -1}
            role="tab"
          >
            Rewards
          </button>
        )}
        {TAB_ORDER.includes('impact') && (
          <button
            ref={(el) => {
              tabRefs.current.impact = el;
            }}
            id="tab-impact"
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'impact' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
            onClick={() => selectTab('impact')}
            aria-label="Impact Report tab"
            aria-selected={activeTab === 'impact'}
            aria-controls="tabpanel-impact"
            tabIndex={activeTab === 'impact' ? 0 : -1}
            role="tab"
          >
            Impact Report
          </button>
        )}
        {TAB_ORDER.includes('billing') && (
          <button
            ref={(el) => {
              tabRefs.current.billing = el;
            }}
            id="tab-billing"
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'billing' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
            onClick={() => selectTab('billing')}
            aria-label="Billing tab"
            aria-selected={activeTab === 'billing'}
            aria-controls="tabpanel-billing"
            tabIndex={activeTab === 'billing' ? 0 : -1}
            role="tab"
          >
            Billing
          </button>
        )}
      </div>

      {activeTab === 'impact' ? (
        <div role="tabpanel" id="tabpanel-impact" aria-labelledby="tab-impact" tabIndex={0}>
          <ImpactReportTab refreshTick={refreshTick} />
        </div>
      ) : activeTab === 'billing' ? (
        <div role="tabpanel" id="tabpanel-billing" aria-labelledby="tab-billing" tabIndex={0}>
          <BillingTab refreshTick={refreshTick} />
        </div>
      ) : activeTab === 'rewards' ? (
        <div role="tabpanel" id="tabpanel-rewards" aria-labelledby="tab-rewards" tabIndex={0}>
          <div>
            <p className="text-sm text-neutral-600 mb-4">
              Manage rewards for your sponsored cohorts. Select a cohort to view and create rewards.
            </p>
            {cohortResource.loading ? (
              <p role="status">Loading cohorts…</p>
            ) : cohortResource.error ? (
              <ResourceError message={cohortResource.error} retry={cohortResource.load} />
            ) : cohortResource.data && cohortResource.data.cohorts.length > 0 ? (
              <div className="space-y-6">
                {cohortResource.data.cohorts.map((c) => (
                  <RewardDashboard key={c.id} role="sponsor" scopeId={c.id} scopeLabel={c.name} canRefund />
                ))}
              </div>
            ) : (
              <p className="text-neutral-500 text-sm py-8 text-center">
                No cohorts found. Create a cohort first.
              </p>
            )}
          </div>
        </div>
      ) : activeTab === 'cohorts' ? (
        <div role="tabpanel" id="tabpanel-cohorts" aria-labelledby="tab-cohorts" tabIndex={0}>
          <div className="space-y-4">
            {reportResource.loading && <p role="status">Loading spending report…</p>}
            {reportResource.error && (
              <ResourceError message={reportResource.error} retry={reportResource.load} />
            )}
            {spendingReport && (
              <div className="grid grid-cols-2 gap-3 mb-4" data-testid="spending-summary">
                <Card className="shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-green-600 shrink-0" aria-hidden />
                    <div>
                      <p className="text-xs text-neutral-500">Total Spent (Confirmed)</p>
                      <p className="text-lg font-bold text-neutral-900" data-testid="total-spent">
                        ${(spendingReport.totalSpentCents / 100).toFixed(2)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Users className="h-5 w-5 text-blue-500 shrink-0" aria-hidden />
                    <div>
                      <p className="text-xs text-neutral-500">Cohorts</p>
                      <p className="text-lg font-bold text-neutral-900">{spendingReport.cohorts.length}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            {optionResource.loading && <p role="status">Loading course choices…</p>}
            {optionResource.error && (
              <ResourceError message={optionResource.error} retry={optionResource.load} />
            )}
            <CohortManagement
              courses={optionResource.data ?? []}
              courseOptionsLoading={optionResource.loading}
              courseOptionsError={!!optionResource.error}
              ownerOnly={!adminMode}
              refreshTick={refreshTick}
              onChanged={load}
            />
          </div>
        </div>
      ) : (
        <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview" tabIndex={0}>
          <>
            {exportError && <ResourceError message={exportError} retry={handleExport} />}
            {error && (
              <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm">{error}</p>
                <Button size="sm" variant="outline" onClick={courseResource.load}>
                  Try again
                </Button>
              </div>
            )}

            {loading ? (
              <div className="py-20 text-center text-neutral-500 text-sm">Loading…</div>
            ) : error ? null : courses.length === 0 ? (
              <div className="py-20 text-center">
                <Tag className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
                <p className="text-neutral-500 text-sm">
                  {adminMode
                    ? 'No courses yet.'
                    : 'No sponsored courses yet. Create a cohort to see its members here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {groups.map((group) => (
                  <div key={group.label}>
                    {/* Sponsor header */}
                    <div className="flex items-center gap-2 mb-3">
                      <Tag className="h-4 w-4 text-violet-500 shrink-0" aria-hidden />
                      <h2 className="text-base font-bold text-neutral-800">{group.label}</h2>
                      {group.label !== '(No sponsor)' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-xs font-medium">
                          {group.courses.length} course{group.courses.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <Card className="shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                          <Users className="h-5 w-5 text-accent-teal shrink-0" aria-hidden />
                          <div>
                            <p className="text-xs text-neutral-500">Enrolled</p>
                            <p className="text-lg font-bold text-neutral-900">{group.totalEnrollments}</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                          <Wallet className="h-5 w-5 text-blue-500 shrink-0" aria-hidden />
                          <div>
                            <p className="text-xs text-neutral-500">Wallets linked</p>
                            <p className="text-lg font-bold text-neutral-900">{group.totalWallets}</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="shadow-sm">
                        <CardContent className="p-4 flex items-center gap-3">
                          <Award className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden />
                          <div>
                            <p className="text-xs text-neutral-500">NFTs issued</p>
                            <p className="text-lg font-bold text-neutral-900">{group.totalNfts}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Per-course table */}
                    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
                      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-primary-50/30 px-5 py-3">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-accent-teal" aria-hidden />
                          <CardTitle className="border-0 p-0 text-neutral-900 text-sm">Courses</CardTitle>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                              <th className="px-4 py-2.5 font-medium w-6" />
                              <th className="px-4 py-2.5 font-medium">Course</th>
                              <th className="px-4 py-2.5 font-medium text-right">Enrolled</th>
                              <th className="px-4 py-2.5 font-medium text-right">Wallets</th>
                              <th className="px-4 py-2.5 font-medium text-right">NFTs issued</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {group.courses.map((c) => {
                              const exp = expanded[c.courseId];
                              const isExpanded = !!exp;
                              const isLoading = exp === 'loading';
                              const students = Array.isArray(exp) ? exp : [];
                              const studentError =
                                exp && typeof exp === 'object' && !Array.isArray(exp) ? exp.error : '';

                              return (
                                <React.Fragment key={c.courseId}>
                                  <tr
                                    className="hover:bg-neutral-50/60 transition-colors cursor-pointer"
                                    onClick={() => toggleRow(c.courseId)}
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={isExpanded}
                                    aria-label={c.courseName}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggleRow(c.courseId);
                                      }
                                    }}
                                  >
                                    <td className="px-4 py-3 text-neutral-400">
                                      {isLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                      ) : isExpanded ? (
                                        <ChevronDown className="h-4 w-4" aria-hidden />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" aria-hidden />
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <p className="font-medium text-neutral-900">{c.courseName}</p>
                                      <p className="text-xs text-neutral-400 font-mono">{c.courseCode}</p>
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                                      {c.enrollmentsCount}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                                      {c.walletsLinkedCount}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                                      {c.nftsIssuedCount}
                                    </td>
                                  </tr>
                                  {isExpanded && !isLoading && (
                                    <tr>
                                      <td colSpan={5} className="px-0 py-0">
                                        <div className="bg-neutral-50/80 border-t border-neutral-100 px-8 py-3">
                                          {studentError ? (
                                            <ResourceError
                                              message={studentError}
                                              retry={() => void toggleRow(c.courseId, true)}
                                            />
                                          ) : students.length === 0 ? (
                                            <p className="text-sm text-neutral-400 italic py-2">
                                              No students enrolled
                                            </p>
                                          ) : (
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="text-left text-neutral-500 uppercase tracking-wide">
                                                  <th className="pb-2 font-medium">Name</th>
                                                  <th className="pb-2 font-medium">Email</th>
                                                  <th className="pb-2 font-medium">Wallet</th>
                                                  <th className="pb-2 font-medium">NFT Status</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-neutral-100">
                                                {students.map((s) => (
                                                  <tr key={s.userId}>
                                                    <td className="py-1.5 text-neutral-800">{s.name}</td>
                                                    <td className="py-1.5 text-neutral-600">{s.email}</td>
                                                    <td className="py-1.5 text-neutral-600 font-mono">
                                                      {truncateWallet(s.walletAddress)}
                                                    </td>
                                                    <td className="py-1.5">
                                                      <span
                                                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                                          s.nftStatus === 'minted'
                                                            ? 'bg-emerald-100 text-emerald-800'
                                                            : 'bg-neutral-100 text-neutral-500'
                                                        }`}
                                                      >
                                                        {s.nftStatus === 'minted' ? 'Minted' : 'None'}
                                                      </span>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </>
        </div>
      )}
    </div>
  );
};

export default SponsorDashboard;
