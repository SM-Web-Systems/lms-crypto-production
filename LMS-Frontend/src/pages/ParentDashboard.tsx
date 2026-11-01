/**
 * ParentDashboard — Phase G: Parent dashboard with children and rewards.
 * Uses URL path to determine which section to display.
 * Wallets, Groups, Billing routes redirect to /parent (deferred — FOLLOW-UP(parent-wallet-group-billing-ui)).
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { parentService, type ParentDashboardData, type ParentGroup } from '../services/parentService';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { RewardDashboard } from '../components/RewardDashboard';
import {
  Users,
  RefreshCw,
  AlertCircle,
  LayoutDashboard,
} from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';

const ParentDashboardContent: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [dashboard, setDashboard] = useState<ParentDashboardData | null>(null);
  const [groups, setGroups] = useState<ParentGroup[]>([]);
  // W09-R3: independent loading states — each section settles and renders on its own.
  // A stalled dashboard request no longer blocks the rewards section, and vice versa.
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  // W09-R1: monotonic request counter — each load() invocation captures its generation.
  // State is only committed when reqIdRef.current still matches, preventing a superseded
  // request (e.g. Refresh clicked while initial load is pending) from overwriting newer data.
  const reqIdRef = useRef(0);

  const section = location.pathname.includes('/rewards')
    ? 'rewards'
    : location.pathname.includes('/children')
      ? 'children'
      : 'dashboard';

  const load = useCallback(() => {
    const myReqId = ++reqIdRef.current;
    setDashboardLoading(true);
    setGroupsLoading(true);
    setError(null);
    setGroupsError(null);

    // W09-R3: launch concurrently but commit each result as it settles independently.
    // The reqIdRef guard ensures only the latest load() generation commits state.
    parentService.getDashboard().then(
      (data) => {
        if (reqIdRef.current !== myReqId) return;
        setDashboard(data);
        setDashboardLoading(false);
      },
      (err) => {
        if (reqIdRef.current !== myReqId) return;
        setDashboard(null);
        setError(getErrorMessage(err, 'Could not load parent data.'));
        setDashboardLoading(false);
      },
    );

    parentService.getGroups().then(
      (data) => {
        if (reqIdRef.current !== myReqId) return;
        setGroups(data);
        setGroupsLoading(false);
      },
      (err) => {
        if (reqIdRef.current !== myReqId) return;
        setGroups([]);
        setGroupsError(getErrorMessage(err, 'Could not load family groups.'));
        setGroupsLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    load();
    // Invalidate any in-flight request on unmount so it cannot commit state after cleanup.
    return () => { ++reqIdRef.current; };
  }, [load]);

  const firstName = (user?.name ?? 'there').trim().split(/\s+/)[0] || 'there';

  // Show a full-page spinner only while both sections are still loading (nothing to show yet).
  const bothLoading = dashboardLoading && groupsLoading;

  return (
    <div className="pb-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-dark ring-1 ring-neutral-200/80 shadow-sm mb-2">
            <LayoutDashboard className="h-3.5 w-3.5 text-accent-teal" aria-hidden />
            Parent Portal
          </p>
          <h1 className="text-2xl font-bold text-neutral-900">Welcome, {firstName}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Monitor your children's learning progress and manage accounts.
          </p>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden />
          Refresh
        </Button>
      </div>

      {bothLoading ? (
        <div className="py-16 text-center text-neutral-500 text-sm">Loading...</div>
      ) : (
        <>
          {/* Dashboard section — renders as soon as getDashboard settles */}
          {(section === 'dashboard' || section === 'children') && (
            dashboardLoading ? (
              <div className="py-8 text-center text-neutral-500 text-sm">Loading...</div>
            ) : (
              <>
                {error && (
                  <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
                    <p className="text-sm">{error}</p>
                  </div>
                )}
                {/* W09-R1: only render metric card when dashboard loaded successfully.
                    dashboard===null means getDashboard failed; showing 0 would falsely claim
                    no children when the count is actually unknown. */}
                {dashboard !== null && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="py-4">
                        <div className="flex items-center gap-3">
                          <Users className="h-8 w-8 text-accent-teal" aria-hidden />
                          <div>
                            <p className="text-sm text-neutral-500">Linked Children</p>
                            <p className="text-2xl font-bold text-neutral-900">{dashboard.childrenCount}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
                {dashboard?.children && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold text-neutral-900">Children</h2>
                    {dashboard.children.length === 0 ? (
                      <p className="text-neutral-500 text-sm py-8 text-center">No linked children yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {dashboard.children.map((child) => (
                          <Card key={child.id}>
                            <CardContent className="py-4">
                              <p className="font-semibold text-neutral-900">{child.name}</p>
                              <p className="text-xs text-neutral-500">{child.email}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          )}

          {/* Rewards section — renders as soon as getGroups settles */}
          {section === 'rewards' && (
            groupsLoading ? (
              <div className="py-8 text-center text-neutral-500 text-sm">Loading...</div>
            ) : (
              <div className="space-y-6">
                {groupsError ? (
                  <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900" role="alert">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
                    <div className="flex-1">
                      <p className="text-sm">{groupsError}</p>
                      <Button variant="outline" size="sm" type="button" className="mt-2" onClick={load}>
                        Try again
                      </Button>
                    </div>
                  </div>
                ) : groups.length > 0 ? (
                  groups.map((g) => (
                    <RewardDashboard key={g.id} role="parent" scopeId={g.id} scopeLabel={g.name} targetType="family" />
                  ))
                ) : (
                  <p className="text-neutral-500 text-sm py-8 text-center">Create a family group first to manage rewards.</p>
                )}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};

// A new identity must never inherit another parent's data or outstanding requests.
// The key resets all view state synchronously and cleanup invalidates old requests.
const ParentDashboard: React.FC = () => {
  const { user } = useAuth();
  return user?.id ? <ParentDashboardContent key={user.id} /> : null;
};

export default ParentDashboard;
