import React, { useCallback, useEffect, useState } from 'react';
import {
  Megaphone,
  Plus,
  Pin,
  Globe,
  BookOpen,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { announcementService, type Announcement, type CreateAnnouncementData } from '../services/announcementService';
import { courseService } from '../services/courseService';
import type { Course } from '../types/course';
import { Button } from './Button';

interface Props {
  isAdmin: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const EMPTY_DRAFT: CreateAnnouncementData = {
  title: '',
  body: '',
  scope: 'general',
  courseId: null,
  pinned: false,
};

export const AnnouncementsPanel: React.FC<Props> = ({ isAdmin }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // expand / collapse long bodies
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // modal state
  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [draft, setDraft]           = useState<CreateAnnouncementData>(EMPTY_DRAFT);
  const [courses, setCourses]       = useState<Course[]>([]);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await announcementService.getAll();
      setAnnouncements(list);
    } catch {
      setError('Could not load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadCoursesIfNeeded = async () => {
    if (courses.length === 0) {
      setCourseLoading(true);
      const list = await courseService.fetchCourses().catch(() => []);
      setCourses(list);
      setCourseLoading(false);
    }
  };

  const openCreate = async () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormError(null);
    await loadCoursesIfNeeded();
    setModalOpen(true);
  };

  const openEdit = async (a: Announcement) => {
    setEditingId(a.id);
    setDraft({ title: a.title, body: a.body, scope: a.scope, courseId: a.courseId, pinned: a.pinned });
    setFormError(null);
    await loadCoursesIfNeeded();
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditingId(null); setDraft(EMPTY_DRAFT); };

  const handleSave = async () => {
    setFormError(null);
    if (!draft.title.trim()) { setFormError('Title is required'); return; }
    if (!draft.body.trim())  { setFormError('Body is required'); return; }
    if (draft.scope === 'course' && !draft.courseId) { setFormError('Please select a course'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await announcementService.update(editingId, draft);
      } else {
        await announcementService.create(draft);
      }
      closeModal();
      await load();
    } catch {
      setFormError('Failed to save announcement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    setDeleting(id);
    try {
      await announcementService.delete(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError('Failed to delete announcement');
    } finally {
      setDeleting(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const BODY_LIMIT = 220;

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary-dark" aria-hidden />
          <h2 className="text-lg font-bold text-neutral-900">Announcements</h2>
        </div>
        {isAdmin && (
          <Button type="button" size="sm" onClick={() => void openCreate()} disabled={courseLoading}>
            {courseLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5 mr-1" aria-hidden />}
            {courseLoading ? 'Loading…' : 'New announcement'}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-neutral-500 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200/90 bg-red-50 px-4 py-3 text-red-900 text-sm">
          {error}
          <button className="ml-2 underline text-xs" onClick={() => void load()}>retry</button>
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-10 text-neutral-500 text-sm border border-dashed border-neutral-300/90 rounded-xl bg-neutral-50/50">
          {isAdmin
            ? 'No announcements yet. Create one to inform your students.'
            : 'No announcements right now. Check back later.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {announcements.map((a) => {
            const isLong = a.body.length > BODY_LIMIT;
            const isExp  = expanded.has(a.id);
            const bodyToShow = isLong && !isExp ? a.body.slice(0, BODY_LIMIT) + '…' : a.body;

            return (
              <li
                key={a.id}
                className={`rounded-xl border shadow-sm ring-1 transition-all ${
                  a.pinned
                    ? 'border-primary-200/80 bg-primary-50/60 ring-primary-900/[0.04]'
                    : 'border-neutral-200/90 bg-white ring-neutral-900/[0.03]'
                }`}
              >
                <div className="px-4 py-4 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {a.pinned && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-dark">
                            <Pin className="h-2.5 w-2.5" aria-hidden />
                            Pinned
                          </span>
                        )}
                        {a.scope === 'course' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                            <BookOpen className="h-2.5 w-2.5" aria-hidden />
                            {a.courseCode ?? a.courseTitle ?? 'Course'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            <Globe className="h-2.5 w-2.5" aria-hidden />
                            General
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-neutral-900 text-sm sm:text-base">{a.title}</h3>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void openEdit(a)}
                          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(a.id)}
                          disabled={deleting === a.id}
                          className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deleting === a.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">{bodyToShow}</p>

                  {isLong && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(a.id)}
                      className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline"
                    >
                      {isExp ? (
                        <><ChevronUp className="h-3.5 w-3.5" aria-hidden /> Show less</>
                      ) : (
                        <><ChevronDown className="h-3.5 w-3.5" aria-hidden /> Read more</>
                      )}
                    </button>
                  )}

                  <p className="mt-3 text-xs text-neutral-400">
                    {a.authorName} · {timeAgo(a.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="announcement-dialog-title"
          onKeyDown={(e) => { if (e.key === 'Escape') closeModal(); }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200/90 bg-white shadow-2xl ring-1 ring-neutral-900/[0.04]">
            <div className="flex items-center justify-between border-b border-neutral-200/90 px-5 py-4">
              <h2 id="announcement-dialog-title" className="font-bold text-neutral-900 text-base">
                {editingId ? 'Edit announcement' : 'New announcement'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1">
                  Title
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-neutral-300/90 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm placeholder-neutral-400 focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
                  placeholder="e.g. Week 3 recap & next steps"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1">
                  Message
                </label>
                <textarea
                  rows={5}
                  className="w-full rounded-lg border border-neutral-300/90 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm placeholder-neutral-400 focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal resize-y"
                  placeholder="What do you want to communicate to your students?"
                  value={draft.body}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                  Audience
                </label>
                <div className="flex gap-3">
                  {(['general', 'course'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, scope: s, courseId: s === 'general' ? null : d.courseId }))}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                        draft.scope === s
                          ? 'border-accent-teal bg-accent-teal/10 text-accent-teal ring-1 ring-accent-teal/40'
                          : 'border-neutral-300/90 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {s === 'general'
                        ? <><Globe className="h-4 w-4" aria-hidden /> All students</>
                        : <><BookOpen className="h-4 w-4" aria-hidden /> Specific course</>}
                    </button>
                  ))}
                </div>
              </div>

              {draft.scope === 'course' && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1">
                    Course
                  </label>
                  <select
                    className="w-full rounded-lg border border-neutral-300/90 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
                    value={draft.courseId ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, courseId: e.target.value || null }))}
                  >
                    <option value="">Select a course…</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.courseCode ? `[${c.courseCode}] ` : ''}{c.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300 text-accent-teal accent-accent-teal"
                  checked={draft.pinned ?? false}
                  onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
                />
                <span className="text-sm text-neutral-700 flex items-center gap-1.5">
                  <Pin className="h-3.5 w-3.5 text-primary-dark" aria-hidden />
                  Pin this announcement to the top
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-neutral-200/90 px-5 py-4">
              <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />Saving…</>
                ) : editingId ? 'Save changes' : 'Post announcement'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
