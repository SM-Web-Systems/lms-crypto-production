import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { CohortManagement } from '../components/CohortManagement';
import { RewardDashboard } from '../components/RewardDashboard';
import { analyticsService, type CourseAnalytics, type SponsorStudent } from '../services/analyticsService';
import { cohortService } from '../services/cohortService';
import { sponsorService, type ImpactReport, type SponsorBilling, type DateRange } from '../services/sponsorService';
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
  CreditCard,
  CheckCircle,
  Clock,
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
        <label htmlFor="filter-from" className="block text-xs text-neutral-500 mb-1">From</label>
        <input
          id="filter-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="filter-to" className="block text-xs text-neutral-500 mb-1">To</label>
        <input
          id="filter-to"
          type="date"
          value={to}
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
      {validationError && (
        <p className="text-xs text-red-600 w-full">{validationError}</p>
      )}
    </div>
  );
};

// ─── Impact Report Tab ─────────────────────────────────────────────────────

const ImpactReportTab: React.FC = () => {
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [exportingCsv, setExportingCsv] = useState(false);

  const loadImpact = useCallback(async (range?: DateRange) => {
    setLoading(true);
    setError(null);
    try {
      const data = await sponsorService.getImpactReport(range);
      setImpact(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load impact report.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadImpact(); }, [loadImpact]);

  const handleDateApply = useCallback((range: DateRange) => {
    setDateRange(range);
    loadImpact(range);
  }, [loadImpact]);

  const handleDateClear = useCallback(() => {
    setDateRange(undefined);
    loadImpact();
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

  if (loading) return (
    <div className="space-y-4">
      <DateRangeFilter onApply={handleDateApply} onClear={handleDateClear} />
      <div className="py-12 text-center text-neutral-500 text-sm">Loading impact report…</div>
    </div>
  );

  if (error) return (
    <div className="space-y-3">
      <DateRangeFilter onApply={handleDateApply} onClear={handleDateClear} />
      <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm">{error}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => loadImpact(dateRange)}>Try again</Button>
    </div>
  );

  if (!impact || impact.cohorts.length === 0) return (
    <div className="space-y-4">
      <DateRangeFilter onApply={handleDateApply} onClear={handleDateClear} />
      <div className="py-12 text-center">
        <BarChart2 className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
        <p className="text-neutral-500 text-sm">No cohort data yet. Create a cohort to see impact metrics.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-neutral-600">
          Completion and certification metrics across your sponsored cohorts.
        </p>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exportingCsv} aria-label="Export impact report as CSV">
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
                      <span className={`font-medium ${d.completionRate < 30 ? 'text-red-600' : d.completionRate < 60 ? 'text-orange-600' : 'text-neutral-700'}`}>
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

const BillingTab: React.FC = () => {
  const [billing, setBilling] = useState<SponsorBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingDateRange, setBillingDateRange] = useState<DateRange | undefined>(undefined);

  const loadBilling = useCallback(async (range?: DateRange) => {
    setLoading(true);
    setError(null);
    try {
      const data = await sponsorService.getBilling(range);
      setBilling(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load billing history.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBilling(); }, [loadBilling]);

  const handleBillingDateApply = useCallback((range: DateRange) => {
    setBillingDateRange(range);
    loadBilling(range);
  }, [loadBilling]);

  const handleBillingDateClear = useCallback(() => {
    setBillingDateRange(undefined);
    loadBilling();
  }, [loadBilling]);

  if (loading) return (
    <div className="space-y-4">
      <DateRangeFilter onApply={handleBillingDateApply} onClear={handleBillingDateClear} />
      <div className="py-12 text-center text-neutral-500 text-sm">Loading billing history…</div>
    </div>
  );

  if (error) return (
    <div className="space-y-3">
      <DateRangeFilter onApply={handleBillingDateApply} onClear={handleBillingDateClear} />
      <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm">{error}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => loadBilling(billingDateRange)}>Try again</Button>
    </div>
  );

  if (!billing || billing.payments.length === 0) return (
    <div className="space-y-4">
      <DateRangeFilter onApply={handleBillingDateApply} onClear={handleBillingDateClear} />
      <div className="py-12 text-center">
        <CreditCard className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
        <p className="text-neutral-500 text-sm">No payment history. Payments will appear here when cohort payments are created.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-600">
        Payment history for your sponsored cohorts. All amounts are read-only.
      </p>

      <DateRangeFilter onApply={handleBillingDateApply} onClear={handleBillingDateClear} />

      <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
        <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-primary-50/30 px-5 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="border-0 p-0 text-neutral-900 text-sm">Payment History</CardTitle>
            <span className="text-xs text-neutral-500">{billing.total} payment{billing.total !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium">Currency</th>
                <th className="px-4 py-2.5 font-medium">Method</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {billing.payments.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="px-4 py-3 text-neutral-700">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-neutral-900">
                    ${(p.amountCents / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 uppercase text-xs">{p.currency}</td>
                  <td className="px-4 py-3 text-neutral-600 capitalize">{p.paymentMethod}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                      p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      p.status === 'waived' ? 'bg-blue-100 text-blue-800' :
                      'bg-neutral-100 text-neutral-600'
                    }`}>
                      {p.status === 'confirmed' && <CheckCircle className="h-3 w-3" aria-hidden />}
                      {p.status === 'pending' && <Clock className="h-3 w-3" aria-hidden />}
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// ─── Main Dashboard ────────────────────────────────────────────────────────

const SponsorDashboard: React.FC = () => {
  const location = useLocation();
  const [courses, setCourses] = useState<CourseAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  function getInitialTab(pathname: string): 'overview' | 'cohorts' | 'rewards' | 'impact' | 'billing' {
    if (pathname.includes('/rewards')) return 'rewards';
    if (pathname.includes('/impact')) return 'impact';
    if (pathname.includes('/billing')) return 'billing';
    return 'overview';
  }
  const [activeTab, setActiveTab] = useState<'overview' | 'cohorts' | 'rewards' | 'impact' | 'billing'>(getInitialTab(location.pathname));
  const [spendingReport, setSpendingReport] = useState<{ totalSpentCents: number; cohorts: Array<{ cohortId: string; cohortName: string; courseName: string; memberCount: number; amountCents: number; paymentStatus: string | null; createdAt: string }> } | null>(null);

  // Drill-down state: expanded courseId → student list
  const [expanded, setExpanded] = useState<Record<string, SponsorStudent[] | 'loading'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpanded({});
    try {
      const [data, report] = await Promise.all([
        analyticsService.getCourseAnalytics(),
        cohortService.getSpendingReport().catch(() => null),
      ]);
      setCourses(data);
      setSpendingReport(report);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load sponsor data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRow = useCallback(async (courseId: string) => {
    let shouldFetch = false;
    setExpanded((prev) => {
      if (prev[courseId]) {
        // Collapse
        const next = { ...prev };
        delete next[courseId];
        return next;
      }
      // Mark as loading — fetch will happen after setState
      shouldFetch = true;
      return { ...prev, [courseId]: 'loading' };
    });

    if (!shouldFetch) return;

    // Fetch outside setState — no side-effects in updaters
    try {
      const students = await analyticsService.getSponsorStudents(courseId);
      setExpanded((p) => (p[courseId] === 'loading' ? { ...p, [courseId]: students } : p));
    } catch {
      setExpanded((p) => {
        const next = { ...p };
        delete next[courseId];
        return next;
      });
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await analyticsService.exportCsv();
    } catch (e) {
      setError(getErrorMessage(e, 'CSV export failed.'));
    } finally {
      setExporting(false);
    }
  }, []);

  const groups = groupBySponsor(courses);

  return (
    <div className="pb-10 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Sponsor / Cohort Portal</h1>
          <p className="text-sm text-neutral-600 mt-0.5">
            Enrollment, wallet linking, and NFT issuance grouped by sponsor or cohort label.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" type="button" onClick={handleExport} disabled={exporting || loading}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4 mr-1.5" aria-hidden />
            )}
            Export CSV
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-neutral-200" role="tablist">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('overview')}
          aria-label="Sponsor Overview tab"
          aria-selected={activeTab === 'overview'}
          role="tab"
        >Sponsor Overview</button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'cohorts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('cohorts')}
          aria-label="Cohorts tab"
          aria-selected={activeTab === 'cohorts'}
          role="tab"
        >Cohorts</button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'rewards' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('rewards')}
          aria-label="Rewards tab"
          aria-selected={activeTab === 'rewards'}
          role="tab"
        >Rewards</button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'impact' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('impact')}
          aria-label="Impact Report tab"
          aria-selected={activeTab === 'impact'}
          role="tab"
        >Impact Report</button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'billing' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('billing')}
          aria-label="Billing tab"
          aria-selected={activeTab === 'billing'}
          role="tab"
        >Billing</button>
      </div>

      {activeTab === 'impact' ? (
        <ImpactReportTab />
      ) : activeTab === 'billing' ? (
        <BillingTab />
      ) : activeTab === 'rewards' ? (
        <div>
          <p className="text-sm text-neutral-600 mb-4">
            Manage rewards for your sponsored cohorts. Select a cohort to view and create rewards.
          </p>
          {spendingReport && spendingReport.cohorts.length > 0 ? (
            <div className="space-y-6">
              {spendingReport.cohorts.map((c) => (
                <RewardDashboard
                  key={c.cohortId}
                  role="sponsor"
                  scopeId={c.cohortId}
                  scopeLabel={c.cohortName}
                  canRefund
                />
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 text-sm py-8 text-center">No cohorts found. Create a cohort first.</p>
          )}
        </div>
      ) : activeTab === 'cohorts' ? (
        <div>
          {spendingReport && (
            <div className="grid grid-cols-2 gap-3 mb-4" data-testid="spending-summary">
              <Card className="shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-green-600 shrink-0" aria-hidden />
                  <div>
                    <p className="text-xs text-neutral-500">Total Spent (Confirmed)</p>
                    <p className="text-lg font-bold text-neutral-900" data-testid="total-spent">${(spendingReport.totalSpentCents / 100).toFixed(2)}</p>
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
          <CohortManagement courses={courses.map((c) => ({ id: c.courseId, title: c.courseName, tiersEnabled: c.tiersEnabled ?? 'both' }))} />
        </div>
      ) : (<>

      {error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-neutral-500 text-sm">Loading…</div>
      ) : courses.length === 0 ? (
        <div className="py-20 text-center">
          <Tag className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
          <p className="text-neutral-500 text-sm">
            No courses yet. Add a Sponsor / Cohort label to a course to see data here.
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
              <div className="grid grid-cols-3 gap-3 mb-4">
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
                                    {students.length === 0 ? (
                                      <p className="text-sm text-neutral-400 italic py-2">No students enrolled</p>
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

      </>)}
    </div>
  );
};

export default SponsorDashboard;
