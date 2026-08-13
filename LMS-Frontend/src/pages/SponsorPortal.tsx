import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { sponsorService, SponsorDashboardData, SponsorImpactReport } from '../services/sponsorService';
import { BarChart2, Users, BookOpen } from 'lucide-react';

const SponsorPortal: React.FC = () => {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<SponsorDashboardData | null>(null);
  const [impact, setImpact] = useState<SponsorImpactReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dash, imp] = await Promise.all([
          sponsorService.getDashboard(),
          sponsorService.getImpactReport(),
        ]);
        if (!cancelled) {
          setDashboard(dash);
          setImpact(imp);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading sponsor dashboard...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Sponsor Portal</h1>
      <p className="text-gray-600">Welcome, {user?.name}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-700">Active Cohorts</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.activeCohorts ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-700">Total Students</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.totalStudents ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <BarChart2 className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-700">Completion Rate</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{impact?.completionRate ?? 0}%</p>
        </div>
      </div>
    </div>
  );
};

export default SponsorPortal;
