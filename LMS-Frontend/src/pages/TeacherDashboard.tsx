/**
 * TeacherDashboard — Phase G: Teacher dashboard with classes, analytics, billing.
 * Uses URL path to determine which section to display.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { teacherService, type TeacherDashboardData } from '../services/teacherService';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { RewardDashboard } from '../components/RewardDashboard';
import {
  Users,
  RefreshCw,
  AlertCircle,
  LayoutDashboard,
  Plus,
  BarChart2,
  CreditCard,
  BookOpen,
} from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';

const TeacherDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [dashboard, setDashboard] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const section = location.pathname.includes('/rewards')
    ? 'rewards'
    : location.pathname.includes('/classes')
      ? 'classes'
      : location.pathname.includes('/analytics')
        ? 'analytics'
        : location.pathname.includes('/billing')
          ? 'billing'
          : 'dashboard';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await teacherService.getDashboard();
      setDashboard(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load teacher data.'));
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
            Teacher Portal
          </p>
          <h1 className="text-2xl font-bold text-neutral-900">Welcome, {firstName}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Manage your classes and track student progress.
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
                  <BookOpen className="h-8 w-8 text-accent-teal" aria-hidden />
                  <div>
                    <p className="text-sm text-neutral-500">Total Classes</p>
                    <p className="text-2xl font-bold text-neutral-900">{dashboard?.totalClasses ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-blue-500" aria-hidden />
                  <div>
                    <p className="text-sm text-neutral-500">Total Students</p>
                    <p className="text-2xl font-bold text-neutral-900">{dashboard?.totalStudents ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(section === 'dashboard' || section === 'classes') && dashboard?.classes && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-neutral-900">Your Classes</h2>
                <Button variant="primary" size="sm" type="button">
                  <Plus className="h-4 w-4 mr-1" aria-hidden />
                  New Class
                </Button>
              </div>
              {dashboard.classes.length === 0 ? (
                <p className="text-neutral-500 text-sm py-8 text-center">No classes created yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dashboard.classes.map((cls) => (
                    <Card key={cls.id}>
                      <CardContent className="py-4">
                        <p className="font-semibold text-neutral-900">{cls.name}</p>
                        <p className="text-xs text-neutral-500">{cls.studentCount} students</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === 'rewards' && dashboard?.classes && (
            <div className="space-y-6">
              {dashboard.classes.length > 0 ? (
                dashboard.classes.map((cls: { id: string; name: string }) => (
                  <RewardDashboard key={cls.id} role="teacher" scopeId={cls.id} scopeLabel={cls.name} />
                ))
              ) : (
                <p className="text-neutral-500 text-sm py-8 text-center">Create a class first to manage rewards.</p>
              )}
            </div>
          )}

          {section === 'analytics' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-accent-teal" aria-hidden />
                Analytics
              </h2>
              <p className="text-neutral-500 text-sm py-8 text-center">Analytics data will appear here.</p>
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

export default TeacherDashboard;
