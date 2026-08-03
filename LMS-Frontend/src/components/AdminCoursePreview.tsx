import { useState, useMemo } from 'react';
import { X, BookOpen, Play, ExternalLink, FileText, ChevronDown, Target, CheckCircle, Eye, Headphones, ClipboardCheck, Upload, Download } from 'lucide-react';
import { getCourseWeeks, type Course, type CourseItem, type CourseSection } from '../types/course';
import { EmbeddedMaterialViewer } from './EmbeddedMaterialViewer';
import { shouldOpenVideoInModal, isDirectAudioFileUrl, isOfficePresentationUrl } from '../utils/mediaUrl';

interface AdminCoursePreviewProps {
  course: Course;
  onClose: () => void;
}

const ICON_BOX = 'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm';

function itemActionLabel(item: CourseItem): string {
  if (item.type === 'video') return 'Play';
  if (item.type === 'audio') return 'Listen';
  if (item.type === 'pdf') return 'View';
  if (item.type === 'quiz') return 'Quiz';
  if (item.type === 'assignment') return 'Submit';
  if (item.type === 'download') return 'Download';
  if (item.type === 'link') {
    const url = item.url ?? '';
    if (shouldOpenVideoInModal(url)) return 'Play';
    if (isDirectAudioFileUrl(url)) return 'Listen';
    if (isOfficePresentationUrl(url)) return 'Slides';
    return 'Open';
  }
  return 'Open';
}

