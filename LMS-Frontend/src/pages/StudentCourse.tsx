import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { Card, CardContent } from '../components/Card';
import { EmbeddedMaterialViewer } from '../components/EmbeddedMaterialViewer';
import { courseService } from '../services/courseService';
import { courseCompletionService } from '../services/courseCompletionService';
import { getErrorMessage } from '../utils/apiError';
import { getCourseWeeks, type CourseSection, type CourseItem } from '../types/course';
import type { Course } from '../types/course';
import {
  Play,
  ExternalLink,
  FileText,
  BookOpen,
  Target,
  CheckCircle,
  ChevronDown,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Circle,
  AlignLeft,
  Headphones,
  ClipboardCheck,
  Upload,
  Download,
} from 'lucide-react';
import { shouldOpenVideoInModal } from '../utils/mediaUrl';

const STORAGE_PREFIX = 'lms:studentCourseView:';

function courseViewStorageKey(userId: string | undefined) {
  return `${STORAGE_PREFIX}${userId ?? 'anon'}`;
}

type StoredCourseView = { courseId: string; weekId: string | null };

function readStoredCourseView(userId: string | undefined): StoredCourseView | null {
  try {
    const raw = localStorage.getItem(courseViewStorageKey(userId));
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return null;
    const courseId = (j as { courseId?: unknown }).courseId;
    const weekId = (j as { weekId?: unknown }).weekId;
    if (typeof courseId !== 'string') return null;
    return {
      courseId,
      weekId: typeof weekId === 'string' ? weekId : null,
    };
  } catch {
    return null;
  }
}

function weekKeyForCourse(userId: string | undefined, courseId: string) {
  return `lms:studentCourseWeek:${userId ?? 'anon'}:${courseId}`;
}

function readLastWeekForCourse(userId: string | undefined, courseId: string): string | null {
  try {
    return localStorage.getItem(weekKeyForCourse(userId, courseId));
  } catch {
    return null;
  }
}

function writeStoredCourseView(userId: string | undefined, courseId: string, weekId: string | null) {
  try {
    localStorage.setItem(courseViewStorageKey(userId), JSON.stringify({ courseId, weekId }));
    if (userId && weekId) {
      localStorage.setItem(weekKeyForCourse(userId, courseId), weekId);
    }
  } catch {
    /* quota / private mode */
  }
}

function countCourseMaterials(course: Course): number {
  return getCourseWeeks(course).reduce(
    (sum, w) => sum + w.sections.reduce((s, sec) => s + sec.items.length, 0),
    0
  );
}

function computeCourseProgressPct(course: Course, lastWeekId: string | null): number {
  const weeks = getCourseWeeks(course);
  if (weeks.length === 0 || !lastWeekId) return 0;
  const idx = weeks.findIndex((w) => w.id === lastWeekId);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / weeks.length) * 100);
}

/** Ordered path through the course (all weeks → sections → items). */
type CoursePathEntry = { weekId: string; sectionId: string; item: CourseItem };

