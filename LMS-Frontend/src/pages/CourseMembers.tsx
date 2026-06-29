import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { courseService } from '../services/courseService';
import { userDirectoryService } from '../services/userDirectoryService';
import { usersService, UserDirectoryItem } from '../services/usersService';
import { inviteService, type InviteResult, type PendingInvite } from '../services/inviteService';
import type { Course } from '../types/course';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { CourseMembersPageSkeleton } from '../components/PageSkeletons';
import {
  Users,
  MessageCircle,
  Plus,
  Trash2,
  KeyRound,
  Info,
  Loader2,
  GraduationCap,
  Mail,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  Sparkles,
  ArrowRight,
  Search,
  UserRound,
  Layers,
} from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';

type Member = { id: string; name: string; email: string };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const COHORT_HINTS = [
  'Learning is better together — say hi to someone in your cohort.',
  'Use Messages to pair up on tricky modules or share resources.',
  'Your course roster is your network — profiles show what classmates are working on.',
  'Stuck? Message a classmate or jump into the forum from the sidebar.',
];

function pickCohortHint(): string {
  const d = new Date();
  const idx = (d.getDate() + d.getMonth() * 31) % COHORT_HINTS.length;
  return COHORT_HINTS[idx];
}

const CourseMembers: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const isAdmin = user?.role === 'admin';
  const userCourseCodes = user?.courseCodes ?? [];

  const [courses, setCourses] = useState<Course[]>([]);
  const [membersByCourseId, setMembersByCourseId] = useState<Record<string, Member[]>>({});
  const [allUsers, setAllUsers] = useState<UserDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [managingCourseId, setManagingCourseId] = useState<string | null>(null);
  const [editingCodesForId, setEditingCodesForId] = useState<string | null>(null);
  const [editingCodesName, setEditingCodesName] = useState('');
  const [draftCourseCodes, setDraftCourseCodes] = useState<string[]>([]);
  const [savingCodes, setSavingCodes] = useState(false);

  const [inviteCourseId, setInviteCourseId] = useState<string | null>(null);
  const [inviteText, setInviteText] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingInvitesByCourse, setPendingInvitesByCourse] = useState<Record<string, PendingInvite[]>>({});
  const csvFileRef = useRef<HTMLInputElement>(null);

  const coursesToShow = useMemo(
    () => (isAdmin ? courses : courses.filter((c) => c.courseCode && userCourseCodes.includes(c.courseCode))),
    [courses, isAdmin, userCourseCodes]
  );

  const userCourseCodesKey = useMemo(() => [...userCourseCodes].sort().join(','), [userCourseCodes]);

  const effectiveSelectedId = useMemo(() => {
    if (coursesToShow.length === 0) return null;
    if (selectedCourseId && coursesToShow.some((c) => c.id === selectedCourseId)) return selectedCourseId;
    return coursesToShow[0].id;
  }, [coursesToShow, selectedCourseId]);

  const selectedCourse = useMemo(
    () => (effectiveSelectedId ? coursesToShow.find((c) => c.id === effectiveSelectedId) ?? null : null),
    [coursesToShow, effectiveSelectedId]
  );

  useEffect(() => {
    setManagingCourseId(null);
    setMemberQuery('');
  }, [effectiveSelectedId]);

  const refreshMembersMap = useCallback(async (courseIds: string[]) => {
    const memberResults = await Promise.all(
      courseIds.map(async (id) => {
        try {
          const members = await courseService.fetchCourseMembers(id);
          return { id, members };
        } catch {
          return { id, members: [] as Member[] };
        }
      })
    );
    const next: Record<string, Member[]> = {};
    for (const row of memberResults) {
      next[row.id] = row.members;
    }
    setMembersByCourseId((prev) => ({ ...prev, ...next }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await courseService.fetchCourses();
        if (cancelled) return;

        const toShow = isAdmin
          ? list
          : list.filter((c) => c.courseCode && userCourseCodes.includes(c.courseCode));

        const memberResults = await Promise.all(
          toShow.map(async (c) => {
            try {
              const members = await courseService.fetchCourseMembers(c.id);
              return { id: c.id, members };
            } catch {
              return { id: c.id, members: [] as Member[] };
            }
          })
        );
        if (cancelled) return;

        const nextMap: Record<string, Member[]> = {};
        for (const row of memberResults) {
          nextMap[row.id] = row.members;
        }
        setMembersByCourseId(nextMap);
        setCourses(list);

        if (isAdmin) {
          try {
            const users = await usersService.getUsers();
            if (!cancelled) {
              setAllUsers(users);
              users.forEach((u) =>
                userDirectoryService.add({
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  role: u.role,
                  courseCodes: u.courseCodes,
                })
              );
            }
          } catch {
            if (!cancelled) setAllUsers([]);
          }
        }
      } catch {
        if (!cancelled) {
          setCourses([]);
          setMembersByCourseId({});
          setLoadError('Could not load courses. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, userCourseCodesKey, loadRetryKey]);

  const allCourseCodes = useMemo(
    () => [...new Set(courses.map((c) => c.courseCode).filter(Boolean) as string[])].sort(),
    [courses]
  );

  const uniqueClassmateCount = useMemo(() => {
    const ids = new Set<string>();
    for (const c of coursesToShow) {
      for (const m of membersByCourseId[c.id] ?? []) {
        if (m.id !== userId) ids.add(m.id);
      }
    }
    return ids.size;
  }, [coursesToShow, membersByCourseId, userId]);

  const totalMembersAcrossVisible = useMemo(() => {
    let n = 0;
    for (const c of coursesToShow) {
      n += (membersByCourseId[c.id] ?? []).length;
    }
    return n;
  }, [coursesToShow, membersByCourseId]);

  const getMembersForCourse = useCallback(
    (courseId: string): Member[] => {
      return [...(membersByCourseId[courseId] ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    },
    [membersByCourseId]
  );

  const rosterMembers = selectedCourse ? getMembersForCourse(selectedCourse.id) : [];
  const filteredRoster = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return rosterMembers;
    return rosterMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q)
    );
  }, [rosterMembers, memberQuery]);

  const openEditCodes = (memberId: string, memberName: string) => {
    const u = allUsers.find((x) => x.id === memberId);
    setEditingCodesForId(memberId);
    setEditingCodesName(memberName);
    setDraftCourseCodes(u?.courseCodes ?? []);
  };

  const saveCourseCodes = async () => {
    if (!editingCodesForId) return;
    setSavingCodes(true);
    try {
      await usersService.patchUserCourseCodes(editingCodesForId, draftCourseCodes);
      userDirectoryService.update(editingCodesForId, { courseCodes: draftCourseCodes });
      setEditingCodesForId(null);
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, 'Could not save course codes.'));
    } finally {
      setSavingCodes(false);
    }
  };

  const toggleDraftCode = (code: string) => {
    setDraftCourseCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const addMemberToCourse = async (courseId: string, userItem: UserDirectoryItem) => {
    try {
      await courseService.addCourseMember(courseId, userItem.id);
      await refreshMembersMap([courseId]);
      const users = await usersService.getUsers();
      setAllUsers(users);
      users.forEach((u) =>
        userDirectoryService.add({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          courseCodes: u.courseCodes,
        })
      );
      setManagingCourseId(null);
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, 'Could not add that member.'));
    }
  };

  const removeMemberFromCourse = async (courseId: string, memberId: string) => {
    try {
      await courseService.removeCourseMember(courseId, memberId);
      await refreshMembersMap([courseId]);
      const users = await usersService.getUsers();
      setAllUsers(users);
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, 'Could not remove that member.'));
    }
  };

  const loadPendingInvites = useCallback(
    async (courseId: string) => {
      if (!isAdmin) return;
      try {
        const invites = await inviteService.getPendingInvites(courseId);
        setPendingInvitesByCourse((prev) => ({ ...prev, [courseId]: invites }));
      } catch {
        // ignore
      }
    },
    [isAdmin]
  );

  const openInviteModal = (courseId: string) => {
    setInviteCourseId(courseId);
    setInviteText('');
    setInviteResult(null);
    setInviteError(null);
    loadPendingInvites(courseId);
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const emails = await inviteService.parseCSVFile(file);
    setInviteText((prev) => {
      const existing = inviteService.parseEmailsFromText(prev);
      const merged = [...new Set([...existing, ...emails])];
      return merged.join('\n');
    });
    if (csvFileRef.current) csvFileRef.current.value = '';
  };

  const handleBulkInvite = async () => {
    if (!inviteCourseId || !inviteText.trim()) return;
    const emails = inviteService.parseEmailsFromText(inviteText);
    if (emails.length === 0) {
      setInviteError('No valid email addresses found.');
      return;
    }
    setInviting(true);
    setInviteResult(null);
    setInviteError(null);
    try {
      const result = await inviteService.bulkInvite(inviteCourseId, emails);
      setInviteResult(result);
      setInviteText('');
      await refreshMembersMap([inviteCourseId]);
      await loadPendingInvites(inviteCourseId);
    } catch (e) {
      setInviteError(getErrorMessage(e, 'Could not process the invite list.'));
    } finally {
      setInviting(false);
    }
  };

  const revokeInvite = async (courseId: string, inviteId: string) => {
    try {
      await inviteService.revokeInvite(courseId, inviteId);
      await loadPendingInvites(courseId);
    } catch {
      // ignore
    }
  };

  const basePath = user?.role === 'admin' ? '/admin' : '/student';

  const firstName = (user?.name ?? 'there').trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);
  const cohortHint = pickCohortHint();

  const isManagingSelected = !!(selectedCourse && managingCourseId === selectedCourse.id);
  const selectedMemberIds = new Set(rosterMembers.map((m) => m.id));
  const availableUsers = selectedCourse
    ? allUsers.filter((u) => !selectedMemberIds.has(u.id))
    : [];

  const stats = [
    {
      title: 'Your courses',
      subtitle: 'Visible rosters',
      value: coursesToShow.length,
      icon: GraduationCap,
      accent: 'from-primary-100 to-primary-200/70 text-primary-dark',
      ring: 'ring-primary-200/60',
    },
    {
      title: 'Classmates',
      subtitle: uniqueClassmateCount === 0 ? 'Solo — invite others!' : `Across courses`,
      value: uniqueClassmateCount,
      icon: Users,
      accent: 'from-sky-100 to-cyan-100 text-sky-900',
      ring: 'ring-sky-200/70',
    },
    {
      title: 'In this roster',
      subtitle: selectedCourse?.title ?? 'Pick a course',
      value: rosterMembers.length,
      icon: UserRound,
      accent: 'from-violet-100/90 to-fuchsia-100/70 text-violet-900',
      ring: 'ring-violet-200/70',
    },
    ...(isAdmin
      ? [
          {
            title: 'Directory',
            subtitle: 'Users you can enroll',
            value: allUsers.length,
            icon: Sparkles,
            accent: 'from-amber-100 to-orange-100/80 text-amber-900',
            ring: 'ring-amber-200/70',
          },
        ]
      : [
          {
            title: 'Enrolled spots',
            subtitle: 'Seat count (with you)',
            value: totalMembersAcrossVisible,
            icon: Layers,
            accent: 'from-emerald-100 to-teal-100 text-emerald-900',
            ring: 'ring-emerald-200/70',
          },
        ]),
  ];

  const retryLoad = () => {
    setLoadError(null);
    setLoadRetryKey((k) => k + 1);
  };

  if (loading) {
    return <CourseMembersPageSkeleton />;
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200/90 bg-red-50 px-4 py-4 text-red-900 shadow-sm">
        <p className="font-medium">Couldn’t load course members</p>
        <p className="text-sm mt-1 text-red-800/90">{loadError}</p>
        <Button variant="outline" className="mt-3 border-red-200" onClick={retryLoad}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-8">
      {/* Hero — matches student dashboard rhythm */}
      <section className="relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-gradient-to-br from-accent-teal/[0.12] via-white to-primary-50/90 shadow-updraft ring-1 ring-neutral-900/[0.04]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[length:28px_28px] bg-[linear-gradient(to_right,rgb(15_26_31/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_26_31/0.06)_1px,transparent_1px)]"
          aria-hidden
        />
        <div className="relative px-5 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3 max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-dark ring-1 ring-neutral-200/80 shadow-sm">
                <Users className="h-3.5 w-3.5 text-accent-teal" aria-hidden />
                {isAdmin ? 'Rosters & access' : 'Your cohort'}
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
                {greeting}, {firstName}!
              </h1>
              <p className="text-neutral-700 text-base sm:text-lg leading-relaxed">
                {isAdmin
                  ? 'Pick a course below, manage members, and send invites — one focused roster at a time.'
                  : 'See who’s learning with you, open a profile, or start a conversation in Messages.'}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`${basePath}/messages`)}
                >
                  <MessageCircle className="h-4 w-4 mr-2" aria-hidden />
                  Messages
                </Button>
                <Button type="button" onClick={() => navigate(`${basePath}/forum`)}>
                  Forum
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/60 backdrop-blur-sm px-4 py-4 sm:px-5 sm:py-5 shadow-sm ring-1 ring-neutral-200/60 max-w-md w-full lg:shrink-0">
              <div className="flex gap-3 items-start">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Cohort nudge</p>
                  <p className="text-sm text-neutral-800 mt-1 leading-relaxed font-medium">{cohortHint}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats — dashboard “your numbers” style */}
      <section>
        <h2 className="text-lg font-bold text-neutral-900 mb-4">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card
                key={stat.title}
                className="overflow-hidden shadow-card hover:shadow-updraft transition-shadow ring-1 ring-neutral-900/[0.03]"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${stat.accent} ring-2 ${stat.ring} shadow-sm`}
                    >
                      <Icon className="h-6 w-6" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide truncate">
                        {stat.title}
                      </p>
                      <p className="text-2xl font-bold text-neutral-900 tabular-nums">{stat.value}</p>
                      <p className="text-xs text-neutral-600 mt-0.5 truncate">{stat.subtitle}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {coursesToShow.length === 0 ? (
        <Card className="shadow-updraft overflow-hidden ring-1 ring-neutral-900/[0.04]">
          <div className="border-b border-neutral-200/90 bg-gradient-to-r from-primary-50/90 via-white to-neutral-50/80 px-6 py-4">
            <div className="flex items-center gap-2 text-primary-dark">
              <GraduationCap className="h-5 w-5 text-accent-teal shrink-0" aria-hidden />
              <p className="text-sm font-semibold">No courses to show</p>
            </div>
          </div>
          <CardContent className="p-8 text-center">
            <p className="text-neutral-600 max-w-md mx-auto leading-relaxed">
              {isAdmin
                ? 'Create a course from the Course tab, then return here to add members.'
                : "You don't have access to any courses yet. Your admin can assign course codes or add you to a roster."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Course picker — “Jump in” style */}
          <section>
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Pick a course</h2>
                <p className="text-sm text-neutral-600 mt-0.5">
                  Tiles match your dashboard shortcuts — switch courses without scrolling a long stack.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {coursesToShow.map((course, idx) => {
                const n = getMembersForCourse(course.id).length;
                const active = course.id === effectiveSelectedId;
                const gradients = [
                  'from-accent-teal/15 via-white to-primary-50/80',
                  'from-sky-100/80 via-white to-indigo-50/60',
                  'from-violet-100/70 via-white to-fuchsia-50/50',
                  'from-amber-100/70 via-white to-orange-50/50',
                  'from-teal-100/80 via-white to-emerald-50/60',
                  'from-primary-100/90 via-white to-neutral-50',
                ];
                const g = gradients[idx % gradients.length];
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setSelectedCourseId(course.id)}
                    className={[
                      'group text-left rounded-xl border p-4 shadow-card ring-1 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2',
                      active
                        ? 'border-accent-teal/50 bg-gradient-to-br shadow-updraft ring-accent-teal/25 -translate-y-0.5'
                        : 'border-neutral-200/90 bg-gradient-to-br hover:shadow-updraft-hover hover:-translate-y-0.5 ring-neutral-900/[0.03] hover:ring-neutral-900/[0.06]',
                      g,
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 text-accent-teal ring-1 ring-neutral-200/80 shrink-0 shadow-sm">
                        <GraduationCap className="h-5 w-5" aria-hidden />
                      </div>
                      <ArrowRight
                        className={`h-5 w-5 shrink-0 transition-transform ${active ? 'text-accent-teal translate-x-0.5' : 'text-neutral-400 group-hover:text-accent-teal group-hover:translate-x-0.5'}`}
                        aria-hidden
                      />
                    </div>
                    <p className="mt-3 font-semibold text-neutral-900 line-clamp-2">{course.title}</p>
                    <p className="text-sm text-neutral-600 mt-0.5">
                      {n} member{n === 1 ? '' : 's'}
                      {course.courseCode ? (
                        <>
                          {' '}
                          ·{' '}
                          <span className="font-mono text-neutral-700">{course.courseCode}</span>
                        </>
                      ) : null}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Single roster panel — student “recent submissions” chrome */}
          {selectedCourse ? (
            <Card className="shadow-updraft overflow-hidden ring-1 ring-neutral-900/[0.04]">
              <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50/90 via-white to-primary-50/40 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="border-0 p-0 text-neutral-900 truncate">{selectedCourse.title}</CardTitle>
                    {selectedCourse.courseCode ? (
                      <p className="text-sm text-neutral-500 mt-1">
                        Code{' '}
                        <span className="font-mono text-neutral-700 bg-white/70 px-1.5 py-0.5 rounded-md ring-1 ring-neutral-200/80">
                          {selectedCourse.courseCode}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 flex-wrap shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openInviteModal(selectedCourse.id)}
                      >
                        <Mail className="h-3.5 w-3.5 mr-1" />
                        Invite / CSV
                      </Button>
                      <Button
                        variant={isManagingSelected ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() =>
                          setManagingCourseId(isManagingSelected ? null : selectedCourse.id)
                        }
                      >
                        {isManagingSelected ? 'Done adding' : 'Manage members'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <CardContent className="p-5 sm:p-6 space-y-5">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none"
                    aria-hidden
                  />
                  <input
                    type="search"
                    placeholder="Find someone on this roster…"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200/90 bg-white pl-10 pr-3 py-2.5 text-sm text-neutral-800 placeholder-neutral-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-teal/30 focus:border-accent-teal/50"
                  />
                </div>

                {isManagingSelected && availableUsers.length > 0 && (
                  <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 px-4 py-4 sm:px-5 ring-1 ring-sky-900/[0.04]">
                    <div className="flex gap-3 items-start">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
                        <Info className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                          Add to this course
                        </p>
                        <p className="text-sm text-neutral-700 mt-1 leading-relaxed">
                          Tap a person to enroll them immediately. They must already exist in your user directory.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3 max-h-40 overflow-y-auto pr-1">
                          {availableUsers.map((u) => (
                            <Button
                              key={u.id}
                              variant="outline"
                              size="sm"
                              className="border-neutral-200/90 bg-white/90 hover:bg-white shadow-sm"
                              onClick={() => addMemberToCourse(selectedCourse.id, u)}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1 text-accent-teal" aria-hidden />
                              <span className="font-medium">{u.name}</span>
                              <span className="ml-1.5 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-800">
                                {u.role}
                              </span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {isManagingSelected && availableUsers.length === 0 && allUsers.length > 0 ? (
                  <p className="text-sm text-neutral-600 rounded-lg border border-neutral-200/80 bg-neutral-50/80 px-4 py-3">
                    Everyone in the directory is already in this course, or there are no other users to add.
                  </p>
                ) : null}

                {isAdmin && (pendingInvitesByCourse[selectedCourse.id] ?? []).length > 0 && (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Pending invitations ({pendingInvitesByCourse[selectedCourse.id].length})
                    </p>
                    <ul className="space-y-1">
                      {pendingInvitesByCourse[selectedCourse.id].map((inv) => (
                        <li
                          key={inv.id}
                          className="flex items-center justify-between gap-2 text-sm text-amber-900"
                        >
                          <span className="truncate">{inv.email}</span>
                          <button
                            type="button"
                            onClick={() => revokeInvite(selectedCourse.id, inv.id)}
                            className="shrink-0 p-0.5 rounded hover:bg-amber-200/60 text-amber-700"
                            title="Revoke invite"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {rosterMembers.length === 0 ? (
                  <p className="text-sm text-neutral-600 rounded-lg border border-dashed border-neutral-300/90 bg-neutral-50/50 px-4 py-6 text-center">
                    No members yet.
                    {isAdmin ? ' Use Invite / CSV to add people.' : ''}
                  </p>
                ) : filteredRoster.length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-6">No one matches “{memberQuery.trim()}”.</p>
                ) : (
                  <ul className="space-y-3">
                    {filteredRoster.map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-neutral-200/90 bg-white px-4 py-3 shadow-sm ring-1 ring-neutral-900/[0.02] hover:shadow-md hover:ring-neutral-900/[0.05] transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-200/80 text-primary-dark text-xs font-bold ring-2 ring-white shadow-sm"
                            aria-hidden
                          >
                            {initials(m.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-neutral-800 truncate">{m.name}</span>
                              {m.id === userId ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-teal bg-accent-teal/10 px-2 py-0.5 rounded-full">
                                  You
                                </span>
                              ) : null}
                            </div>
                            {m.email ? (
                              <p className="text-xs text-neutral-500 truncate mt-0.5">{m.email}</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0">
                          {m.id !== userId && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-neutral-200/90"
                                onClick={() =>
                                  navigate(`${basePath}/messages`, {
                                    state: { openUserId: m.id, openUserName: m.name },
                                  })
                                }
                              >
                                <MessageCircle className="h-3.5 w-3.5 mr-1" aria-hidden />
                                Message
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-neutral-200/90"
                                onClick={() => navigate(`${basePath}/profile/${m.id}`)}
                              >
                                Profile
                              </Button>
                            </>
                          )}
                          {isAdmin && m.id !== userId && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-neutral-200/90"
                                onClick={() => openEditCodes(m.id, m.name)}
                                title="Edit course codes"
                              >
                                <KeyRound className="h-3.5 w-3.5 mr-1" aria-hidden />
                                Codes
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeMemberFromCourse(selectedCourse.id, m.id)}
                                className="text-red-600 border-red-200/90 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <Modal isOpen={!!editingCodesForId} onClose={() => setEditingCodesForId(null)} title="Course codes">
        <div className="space-y-4">
          <div className="rounded-lg border border-sky-200/70 bg-sky-50/50 px-3 py-3 text-sm text-neutral-700 leading-relaxed">
            Select which codes <strong className="text-neutral-900">{editingCodesName}</strong> can use. Course content
            and resources filter by these codes.
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {allCourseCodes.length === 0 ? (
              <p className="text-sm text-neutral-500 py-2">No course codes yet. Add codes when you create courses.</p>
            ) : (
              allCourseCodes.map((code) => (
                <label
                  key={code}
                  className="flex items-center gap-3 cursor-pointer rounded-lg border border-neutral-200/90 bg-white px-3 py-2.5 hover:bg-neutral-50/90 has-[:checked]:border-accent-teal/40 has-[:checked]:bg-accent-teal/[0.04]"
                >
                  <input
                    type="checkbox"
                    checked={draftCourseCodes.includes(code)}
                    onChange={() => toggleDraftCode(code)}
                    className="rounded border-neutral-300 text-accent-teal focus:ring-accent-teal"
                  />
                  <span className="font-medium text-neutral-800 font-mono text-sm">{code}</span>
                </label>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200/80">
            <Button variant="outline" onClick={() => setEditingCodesForId(null)}>
              Cancel
            </Button>
            <Button onClick={saveCourseCodes} disabled={savingCodes}>
              {savingCodes ? 'Saving…' : 'Save access'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!inviteCourseId}
        onClose={() => {
          setInviteCourseId(null);
          setInviteResult(null);
          setInviteError(null);
        }}
        title="Invite members"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-sky-200/70 bg-sky-50/50 px-3 py-3 text-sm text-neutral-700 leading-relaxed">
            <p className="font-medium text-neutral-800 mb-1 flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-accent-teal" />
              Enroll by email
            </p>
            <p>
              Enter email addresses separated by commas or new lines. Existing accounts are enrolled immediately. New
              emails receive an invitation to sign up — they&apos;ll be auto-enrolled when they register.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Email addresses</label>
            <textarea
              rows={5}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-teal/30 focus:border-accent-teal/50"
              placeholder={'alice@example.com\nbob@example.com, charlie@example.com'}
              value={inviteText}
              onChange={(e) => setInviteText(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              accept=".csv,text/csv"
              ref={csvFileRef}
              className="hidden"
              onChange={handleCSVUpload}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => csvFileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => inviteService.downloadTemplate()}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Download CSV template
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            CSV format: <code className="bg-neutral-100 px-1 rounded">Name,Email</code> — one row per person. The Email
            column is required.
          </p>

          {inviteError && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{inviteError}</span>
            </div>
          )}

          {inviteResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-1 text-sm">
              <p className="font-semibold text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Done!
              </p>
              {inviteResult.enrolled.length > 0 && (
                <p className="text-green-700">
                  ✓ Enrolled immediately ({inviteResult.enrolled.length}): {inviteResult.enrolled.join(', ')}
                </p>
              )}
              {inviteResult.invited.length > 0 && (
                <p className="text-amber-700">
                  ✉ Invitation sent ({inviteResult.invited.length}): {inviteResult.invited.join(', ')}
                </p>
              )}
              {inviteResult.alreadyEnrolled.length > 0 && (
                <p className="text-neutral-500">
                  Already enrolled / invited ({inviteResult.alreadyEnrolled.length}):{' '}
                  {inviteResult.alreadyEnrolled.join(', ')}
                </p>
              )}
              {inviteResult.errors.length > 0 && (
                <p className="text-red-600">
                  Failed ({inviteResult.errors.length}): {inviteResult.errors.join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200/80">
            <Button
              variant="outline"
              onClick={() => {
                setInviteCourseId(null);
                setInviteResult(null);
                setInviteError(null);
              }}
            >
              {inviteResult ? 'Close' : 'Cancel'}
            </Button>
            {!inviteResult && (
              <Button onClick={handleBulkInvite} disabled={inviting || !inviteText.trim()}>
                {inviting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-1.5" />
                    Send invitations
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CourseMembers;