function SectionPreview({
  section,
  onOpenItem,
}: {
  section: CourseSection;
  onOpenItem: (item: CourseItem) => void;
}) {
  const [objOpen, setObjOpen] = useState(false);
  const sorted = [...section.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="rounded-xl border border-neutral-200/90 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-teal/10 text-accent-teal">
          <BookOpen className="h-5 w-5" />
        </span>
        <h3 className="text-base font-semibold text-neutral-800 tracking-tight">{section.title || '(untitled section)'}</h3>
      </div>

      {section.objective && (
        <div className="px-5 py-3 border-b border-neutral-100">
          <button
            type="button"
            onClick={() => setObjOpen((p) => !p)}
            className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-primary-dark transition-colors w-full text-left"
          >
            <Target className="h-4 w-4 text-accent-teal/80 shrink-0" />
            Objective
            <ChevronDown className={`h-4 w-4 ml-auto text-neutral-400 transition-transform ${objOpen ? 'rotate-180' : ''}`} />
          </button>
          {objOpen && (
            <p className="text-sm text-neutral-700 mt-2 max-w-prose leading-relaxed pl-6 border-l-2 border-accent-teal/30 ml-1">
              {section.objective}
            </p>
          )}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="p-3 space-y-1.5">
          {sorted.map((item) => {
            const label = itemActionLabel(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenItem(item)}
                className="w-full text-left grid grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-x-3 items-center rounded-xl border border-neutral-200/90 bg-white hover:bg-neutral-50 hover:border-accent-teal/40 px-3 py-2.5 transition-all shadow-sm group"
              >
                <div className={`${ICON_BOX} ${
                  item.type === 'video'
                    ? 'bg-primary-dark text-white'
                    : item.type === 'pdf'
                    ? 'bg-red-50 text-red-600 border border-red-100'
                    : item.type === 'audio'
                    ? 'bg-purple-50 text-purple-600 border border-purple-100'
                    : item.type === 'quiz'
                    ? 'bg-amber-50 text-amber-600 border border-amber-100'
                    : item.type === 'assignment'
                    ? 'bg-blue-50 text-blue-600 border border-blue-100'
                    : item.type === 'download'
                    ? 'bg-green-50 text-green-600 border border-green-100'
                    : 'bg-neutral-100 text-neutral-600 group-hover:bg-accent-teal group-hover:text-white transition-colors'
                }`}>
                  {item.type === 'video' ? (
                    <Play className="h-5 w-5 ml-0.5" />
                  ) : item.type === 'pdf' ? (
                    <FileText className="h-5 w-5" />
                  ) : item.type === 'audio' ? (
                    <Headphones className="h-5 w-5" />
                  ) : item.type === 'quiz' ? (
                    <ClipboardCheck className="h-5 w-5" />
                  ) : item.type === 'assignment' ? (
                    <Upload className="h-5 w-5" />
                  ) : item.type === 'download' ? (
                    <Download className="h-5 w-5" />
                  ) : shouldOpenVideoInModal((item as { url?: string }).url ?? '') ? (
                    <Play className="h-5 w-5 ml-0.5" />
                  ) : (
                    <ExternalLink className="h-5 w-5" />
                  )}
                </div>
                <span className="font-medium text-neutral-800 truncate">{item.title}</span>
                <span className="text-sm text-accent-teal font-semibold shrink-0">{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {sorted.length === 0 && (
        <p className="px-5 py-4 text-sm text-neutral-500">No items in this section.</p>
      )}

      {section.outcome && (
        <div className="px-5 py-4 border-t border-neutral-100 flex gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-0.5">Outcome</p>
            <p className="text-sm text-neutral-700 leading-relaxed">{section.outcome}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminCoursePreview({ course, onClose }: AdminCoursePreviewProps) {
  const weeks = useMemo(() => getCourseWeeks(course), [course]);
  const [activeWeekId, setActiveWeekId] = useState<string | null>(weeks[0]?.id ?? null);
  const [viewer, setViewer] = useState<{ section: CourseSection; item: CourseItem } | null>(null);

  const activeWeek = weeks.find((w) => w.id === activeWeekId) ?? weeks[0] ?? null;

  const openItem = (section: CourseSection, item: CourseItem) => {
    setViewer({ section, item });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal aria-label="Course preview">
      {/* Header banner */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary-dark text-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
            <Eye className="h-4 w-4" />
          </span>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/70 block leading-none">Admin Preview</span>
            <span className="text-sm font-bold leading-snug">{course.title}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Week rail */}
        {weeks.length > 0 && (
          <nav className="hidden md:flex w-52 xl:w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 overflow-y-auto">
            <div className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Weeks</div>
            <div className="flex-1 p-2 space-y-1">
              {weeks.map((week) => {
                const active = week.id === activeWeekId;
                const itemCount = week.sections.reduce((n, s) => n + s.items.length, 0);
                return (
                  <button
                    key={week.id}
                    type="button"
                    onClick={() => { setActiveWeekId(week.id); setViewer(null); }}
                    className={[
                      'w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                      active
                        ? 'bg-accent-teal/10 text-primary-dark shadow-sm shadow-[inset_3px_0_0_0_#3d7a8c] border border-accent-teal/25'
                        : 'text-neutral-600 hover:bg-white border border-transparent hover:border-neutral-200/60',
                    ].join(' ')}
                  >
                    <span className="block truncate">{week.title}</span>
                    <span className="block text-xs font-normal text-neutral-500 mt-0.5">
                      {week.sections.length} section{week.sections.length !== 1 ? 's' : ''}
                      {itemCount > 0 ? ` · ${itemCount} item${itemCount !== 1 ? 's' : ''}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        {/* Mobile week tabs */}
        {weeks.length > 0 && (
          <div className="md:hidden absolute top-[52px] left-0 right-0 z-10 border-b border-neutral-200 bg-neutral-50 px-2 py-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {weeks.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => { setActiveWeekId(w.id); setViewer(null); }}
                  className={[
                    'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all border',
                    w.id === activeWeekId
                      ? 'bg-accent-teal/12 text-primary-dark border-accent-teal/45'
                      : 'bg-white text-neutral-600 border-neutral-200/90 hover:bg-white/80',
                  ].join(' ')}
                >
                  {w.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-neutral-50/50">
          {viewer ? (
            <EmbeddedMaterialViewer
              section={viewer.section}
              item={viewer.item}
              onClose={() => setViewer(null)}
            />
          ) : activeWeek ? (
            <div className="space-y-5 w-full max-w-4xl">
              <h2 className="text-lg font-bold text-neutral-800 tracking-tight">{activeWeek.title}</h2>
              {activeWeek.sections.length === 0 && (
                <p className="text-sm text-neutral-500">No sections in this week yet.</p>
              )}
              {activeWeek.sections.map((sec) => (
                <SectionPreview
                  key={sec.id}
                  section={sec}
                  onOpenItem={(item) => openItem(sec, item)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No content available for this course.</p>
          )}
        </div>
      </div>
    </div>
  );
}
