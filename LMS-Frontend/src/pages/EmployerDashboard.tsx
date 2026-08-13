/**
 * EmployerDashboard — Phase G: Employer dashboard with team management.
 * Reads URL path to show the appropriate section (dashboard/teams/billing).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { employerService, type EmployerDashboardData, type EmployerTeam } from '../services/employerService';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import {
  Users,
  RefreshCw,
  AlertCircle,
  LayoutDashboard,
  Plus,
  CreditCard,
} from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';

const EmployerDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [dashboard, setDashboard] = useState<EmployerDashboardData | null>(null);
  const [teams, setTeams] = useState<EmployerTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine active section from URL
  const section = location.pathname.includes('/teams')
    ? 'teams'
    : location.pathname.includes('/billing')
      ? 'billing'
      : 'dashboard';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await employerService.getDashboard();
      setDashboard(data);
      if (section === 'teams') {
        const t = await employerService.getTeams();
        setTeams(t);
      }
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load employer data.'));
    } finally {
      setLoading(false);
    }
  }, [section]);

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
            Employer Portal
          </p>
          <h1 className="text-2xl font-bold text-neutral-900">Welcome, {firstName}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Manage your teams and track employee learning progress.
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
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-accent-teal" aria-hidden />
                  <div>
                    <p className="text-sm text-neutral-500">Total Teams</p>
                    <p className="text-2xl font-bold text-neutral-900">{dashboard?.totalTeams ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-blue-500" aria-hidden />
                  <div>
                    <p className="text-sm text-neutral-500">Total Members</p>
                    <p className="text-2xl font-bold text-neutral-900">{dashboard?.totalMembers ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Teams list */}
          {section === 'teams' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-neutral-900">Your Teams</h2>
                <Button variant="primary" size="sm" type="button">
                  <Plus className="h-4 w-4 mr-1" aria-hidden />
                  New Team
                </Button>
              </div>
              {teams.length === 0 ? (
                <p className="text-neutral-500 text-sm py-8 text-center">No teams created yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {teams.map((team) => (
                    <Card key={team.id}>
                      <CardContent className="py-4">
                        <p className="font-semibold text-neutral-900">{team.name}</p>
                        <p className="text-xs text-neutral-500">{team.member_count} members</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Billing section */}
          {section === 'billing' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-accent-teal" aria-hidden />
                Billing
              </h2>
              <p className="text-neutral-500 text-sm py-8 text-center">Billing data will appear here.</p>
            </div>
          )}

          {/* Default dashboard view — team overview */}
          {section === 'dashboard' && dashboard?.teams && dashboard.teams.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900">Team Overview</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboard.teams.map((team) => (
                  <Card key={team.id}>
                    <CardContent className="py-4">
                      <p className="font-semibold text-neutral-900">{team.name}</p>
                      <p className="text-xs text-neutral-500">{team.member_count} members</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EmployerDashboard;
