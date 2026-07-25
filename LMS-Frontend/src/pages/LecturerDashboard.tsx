import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { courseService } from '../services/courseService';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import {
  BookOpen,
  Users,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  LayoutDashboard,
} from 'lucide-react';
import type { Course } from '../types/course';
import { getErrorMessage } from '../utils/apiError';

const LecturerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await courseService.fetchCourses();
      setCourses(list);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load courses.'));
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-dark ring-1 ring-neutral-200/80 shadow-sm mb-2">
            <LayoutDashboard className="h-3.5 w-3.5 text-accent-teal" aria-hidden />
            Lecturer portal
          </p>
          <h1 className="text-2xl font-bold text-neutral-900">Welcome, {firstName}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Your assigned courses — review student progress and add recommendations.
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
        <div className="py-16 text-center text-neutral-500 text-sm">Loading courses…</div>
      ) : courses.length === 0 ? (
        <div className="py-16 text-center">
          <BookOpen className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
          <p className="text-neutral-500 text-sm">No courses assigned yet.</p>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-bold text-neutral-900">Your courses</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {courses.map((course) => (
              <Card
                key={course.id}
                className="shadow-card hover:shadow-updraft transition-all ring-1 ring-neutral-900/[0.03] overflow-hidden hover:-translate-y-0.5 cursor-pointer"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-teal/15 text-accent-teal">
                      <BookOpen className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-neutral-900 truncate">{course.title}</p>
                      {course.courseCode && (
                        <p className="text-xs text-neutral-500 mt-0.5 font-mono">{course.courseCode}</p>
                      )}
                      {course.description && (
                        <p className="text-xs text-neutral-600 mt-1 line-clamp-2">{course.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button
                      size="sm"
                      type="button"
                      className="w-full text-xs justify-center"
                      onClick={() => navigate(`/lecturer/courses/${course.id}`)}
                    >
                      <Users className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                      Student progress
                      <ArrowRight className="h-3.5 w-3.5 ml-auto" aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default LecturerDashboard;
