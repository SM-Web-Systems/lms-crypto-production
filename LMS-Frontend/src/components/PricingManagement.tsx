import { useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { DollarSign, AlertCircle, Pencil } from 'lucide-react';
import { adminCertificateService } from '../services/adminCertificateService';
import { courseCompletionService } from '../services/courseCompletionService';
import { analyticsService } from '../services/analyticsService';

interface CourseWithPricing {
  courseId: string;
  courseName: string;
  priceCents: number;
  isFree: boolean;
}

type PanelState = 'loading' | 'error' | 'empty' | 'data';

export function PricingManagement() {
  const [courses, setCourses] = useState<CourseWithPricing[]>([]);
  const [state, setState] = useState<PanelState>('loading');
  const [editingCourse, setEditingCourse] = useState<CourseWithPricing | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      const analytics = await analyticsService.getCourseAnalytics();
      const withPricing: CourseWithPricing[] = [];
      for (const c of analytics) {
        try {
          const pricing = await courseCompletionService.getPricing(c.courseId);
          withPricing.push({
            courseId: c.courseId,
            courseName: c.courseName,
            priceCents: pricing?.priceCents ?? 0,
            isFree: pricing?.isFree ?? true,
          });
        } catch {
          withPricing.push({
            courseId: c.courseId,
            courseName: c.courseName,
            priceCents: 0,
            isFree: true,
          });
        }
      }
      setCourses(withPricing);
      setState(withPricing.length === 0 ? 'empty' : 'data');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEdit = (course: CourseWithPricing) => {
    setEditingCourse(course);
    setPriceInput((course.priceCents / 100).toFixed(2));
  };

  const savePrice = async () => {
    if (!editingCourse) return;
    const cents = Math.round(parseFloat(priceInput || '0') * 100);
    if (isNaN(cents) || cents < 0) return;
    setSaving(true);
    try {
      await adminCertificateService.setCoursePricing(editingCourse.courseId, cents);
      setEditingCourse(null);
      load();
    } catch {
      // error handled silently
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5" />
          Certificate Pricing
        </CardTitle>

        {state === 'loading' && (
          <div className="animate-pulse space-y-2 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-neutral-200 rounded" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="mt-4 flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load pricing</span>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </div>
        )}

        {state === 'empty' && (
          <p className="mt-4 text-sm text-neutral-500">No courses found.</p>
        )}

        {state === 'data' && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-neutral-500">
                  <th className="pb-2 font-medium">Course</th>
                  <th className="pb-2 font-medium">Price</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.courseId} className="border-b last:border-0">
                    <td className="py-2">{c.courseName}</td>
                    <td className="py-2">
                      {c.isFree ? (
                        <span className="text-green-600 font-medium">Free</span>
                      ) : (
                        <span className="font-medium">${(c.priceCents / 100).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                        <Pencil className="h-3 w-3 mr-1" />
                        {c.isFree ? 'Set Price' : 'Edit'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingCourse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
              <h3 className="text-lg font-semibold mb-4">Set Certificate Price</h3>
              <p className="text-sm text-neutral-600 mb-3">
                Course: {editingCourse.courseName}
              </p>
              <label className="block text-sm font-medium mb-1">Price (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-full border rounded px-3 py-2 mb-2"
                placeholder="0.00"
              />
              <p className="text-xs text-neutral-500 mb-4">Set to $0 for free certificates</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingCourse(null)}>Cancel</Button>
                <Button onClick={savePrice} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Price'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
