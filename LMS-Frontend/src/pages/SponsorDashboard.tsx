import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { CohortManagement } from '../components/CohortManagement';
import { analyticsService, type CourseAnalytics, type SponsorStudent } from '../services/analyticsService';
import { cohortService } from '../services/cohortService';
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

const SponsorDashboard: React.FC = () => {
  const [courses, setCourses] = useState<CourseAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [activeTab, setActiveTab] = useState<'overview' | 'cohorts'>('overview');
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
      <div className="flex gap-1 border-b border-neutral-200">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('overview')}
        >Sponsor Overview</button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'cohorts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('cohorts')}
        >Cohorts</button>
      </div>

      {activeTab === 'cohorts' ? (
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