function flatItemsForCourse(course: Course): CoursePathEntry[] {
  const out: CoursePathEntry[] = [];
  for (const w of getCourseWeeks(course)) {
    for (const sec of w.sections) {
      for (const item of [...sec.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        out.push({ weekId: w.id, sectionId: sec.id, item });
      }
    }
  }
  return out;
}

function doneIdsStorageKey(userId: string | undefined, courseId: string) {
  return `lms:courseItemDone:${userId ?? 'anon'}:${courseId}`;
}

function readDoneIds(userId: string | undefined, courseId: string): Set<string> {
  try {
    const raw = localStorage.getItem(doneIdsStorageKey(userId, courseId));
    if (!raw) return new Set();
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return new Set();
    return new Set(j.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeDoneIds(userId: string | undefined, courseId: string, ids: Set<string>) {
  try {
    localStorage.setItem(doneIdsStorageKey(userId, courseId), JSON.stringify([...ids]));
  } catch {
    /* quota / private mode */
  }
}

function countDoneInCourse(course: Course, done: Set<string>): number {
  return flatItemsForCourse(course).filter((x) => done.has(x.item.id)).length;
}

/** Prefer materials completed; fall back to “furthest week” when nothing marked yet. */
function courseCardProgressPct(course: Course, userId: string | undefined): number {
  const total = countCourseMaterials(course);
  if (total === 0) return 0;
  const done = readDoneIds(userId, course.id);
  if (done.size > 0) return Math.round((countDoneInCourse(course, done) / total) * 100);
  return computeCourseProgressPct(course, readLastWeekForCourse(userId, course.id));
}

const COURSE_CARD_ACCENTS = [
  { bar: 'bg-accent-teal', glow: 'from-accent-teal/30', subtle: 'to-accent-teal/5', ringSel: 'ring-accent-teal/50' },
  { bar: 'bg-amber-500', glow: 'from-amber-400/35', subtle: 'to-amber-500/5', ringSel: 'ring-amber-400/50' },
  { bar: 'bg-sky-600', glow: 'from-sky-500/35', subtle: 'to-sky-600/5', ringSel: 'ring-sky-500/45' },
  { bar: 'bg-rose-500', glow: 'from-rose-400/35', subtle: 'to-rose-500/5', ringSel: 'ring-rose-400/45' },
] as const;

function CoursePageSkeleton() {
  const pulse = 'animate-pulse rounded-md bg-neutral-200/80';
  return (
    <>
    <div className="mb-6 max-w-prose space-y-2" aria-busy="true" aria-label="Loading courses">
      <div className={`h-8 w-48 ${pulse}`} />
      <div className={`h-4 w-full max-w-md ${pulse}`} />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`rounded-2xl border border-neutral-200/90 bg-white p-5 h-52 ${pulse}`} />
      ))}
    </div>
    <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card overflow-hidden flex flex-col min-h-[min(70vh,calc(100vh-8rem))] ring-1 ring-neutral-900/5">
      <div className="border-b border-neutral-200 bg-gradient-to-b from-white to-neutral-50/90 px-4 py-4 sm:px-5 space-y-3">
        <div className={`h-6 w-64 max-w-full ${pulse}`} />
        <div className={`h-4 max-w-prose w-full ${pulse}`} />
        <div className={`h-3 w-40 ${pulse}`} />
      </div>
      <div className="flex flex-1 min-h-[280px] flex-col lg:flex-row">
        <div className="hidden lg:flex lg:w-52 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/90 p-3 gap-2">
          <div className={`h-3 w-12 ${pulse}`} />
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-14 w-full ${pulse}`} />
          ))}
        </div>
        <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-4 bg-neutral-50/50">
          <div className={`h-36 w-full max-w-2xl ${pulse}`} />
          <div className={`h-36 w-full max-w-2xl ${pulse}`} />
        </div>
      </div>
    </div>
    </>
  );
}

const StudentCourse: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const qCourse = searchParams.get('course');
  const qWeek = searchParams.get('week');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await courseService.fetchCourses();
      setCourses(list);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load your courses.'));
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchCourses();
    else {
      setCourses([]);
      setLoading(false);
    }
  }, [user, fetchCourses]);

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const skipNextUrlSync = useRef(false);

  /**
   * URL drives screen: no ?course= → course picker only. Valid ?course= → breakdown (bookmarkable).
   */
  useEffect(() => {
    if (loading || courses.length === 0) return;

    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }

    const stored = readStoredCourseView(user?.id);
    const hasCourseParam = qCourse != null && qCourse !== '';
    const courseValid = hasCourseParam && courses.some((c) => c.id === qCourse);

    if (hasCourseParam && !courseValid) {
      setSelectedCourseId(null);
      setSelectedWeekId(null);
      setSearchParams(new URLSearchParams(), { replace: true });
      return;
    }

    if (!courseValid) {
      setSelectedCourseId((prev) => (prev === null ? prev : null));
      setSelectedWeekId((prev) => (prev === null ? prev : null));
      if (qWeek) {
        setSearchParams(new URLSearchParams(), { replace: true });
      }
      return;
    }

    const nextCourseId = qCourse!;
    const courseObj = courses.find((c) => c.id === nextCourseId)!;
    const weeks = getCourseWeeks(courseObj);

    let nextWeekId: string | null = null;
    if (weeks.length > 0) {
      const hasWeekParam = qWeek != null && qWeek !== '';
      const weekValid = hasWeekParam && weeks.some((w) => w.id === qWeek);
      if (weekValid) {
        nextWeekId = qWeek!;
      } else if (
        !hasWeekParam &&
        stored?.courseId === nextCourseId &&
        stored.weekId &&
        weeks.some((w) => w.id === stored.weekId)
      ) {
        nextWeekId = stored.weekId;
      } else {
        nextWeekId = weeks[0].id;
      }
    }

    setSelectedCourseId((prev) => (prev === nextCourseId ? prev : nextCourseId));
    setSelectedWeekId((prev) => (prev === nextWeekId ? prev : nextWeekId));

    const urlWeek = qWeek ?? '';
    const targetWeek = nextWeekId ?? '';
    if (qCourse !== nextCourseId || urlWeek !== targetWeek) {
      const p = new URLSearchParams();
      p.set('course', nextCourseId);
      if (nextWeekId) p.set('week', nextWeekId);
      setSearchParams(p, { replace: true });
    }

    writeStoredCourseView(user?.id, nextCourseId, nextWeekId);
  }, [loading, courses, qCourse, qWeek, user?.id, setSearchParams]);

  const selectedCourse = useMemo(
    () => (selectedCourseId ? courses.find((c) => c.id === selectedCourseId) ?? null : null),
    [courses, selectedCourseId]
  );

  const selectedWeeks = useMemo(
    () => (selectedCourse ? getCourseWeeks(selectedCourse) : []),
    [selectedCourse]
  );

  const activeWeek = selectedWeeks.find((w) => w.id === selectedWeekId) ?? selectedWeeks[0] ?? null;

  const flatPath = useMemo(
    () => (selectedCourse ? flatItemsForCourse(selectedCourse) : []),
    [selectedCourse]
  );

  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!selectedCourseId) {
      setDoneItemIds(new Set());
      return;
    }
    setDoneItemIds(readDoneIds(user?.id, selectedCourseId));
  }, [selectedCourseId, user?.id]);

  // Seed lesson completions from server + poll every 30s for auto-completions
  useEffect(() => {
    if (!selectedCourseId || !user?.id) return;
    let cancelled = false;

    const sync = () => {
      courseCompletionService.getLessonCompletions(selectedCourseId).then((ids) => {
        if (cancelled || ids.length === 0) return;
        setDoneItemIds((prev) => {
          let changed = false;
          const merged = new Set(prev);
          for (const id of ids) {
            if (!merged.has(id)) { merged.add(id); changed = true; }
          }
          if (changed) writeDoneIds(user.id, selectedCourseId, merged);
          return changed ? merged : prev;
        });
      }).catch(() => { /* best-effort polling */ });
    };

    sync();
    const interval = setInterval(sync, 30_000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedCourseId, user?.id]);

  useEffect(() => {
    if (!selectedCourse || !selectedWeekId) return;
    if (flatPath.length === 0) {
      setFocusItemId(null);
      return;
    }
    setFocusItemId((prev) => {
      if (prev && flatPath.some((x) => x.item.id === prev && x.weekId === selectedWeekId)) {
        return prev;
      }
      const firstInWeek = flatPath.find((x) => x.weekId === selectedWeekId);
      return firstInWeek?.item.id ?? null;
    });
  }, [selectedCourse?.id, selectedWeekId, flatPath]);

  const pathIndex = useMemo(() => {
    if (!focusItemId) return -1;
    return flatPath.findIndex((x) => x.item.id === focusItemId);
  }, [flatPath, focusItemId]);

  useEffect(() => {
    if (!focusItemId) return;
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`course-item-${focusItemId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusItemId, selectedWeekId]);

  const pushCourseWeekToUrl = useCallback(
    (courseId: string, weekId: string | null) => {
      skipNextUrlSync.current = true;
      const p = new URLSearchParams(searchParams);
      p.set('course', courseId);
      if (weekId) p.set('week', weekId);
      else p.delete('week');
      setSearchParams(p, { replace: false });
      writeStoredCourseView(user?.id, courseId, weekId);
    },
    [searchParams, setSearchParams, user?.id]
  );

  const handleCourseChange = useCallback(
    (newCourseId: string) => {
      const c = courses.find((x) => x.id === newCourseId);
      const weeks = c ? getCourseWeeks(c) : [];
      const firstWeek = weeks[0]?.id ?? null;
      setSelectedCourseId(newCourseId);
      setSelectedWeekId(firstWeek);
      pushCourseWeekToUrl(newCourseId, firstWeek);
    },
    [courses, pushCourseWeekToUrl]
  );

  const handleWeekChange = useCallback(
    (weekId: string, focusItemIdOverride?: string | null) => {
      if (!selectedCourseId) return;
      setSelectedWeekId(weekId);
      pushCourseWeekToUrl(selectedCourseId, weekId);
      if (focusItemIdOverride != null && focusItemIdOverride !== '') {
        setFocusItemId(focusItemIdOverride);
        return;
      }
      if (selectedCourse) {
        const first = flatItemsForCourse(selectedCourse).find((x) => x.weekId === weekId);
        setFocusItemId(first?.item.id ?? null);
      } else {
        setFocusItemId(null);
      }
    },
    [selectedCourseId, selectedCourse, pushCourseWeekToUrl]
  );

  const goNextMaterial = useCallback(() => {
    if (!selectedCourse || pathIndex < 0 || pathIndex >= flatPath.length - 1) return;
    const next = flatPath[pathIndex + 1]!;
    handleWeekChange(next.weekId, next.item.id);
  }, [selectedCourse, flatPath, pathIndex, handleWeekChange]);

  const goPrevMaterial = useCallback(() => {
    if (!selectedCourse || pathIndex <= 0) return;
    const prev = flatPath[pathIndex - 1]!;
    handleWeekChange(prev.weekId, prev.item.id);
  }, [selectedCourse, flatPath, pathIndex, handleWeekChange]);

  const [materialViewer, setMaterialViewer] = useState<{ section: CourseSection; item: CourseItem } | null>(null);
  const [objectiveOpen, setObjectiveOpen] = useState<Record<string, boolean>>({});

  const handleBackToCourses = useCallback(() => {
    skipNextUrlSync.current = true;
    setSelectedCourseId(null);
    setSelectedWeekId(null);
    setFocusItemId(null);
    setMaterialViewer(null);
    setObjectiveOpen({});
    const p = new URLSearchParams(searchParams);
    p.delete('course');
    p.delete('week');
    setSearchParams(p, { replace: false });
  }, [searchParams, setSearchParams]);

  const toggleDoneItem = useCallback(
    (itemId: string) => {
      if (!selectedCourseId) return;
      setDoneItemIds((prev) => {
        const next = new Set(prev);
        const adding = !prev.has(itemId);
        if (adding) next.add(itemId);
        else next.delete(itemId);
        writeDoneIds(user?.id, selectedCourseId, next);
        // Sync to server when marking done (fire-and-forget; no un-complete endpoint)
        if (adding) {
          courseCompletionService.markLessonComplete(selectedCourseId, itemId).catch(() => {/* best-effort */});
        }
        return next;
      });
    },
    [selectedCourseId, user?.id]
  );

  const markItemEngaged = useCallback(
    (itemId: string) => {
      if (!selectedCourseId) return;
      setDoneItemIds((prev) => {
        if (prev.has(itemId)) return prev;
        const next = new Set(prev);
        next.add(itemId);
        writeDoneIds(user?.id, selectedCourseId, next);
        courseCompletionService.markLessonComplete(selectedCourseId, itemId).catch(() => {/* best-effort */});
        return next;
      });
    },
    [selectedCourseId, user?.id]
  );

  const openMaterialViewer = useCallback((section: CourseSection, item: CourseItem) => {
    setMaterialViewer({ section, item });
    setFocusItemId(item.id);
    markItemEngaged(item.id);
  }, [markItemEngaged]);

  useEffect(() => {
    const openId = materialViewer?.item.id;
    if (!openId || !selectedCourse || !focusItemId) return;
    if (openId === focusItemId) return;
    const entry = flatPath.find((x) => x.item.id === focusItemId);
    if (!entry) return;
    const wk = getCourseWeeks(selectedCourse).find((w) => w.id === entry.weekId);
    const sec = wk?.sections.find((s) => s.id === entry.sectionId);
    if (!sec) return;
    setMaterialViewer({ section: sec, item: entry.item });
  }, [materialViewer?.item.id, focusItemId, flatPath, selectedCourse]);

  const userInitials = useMemo(() => {
    const n = user?.name?.trim();
    if (!n) return '?';
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }, [user?.name]);

  if (loading) {
    return <CoursePageSkeleton />;
  }

  if (error) {
    return (
      <div className="mb-8">
        <BookOpen className="h-8 w-8 text-primary-600 mr-3 mb-4" />
        <h1 className="text-3xl font-bold text-neutral-800">My courses</h1>
        <p className="text-neutral-600 mt-2 text-red-600">{error}</p>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="mb-8">
        <BookOpen className="h-8 w-8 text-primary-600 mr-3 mb-4" />
        <h1 className="text-3xl font-bold text-neutral-800">My courses</h1>
        <p className="text-neutral-600 mt-2">You are not enrolled in any courses yet. Contact your instructor to get access.</p>
      </div>
    );
  }

  const itemCountForWeek = (week: (typeof selectedWeeks)[0]) =>
    week.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div>
      {!selectedCourseId ? (
        <>
          <div className="mb-6 max-w-prose">
            <h1 className="text-2xl font-bold text-neutral-800 tracking-tight">My courses</h1>
            <p className="text-neutral-600 mt-1.5 text-[15px] leading-relaxed">
              Open a course to follow materials in order with Previous / Next, mark items done, and track progress on
              each card (materials completed, or furthest week if you have not marked any yet).
            </p>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 pb-8"
            role="list"
            aria-label="Your courses"
          >
        {courses.map((c, index) => {
          const accent = COURSE_CARD_ACCENTS[index % COURSE_CARD_ACCENTS.length];
          const weeks = getCourseWeeks(c);
          const pct = courseCardProgressPct(c, user?.id);
          const materials = countCourseMaterials(c);
          const selected = Boolean(selectedCourseId && c.id === selectedCourseId);
          const lastW = readLastWeekForCourse(user?.id, c.id);
          const doneForCard = countDoneInCourse(c, readDoneIds(user?.id, c.id));
          const weekIdx = lastW ? weeks.findIndex((w) => w.id === lastW) : -1;
          const weekLabel =
            weeks.length === 0
              ? 'No weeks yet'
              : weekIdx >= 0
                ? `${weeks[weekIdx].title} · ${weekIdx + 1}/${weeks.length}`
                : 'Not started';

          return (
            <button
              key={c.id}
              type="button"
              role="listitem"
              onClick={() => handleCourseChange(c.id)}
              className={[
                'relative text-left rounded-2xl border bg-white p-5 sm:p-6 shadow-updraft transition-all duration-200 overflow-hidden group',
                'hover:shadow-updraft-hover hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-teal',
                selected
                  ? `border-accent-teal/50 ring-2 ${accent.ringSel} shadow-md`
                  : 'border-neutral-200/90 ring-1 ring-neutral-900/[0.04] hover:border-neutral-300',
              ].join(' ')}
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br ${accent.glow} ${accent.subtle} opacity-90`}
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-2 mb-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 tabular-nums">
                  {c.courseCode ? `Code · ${c.courseCode}` : `${weeks.length} week${weeks.length !== 1 ? 's' : ''}`}
                </span>
                <BookOpen
                  className={`h-5 w-5 shrink-0 transition-colors ${selected ? 'text-accent-teal' : 'text-neutral-400 group-hover:text-accent-teal'}`}
                  aria-hidden
                />
              </div>
              <h2 className="relative text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-snug pr-2">
                {c.title}
              </h2>
              <p className="relative text-sm text-neutral-600 mt-1.5 line-clamp-2 min-h-[2.5rem]">
                {c.description?.trim() || 'Course materials, videos, and documents in one place.'}
              </p>
              <div className="relative mt-5">
                <div className="flex items-center justify-between text-xs font-medium text-neutral-600 mb-1.5">
                  <span>Progress</span>
                  <span className="tabular-nums text-neutral-800">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-neutral-200/90 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${accent.bar} transition-[width] duration-500 ease-out`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="relative mt-5 pt-4 border-t border-neutral-200/80 flex items-center justify-between gap-2">
                <div className="flex items-center -space-x-2">
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-dark text-[10px] font-bold text-white ring-2 ring-white"
                    title={user?.name ?? 'You'}
                  >
                    {userInitials}
                  </span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 ring-2 ring-white text-xs font-semibold">
                    +
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-neutral-600 bg-neutral-100/90 border border-neutral-200/80 rounded-full px-2.5 py-1 tabular-nums max-w-[55%] truncate text-right">
                  {materials > 0 ? `${doneForCard}/${materials} done` : 'No materials'} · {weekLabel}
                </span>
              </div>
            </button>
          );
        })}
          </div>
        </>
      ) : selectedCourse ? (
        <>
          <div className="mb-4">
            <button
              type="button"
              onClick={handleBackToCourses}
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary-dark hover:text-accent-teal transition-colors rounded-lg px-2 py-1.5 -ml-2 hover:bg-white/80 border border-transparent hover:border-neutral-200/80"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              All courses
            </button>
          </div>

          <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card overflow-hidden flex flex-col min-h-[min(70vh,calc(100vh-8rem))] ring-1 ring-neutral-900/5">
        <div className="sticky top-0 z-20 border-b border-neutral-200 bg-gradient-to-b from-white to-neutral-50/90 backdrop-blur-md px-4 py-4 sm:px-5">
          <h2 className="text-base sm:text-lg font-bold text-primary-dark tracking-tight">{selectedCourse.title}</h2>
          {selectedCourse.description && (
            <p className="text-neutral-600 text-sm mt-2 max-w-prose leading-relaxed">{selectedCourse.description}</p>
          )}
          {activeWeek && (
            <p className="text-xs font-medium text-neutral-500 mt-2.5 tabular-nums">
              <span className="text-neutral-700">{activeWeek.title}</span>
              {itemCountForWeek(activeWeek) > 0
                ? ` · ${itemCountForWeek(activeWeek)} material${itemCountForWeek(activeWeek) !== 1 ? 's' : ''}`
                : null}
            </p>
          )}
        </div>

        {flatPath.length > 0 && (
          <LearningPathBar
            totalMaterials={flatPath.length}
            doneCount={countDoneInCourse(selectedCourse, doneItemIds)}
            pathIndex={pathIndex}
            currentTitle={pathIndex >= 0 ? flatPath[pathIndex]!.item.title : null}
            onPrev={goPrevMaterial}
            onNext={goNextMaterial}
          />
        )}

        {/* Mobile: horizontal week tabs */}
        {selectedWeeks.length > 0 && (
          <div className="lg:hidden border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-neutral-100/60 px-2 py-2.5">
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Weeks">
              {selectedWeeks.map((week) => {
                const active = week.id === selectedWeekId;
                const count = itemCountForWeek(week);
                return (
                  <button
                    key={week.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleWeekChange(week.id)}
                    className={[
                      'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all border',
                      active
                        ? 'bg-accent-teal/12 text-primary-dark border-accent-teal/45 shadow-sm ring-1 ring-accent-teal/20'
                        : 'bg-white/70 text-neutral-600 border-neutral-200/90 hover:bg-white hover:border-neutral-300',
                    ].join(' ')}
                  >
                    {week.title}
                    {count > 0 ? <span className="text-neutral-400 font-normal"> ({count})</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          {/* Desktop: week rail */}
          {selectedWeeks.length > 0 && (
            <nav
              className="hidden lg:flex lg:w-52 xl:w-56 shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-neutral-200 bg-gradient-to-b from-neutral-50 to-neutral-100/50"
              aria-label="Weeks"
            >
              <div className="p-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 px-4 pt-4 pb-1">
                Weeks
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {selectedWeeks.map((week) => {
                  const active = week.id === selectedWeekId;
                  const count = itemCountForWeek(week);
                  return (
                    <button
                      key={week.id}
                      type="button"
                      onClick={() => handleWeekChange(week.id)}
                      className={[
                        'w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                        active
                          ? 'bg-accent-teal/10 text-primary-dark shadow-sm shadow-[inset_3px_0_0_0_#3d7a8c] border border-accent-teal/25 ring-1 ring-accent-teal/10'
                          : 'text-neutral-600 hover:bg-white/90 border border-transparent hover:border-neutral-200/60',
                      ].join(' ')}
                    >
                      <span className="block truncate">{week.title}</span>
                      <span className="block text-xs font-normal text-neutral-500 mt-0.5">
                        {week.sections.length} section{week.sections.length !== 1 ? 's' : ''}
                        {count > 0 ? ` · ${count} item${count !== 1 ? 's' : ''}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
          )}

          {/* Section content or embedded material (outcome + iframe/video/PDF) */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-neutral-50/50">
            {selectedWeeks.length === 0 && (
              <p className="text-neutral-600 text-sm">This course does not have any weeks yet.</p>
            )}
            {activeWeek && activeWeek.sections.length === 0 && (
              <p className="text-neutral-600 text-sm max-w-prose">No sections in {activeWeek.title} yet.</p>
            )}
            {materialViewer ? (
              <EmbeddedMaterialViewer
                section={materialViewer.section}
                item={materialViewer.item}
                onClose={() => setMaterialViewer(null)}
                onPrev={goPrevMaterial}
                onNext={goNextMaterial}
                prevDisabled={pathIndex <= 0}
                nextDisabled={pathIndex < 0 || pathIndex >= flatPath.length - 1}
                onItemComplete={markItemEngaged}
                courseId={selectedCourseId || undefined}
                weekId={selectedWeekId || undefined}
              />
            ) : (
              activeWeek &&
              activeWeek.sections.length > 0 && (
                <div className="space-y-6 w-full max-w-6xl">
                  {activeWeek.sections.map((section) => (
                    <SectionBlock
                      key={section.id}
                      section={section}
                      objectiveOpen={objectiveOpen[section.id] ?? false}
                      onToggleObjective={() =>
                        setObjectiveOpen((prev) => ({ ...prev, [section.id]: !prev[section.id] }))
                      }
                      focusItemId={focusItemId}
                      doneItemIds={doneItemIds}
                      onToggleDone={toggleDoneItem}
                      onMaterialFocus={setFocusItemId}
                      onOpenMaterial={(item) => openMaterialViewer(section, item)}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
        </>
      ) : null}

    </div>
  );
};

function LearningPathBar({
  totalMaterials,
  doneCount,
  pathIndex,
  currentTitle,
  onPrev,
  onNext,
}: {
  totalMaterials: number;
  doneCount: number;
  pathIndex: number;
  currentTitle: string | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  const stepDisplay = pathIndex >= 0 ? pathIndex + 1 : 0;
  const atStart = pathIndex <= 0;
  const atEnd = pathIndex < 0 || pathIndex >= totalMaterials - 1;

  return (
    <div className="border-b border-neutral-200 bg-gradient-to-r from-accent-teal/[0.06] via-white to-neutral-50/90 px-3 py-3 sm:px-5 sm:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
            <span className="font-semibold text-neutral-800 tabular-nums">
              Material {stepDisplay > 0 ? `${stepDisplay} / ${totalMaterials}` : `— / ${totalMaterials}`}
            </span>
            <span className="text-neutral-400" aria-hidden>
              ·
            </span>
            <span className="tabular-nums">
              {doneCount} of {totalMaterials} marked done
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-200/90 overflow-hidden max-w-md">
            <div
              className="h-full rounded-full bg-accent-teal transition-[width] duration-300 ease-out"
              style={{ width: `${totalMaterials > 0 ? (doneCount / totalMaterials) * 100 : 0}%` }}
            />
          </div>
          {currentTitle ? (
            <p className="text-sm text-neutral-800 font-medium leading-snug line-clamp-2">
              <span className="text-neutral-500 font-normal">Now: </span>
              {currentTitle}
            </p>
          ) : (
            <p className="text-sm text-neutral-500">Choose a week and a material below to start.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onPrev}
            disabled={atStart}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200/90 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={atEnd}
            className="inline-flex items-center gap-1 rounded-lg border border-accent-teal/40 bg-accent-teal/10 px-3 py-2 text-sm font-semibold text-primary-dark shadow-sm hover:bg-accent-teal/15 disabled:opacity-40 disabled:pointer-events-none"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shared layout: done toggle, icon, title stack, action — scans like a table. */
const MATERIAL_GRID =
  'grid grid-cols-[2.25rem_2.75rem_minmax(0,1fr)_auto] gap-x-2 sm:gap-x-3 gap-y-0.5 items-center w-full text-left min-h-[3.25rem]';
const ICON_BOX = 'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm';

interface SectionBlockProps {
  section: CourseSection;
  objectiveOpen: boolean;
  onToggleObjective: () => void;
  focusItemId: string | null;
  doneItemIds: Set<string>;
  onToggleDone: (itemId: string) => void;
  onMaterialFocus: (itemId: string) => void;
  onOpenMaterial: (item: CourseItem) => void;
}

function SectionBlock({
  section,
  objectiveOpen,
  onToggleObjective,
  focusItemId,
  doneItemIds,
  onToggleDone,
  onMaterialFocus,
  onOpenMaterial,
}: SectionBlockProps) {
  const hasItems = section.items.length > 0;
  const sortedItems = [...section.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const hasDetails = !!(section.objective || section.outcome);

  const rowRing = (itemId: string) =>
    itemId === focusItemId
      ? 'ring-2 ring-accent-teal/50 border-accent-teal/40 shadow-md'
      : 'border-neutral-200/90';

  /** Use span+role="button" so we never nest a native <button> inside another control (invalid HTML). */
  const MaterialDoneToggle = ({ itemId }: { itemId: string }) => {
    const done = doneItemIds.has(itemId);
    const toggle = (e: React.SyntheticEvent) => {
      e.stopPropagation();
      onToggleDone(itemId);
    };
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle(e);
          }
        }}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:text-green-700 hover:bg-green-50 transition-colors cursor-pointer"
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        title={done ? 'Mark as not done' : 'Mark as done'}
      >
        {done ? (
          <CheckCircle className="h-6 w-6 text-green-600" aria-hidden />
        ) : (
          <Circle className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        )}
      </span>
    );
  };

  const materialRowA11y = (item: CourseItem) => {
    const activate = () => {
      onMaterialFocus(item.id);
      onOpenMaterial(item);
    };
    return {
      role: 'button' as const,
      tabIndex: 0,
      'aria-label': `Open material: ${item.title}`,
      onClick: activate,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      },
    };
  };

  const materialRowClass = (itemId: string, extra?: string) =>
    [
      MATERIAL_GRID,
      'rounded-xl border bg-white px-2 sm:px-3 py-2.5 hover:bg-neutral-50/90 hover:border-accent-teal/45 transition-all group shadow-sm cursor-pointer',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2',
      rowRing(itemId),
      extra ?? '',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <Card className="shadow-card border-neutral-200/90 ring-1 ring-neutral-900/[0.04]">
      <CardContent className="p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-neutral-800 mb-4 flex items-center gap-2 tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-teal/10 text-accent-teal">
            <BookOpen className="h-5 w-5 shrink-0" />
          </span>
          {section.title}
        </h2>

        {section.objective && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onToggleObjective}
              className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-primary-dark w-full text-left rounded-lg hover:bg-neutral-50 py-1 -mx-1 px-1 transition-colors"
            >
              <Target className="h-4 w-4 text-accent-teal/80 shrink-0" />
              <span>Objective</span>
              <ChevronDown
                className={`h-4 w-4 text-neutral-400 ml-auto transition-transform ${objectiveOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {objectiveOpen && (
              <p className="text-neutral-700 text-sm mt-2 max-w-prose leading-relaxed pl-6 border-l-2 border-accent-teal/30 ml-1">
                {section.objective}
              </p>
            )}
          </div>
        )}

        {hasItems && (
          <div className="mt-4 rounded-xl border border-neutral-200/90 bg-neutral-50/40 p-1.5 sm:p-2 space-y-1.5">
            {sortedItems.map((item) => {
              if (item.type === 'video') {
                return (
                  <div
                    key={item.id}
                    id={`course-item-${item.id}`}
                    {...materialRowA11y(item)}
                    className={materialRowClass(item.id)}
                  >
                    <MaterialDoneToggle itemId={item.id} />
                    <div className={`${ICON_BOX} bg-primary-dark text-white group-hover:scale-[1.02] transition-transform`}>
                      <Play className="h-5 w-5 ml-0.5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-800 block leading-snug">{item.title}</span>
                      {item.description && (
                        <p className="text-sm text-neutral-500 mt-0.5 leading-snug line-clamp-2">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-accent-teal font-semibold shrink-0 tabular-nums">Play</span>
                  </div>
                );
              }
              if (item.type === 'link') {
                const openInPlayer = shouldOpenVideoInModal(item.url);
                return (
                  <div
                    key={item.id}
                    id={`course-item-${item.id}`}
                    {...materialRowA11y(item)}
                    className={materialRowClass(item.id)}
                  >
                    <MaterialDoneToggle itemId={item.id} />
                    <div
                      className={`${ICON_BOX} ${
                        openInPlayer
                          ? 'bg-primary-dark text-white group-hover:scale-[1.02] transition-transform'
                          : 'bg-neutral-100 text-neutral-600 group-hover:bg-accent-teal group-hover:text-white transition-colors'
                      }`}
                    >
                      {openInPlayer ? (
                        <Play className="h-5 w-5 ml-0.5" aria-hidden />
                      ) : (
                        <ExternalLink className="h-5 w-5" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-800 block leading-snug">{item.title}</span>
                      {item.description && (
                        <p className="text-sm text-neutral-500 mt-0.5 leading-snug line-clamp-2">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-accent-teal font-semibold shrink-0 tabular-nums">
                      {openInPlayer ? 'Play' : 'Open'}
                    </span>
                  </div>
                );
              }
              if (item.type === 'pdf') {
                return (
                  <div
                    key={item.id}
                    id={`course-item-${item.id}`}
                    {...materialRowA11y(item)}
                    className={materialRowClass(item.id, 'w-full')}
                  >
                    <MaterialDoneToggle itemId={item.id} />
                    <div className={`${ICON_BOX} bg-red-50 text-red-600 border border-red-100`}>
                      <FileText className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-800 block leading-snug">{item.title}</span>
                      {item.description && (
                        <p className="text-sm text-neutral-500 mt-0.5 leading-snug line-clamp-2">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-accent-teal font-semibold shrink-0">View</span>
                  </div>
                );
              }
              if (item.type === 'text') {
                return (
                  <div
                    key={item.id}
                    id={`course-item-${item.id}`}
                    {...materialRowA11y(item)}
                    className={materialRowClass(item.id)}
                  >
                    <MaterialDoneToggle itemId={item.id} />
                    <div className={`${ICON_BOX} bg-accent-teal/10 text-accent-teal border border-accent-teal/20 group-hover:bg-accent-teal group-hover:text-white transition-colors`}>
                      <AlignLeft className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-800 block leading-snug">{item.title}</span>
                      {item.description && (
                        <p className="text-sm text-neutral-500 mt-0.5 leading-snug line-clamp-2">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-accent-teal font-semibold shrink-0">Read</span>
                  </div>
                );
              }
              if (item.type === 'audio') {
                return (
                  <div
                    key={item.id}
                    id={`course-item-${item.id}`}
                    {...materialRowA11y(item)}
                    className={materialRowClass(item.id)}
                  >
                    <MaterialDoneToggle itemId={item.id} />
                    <div className={`${ICON_BOX} bg-purple-50 text-purple-600 border border-purple-100`}>
                      <Headphones className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-800 block leading-snug">{item.title}</span>
                      {item.description && (
                        <p className="text-sm text-neutral-500 mt-0.5 leading-snug line-clamp-2">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-accent-teal font-semibold shrink-0">Listen</span>
                  </div>
                );
              }
              if (item.type === 'quiz') {
                return (
                  <div
                    key={item.id}
                    id={`course-item-${item.id}`}
                    {...materialRowA11y(item)}
                    className={materialRowClass(item.id)}
                  >
                    <MaterialDoneToggle itemId={item.id} />
                    <div className={`${ICON_BOX} bg-amber-50 text-amber-600 border border-amber-100`}>
                      <ClipboardCheck className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-800 block leading-snug">{item.title}</span>
                      {item.description && (
                        <p className="text-sm text-neutral-500 mt-0.5 leading-snug line-clamp-2">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-accent-teal font-semibold shrink-0">Quiz</span>
                  </div>
                );
              }
              if (item.type === 'assignment') {
                return (
                  <div
                    key={item.id}
                    id={`course-item-${item.id}`}
                    {...materialRowA11y(item)}
                    className={materialRowClass(item.id)}
                  >
                    <MaterialDoneToggle itemId={item.id} />
                    <div className={`${ICON_BOX} bg-blue-50 text-blue-600 border border-blue-100`}>
                      <Upload className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-800 block leading-snug">{item.title}</span>
                      {item.description && (
                        <p className="text-sm text-neutral-500 mt-0.5 leading-snug line-clamp-2">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-accent-teal font-semibold shrink-0">Submit</span>
                  </div>
                );
              }
              if (item.type === 'download') {
                return (
                  <div
                    key={item.id}
                    id={`course-item-${item.id}`}
                    {...materialRowA11y(item)}
                    className={materialRowClass(item.id)}
                  >
                    <MaterialDoneToggle itemId={item.id} />
                    <div className={`${ICON_BOX} bg-green-50 text-green-600 border border-green-100`}>
                      <Download className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-800 block leading-snug">{item.title}</span>
                      {(item as { fileName?: string }).fileName && (
                        <p className="text-sm text-neutral-500 mt-0.5 leading-snug line-clamp-1">
                          {(item as { fileName: string }).fileName}
                        </p>
                      )}
                    </div>
                    <span className="text-sm text-accent-teal font-semibold shrink-0">Download</span>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}

        {section.outcome && (
          <div className="mt-5 pt-4 border-t border-neutral-200 flex gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 max-w-prose">
              <p className="text-sm font-medium text-neutral-600">Outcome</p>
              <p className="text-neutral-700 leading-relaxed mt-0.5">{section.outcome}</p>
            </div>
          </div>
        )}

        {!hasItems && !hasDetails && (
          <p className="text-sm text-neutral-500">No materials in this section yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default StudentCourse;
