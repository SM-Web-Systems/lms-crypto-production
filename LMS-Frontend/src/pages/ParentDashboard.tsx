/**
 * ParentDashboard — Phase G: Parent dashboard with children, wallets, groups, billing.
 * Uses URL path to determine which section to display.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { parentService, type ParentDashboardData } from '../services/parentService';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { RewardDashboard } from '../components/RewardDashboard';
import {
  Users,
  RefreshCw,
  AlertCircle,
  LayoutDashboard,
  Wallet,
  CreditCard,
} from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';

const ParentDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [dashboard, setDashboard] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const section = location.pathname.includes('/rewards')
    ? 'rewards'
    : location.pathname.includes('/children')
      ? 'children'
      : location.pathname.includes('/wallets')
        ? 'wallets'
        : location.pathname.includes('/groups')
          ? 'groups'
          : location.pathname.includes('/billing')
            ? 'billing'
            : 'dashboard';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await parentService.getDashboard();
      setDashboard(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load parent data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const firstName = (user?.name ?? 'there').trim().split(/\s+/)[0] || 'there';

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

      {error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-neutral-500 text-sm">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-accent-teal" aria-hidden />
                  <div>
                    <p className="text-sm text-neutral-500">Linked Children</p>
                    <p className="text-2xl font-bold text-neutral-900">{dashboard?.childrenCount ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(section === 'dashboard' || section === 'children') && dashboard?.children && (
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

          {section === 'wallets' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <Wallet className="h-5 w-5 text-accent-teal" aria-hidden />
                Wallets
              </h2>
              <p className="text-neutral-500 text-sm py-8 text-center">Wallet information will appear here.</p>
            </div>
          )}

          {section === 'rewards' && dashboard?.groups && (
            <div className="space-y-6">
              {dashboard.groups.length > 0 ? (
                dashboard.groups.map((g: { id: string; name: string }) => (
                  <RewardDashboard key={g.id} role="parent" scopeId={g.id} scopeLabel={g.name} />
                ))
              ) : (
                <p className="text-neutral-500 text-sm py-8 text-center">Create a family group first to manage rewards.</p>
              )}
            </div>
          )}

          {section === 'groups' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900">Groups</h2>
              <p className="text-neutral-500 text-sm py-8 text-center">Group management will appear here.</p>
            </div>
          )}

          {section === 'billing' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-accent-teal" aria-hidden />
                Billing
              </h2>
              <p className="text-neutral-500 text-sm py-8 text-center">Billing data will appear here.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ParentDashboard;
