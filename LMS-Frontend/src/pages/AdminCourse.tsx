import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import Input, { TextArea } from '../components/Input';
import { courseService } from '../services/courseService';
import { getCourseWeeks, type Course, type CourseItem } from '../types/course';
import {
  BookOpen,
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
  Loader2,
  GripVertical,
  Upload,
  Download,
  Eye,
  FileSpreadsheet,
  X,
  AlertCircle,
} from 'lucide-react';
import { documentsService } from '../services/documentsService';
import { getErrorMessage } from '../utils/apiError';
import { useAuth } from '../context/useAuth';
import { AdminCoursePageSkeleton } from '../components/PageSkeletons';
import { AdminCoursePreview } from '../components/AdminCoursePreview';

type ItemDraft = {
  tempId: string;
  type: 'video' | 'link' | 'pdf';
  title: string;
  order: number;
  url?: string;
  documentId?: string;
  fileUrl?: string;
  /** Shown above the resource in the student viewer. */
  information?: string;
};

type SectionDraft = {
  tempId: string;
  title: string;
  objective: string;
  outcome: string;
  items: ItemDraft[];
};

type WeekDraft = {
  tempId: string;
  title: string;
  order: number;
  sections: SectionDraft[];
};

function newTempId(): string {
  return 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function pickDocumentUploadCategory(categories: string[]): string {
  const preferred = [
    'Reference Materials',
    'Lecture Notes',
    'Course Materials',
    'Tutorials',
    'Study Guides',
    'Other',
  ];
  for (const p of preferred) {
    if (categories.includes(p)) return p;
  }
  return categories[0] ?? 'Other';
}

const ADMIN_COURSE_STORAGE_KEY = 'lms:adminCourseEditor:';

type AdminCourseStored = { mode: 'list' | 'new' | 'edit'; courseId?: string };

const CSV_TEMPLATE_HEADER = 'week,section,objective,outcome,type,title,url,information';
const CSV_TEMPLATE_ROWS = [
  'Week 1,Introduction,Understand the core concepts,,video,Module Overview,https://www.youtube.com/watch?v=EXAMPLE,Watch this before continuing',
  'Week 1,Introduction,,,link,Supporting article,https://example.com/article,',
  'Week 1,Introduction,,,pdf,Reading material,,https://example.com/reading.pdf',
  'Week 2,Deep Dive,Apply knowledge in practice,Can build a working example,video,Hands-on Tutorial,https://www.youtube.com/watch?v=EXAMPLE2,',
];
const CSV_TEMPLATE = [CSV_TEMPLATE_HEADER, ...CSV_TEMPLATE_ROWS].join('\n');

function downloadCourseTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'course-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function exportCourseToCSV(courseTitle: string, weeks: WeekDraft[]): void {
  const rows: string[] = [CSV_TEMPLATE_HEADER];
  for (const week of weeks) {
    for (const sec of week.sections) {
      if (sec.items.length === 0) {
        rows.push(csvRow([week.title, sec.title, sec.objective, sec.outcome, '', '', '', '']));
      } else {
        for (const it of sec.items) {
          const url = it.type !== 'pdf' ? (it.url || '') : (it.fileUrl || '');
          rows.push(csvRow([week.title, sec.title, sec.objective, sec.outcome, it.type, it.title, url, it.information || '']));
        }
      }
    }
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${courseTitle.trim().replace(/\s+/g, '-').toLowerCase() || 'course'}-export.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvRow(fields: string[]): string {
  return fields.map((f) => `"${(f ?? '').replace(/"/g, '""')}"`).join(',');
}

type ParsedCSVResult = {
  weeks: WeekDraft[];
  errors: string[];
};

function parseImportCSV(raw: string): ParsedCSVResult {
  const errors: string[] = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { weeks: [], errors: ['CSV is empty or has no data rows.'] };

  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const weekIdx = header.indexOf('week');
  const secIdx = header.indexOf('section');
  const objIdx = header.indexOf('objective');
  const outIdx = header.indexOf('outcome');
  const typeIdx = header.indexOf('type');
  const titleIdx = header.indexOf('title');
  const urlIdx = header.indexOf('url');
  const infoIdx = header.indexOf('information');

  if (weekIdx < 0 || secIdx < 0) {
    return { weeks: [], errors: ['CSV must have "week" and "section" columns.'] };
  }

  // ordered map: weekTitle → sectionTitle → draft
  const weekMap = new Map<string, { draft: WeekDraft; secMap: Map<string, SectionDraft> }>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const weekTitle = (cols[weekIdx] ?? '').trim();
    const secTitle = (cols[secIdx] ?? '').trim();
    if (!weekTitle && !secTitle) continue;

    if (!weekMap.has(weekTitle)) {
      weekMap.set(weekTitle, {
        draft: { tempId: newTempId(), title: weekTitle || `Week ${weekMap.size + 1}`, order: weekMap.size + 1, sections: [] },
        secMap: new Map(),
      });
    }

    const { draft: weekDraft, secMap } = weekMap.get(weekTitle)!;

    if (!secMap.has(secTitle)) {
      const secDraft: SectionDraft = {
        tempId: newTempId(),
        title: secTitle,
        objective: objIdx >= 0 ? (cols[objIdx] ?? '').trim() : '',
        outcome: outIdx >= 0 ? (cols[outIdx] ?? '').trim() : '',
        items: [],
      };
      secMap.set(secTitle, secDraft);
      weekDraft.sections.push(secDraft);
    }

    const secDraft = secMap.get(secTitle)!;
    const itemType = typeIdx >= 0 ? (cols[typeIdx] ?? '').trim().toLowerCase() : '';
    const itemTitle = titleIdx >= 0 ? (cols[titleIdx] ?? '').trim() : '';
    const itemUrl = urlIdx >= 0 ? (cols[urlIdx] ?? '').trim() : '';
    const itemInfo = infoIdx >= 0 ? (cols[infoIdx] ?? '').trim() : '';

    if (itemTitle && (itemType === 'video' || itemType === 'link' || itemType === 'pdf')) {
      const order = secDraft.items.length + 1;
      if (itemType === 'pdf') {
        secDraft.items.push({ tempId: newTempId(), type: 'pdf', title: itemTitle, order, fileUrl: itemUrl || undefined, information: itemInfo });
      } else {
        secDraft.items.push({ tempId: newTempId(), type: itemType as 'video' | 'link', title: itemTitle, url: itemUrl, order, information: itemInfo });
      }
    } else if (itemTitle && itemType) {
      errors.push(`Row ${i + 1}: unknown type "${itemType}" — use video, link, or pdf.`);
    }
  }

  const weeks = [...weekMap.values()].map((v) => v.draft);
  return { weeks, errors };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

function readAdminCourseStored(userId: string | undefined): AdminCourseStored | null {
  try {
    const raw = localStorage.getItem(ADMIN_COURSE_STORAGE_KEY + (userId ?? 'anon'));
    if (!raw) return null;
    const j = JSON.parse(raw) as { mode?: string; courseId?: string };
    if (j.mode !== 'list' && j.mode !== 'new' && j.mode !== 'edit') return null;
    return { mode: j.mode, courseId: typeof j.courseId === 'string' ? j.courseId : undefined };
  } catch {
    return null;
  }
}

function writeAdminCourseStored(userId: string | undefined, data: AdminCourseStored) {
  try {
    localStorage.setItem(ADMIN_COURSE_STORAGE_KEY + (userId ?? 'anon'), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

const AdminCourse: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const qNew = searchParams.get('new') === '1';
  const qCourse = searchParams.get('course');
  const skipNextUrlSync = useRef(false);

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [weeks, setWeeks] = useState<WeekDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState<{ id: string; title: string; category: string }[]>([]);
  const [docCategories, setDocCategories] = useState<string[]>([]);
  const [pdfUploadingItemTempId, setPdfUploadingItemTempId] = useState<string | null>(null);

  // CSV import state
  const [importOpen, setImportOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importParsed, setImportParsed] = useState<WeekDraft[] | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewCourse, setPreviewCourse] = useState<Course | null>(null);

  const loadCourses = useCallback((opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setCoursesLoading(true);
    courseService
      .fetchCourses()
      .then(setCourses)
      .catch(() => setCourses([]))
      .finally(() => {
        if (!silent) setCoursesLoading(false);
      });
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    documentsService.getAll().then((res) => {
      setDocuments(res.documents.map((d) => ({ id: d.id, title: d.title, category: d.category })));
    }).catch(() => setDocuments([]));
  }, []);

  useEffect(() => {
    documentsService.getCategories().then(setDocCategories).catch(() => setDocCategories([]));
  }, []);

  const refreshDocumentsList = useCallback(() => {
    documentsService
      .getAll()
      .then((res) => {
        setDocuments(res.documents.map((d) => ({ id: d.id, title: d.title, category: d.category })));
      })
      .catch(() => {});
  }, []);

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? '';
      const { weeks: parsed, errors } = parseImportCSV(text);
      setImportParsed(parsed.length > 0 ? parsed : null);
      setImportErrors(errors);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyCSVImport = () => {
    if (!importParsed) return;
    setWeeks(importParsed);
    setImportOpen(false);
    setImportParsed(null);
    setImportErrors([]);
    setImportFileName('');
  };

  const handlePdfUploadForItem = async (
    weekTempId: string,
    sectionTempId: string,
    item: ItemDraft,
    fileList: FileList | null
  ) => {
    const file = fileList?.[0];
    if (!file || item.type !== 'pdf') return;
    const looksPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!looksPdf) {
      alert('Please choose a PDF file (.pdf).');
      return;
    }
    setPdfUploadingItemTempId(item.tempId);
    try {
      const created = await documentsService.create({
        title: item.title.trim() || file.name.replace(/\.pdf$/i, ''),
        description: `Uploaded from the course editor for “${courseTitle.trim() || 'course'}”.`,
        category: pickDocumentUploadCategory(docCategories),
        file,
        courseIds: editingId ? [editingId] : undefined,
      });
      updateItem(weekTempId, sectionTempId, item.tempId, {
        documentId: created.id,
        fileUrl: undefined,
      });
      refreshDocumentsList();
    } catch (e) {
      alert(getErrorMessage(e, 'Could not upload the PDF. Try again or use Resources → upload there.'));
    } finally {
      setPdfUploadingItemTempId(null);
    }
  };

  const startNew = () => {
    setEditingId(null);
    setCourseTitle('');
    setCourseDescription('');
    setCourseCode('');
    setWeeks([]);
  };

  const startEdit = (course: Course) => {
    setEditingId(course.id);
    setCourseTitle(course.title);
    setCourseDescription(course.description || '');
    setCourseCode(course.courseCode ?? '');
    const courseWeeks = getCourseWeeks(course);
    setWeeks(
      courseWeeks.map((w, wi) => ({
        tempId: w.id,
        title: w.title,
        order: wi + 1,
        sections: (w.sections || []).map((s) => ({
          tempId: s.id,
          title: s.title,
          objective: s.objective || '',
          outcome: s.outcome || '',
          items: (s.items || []).map((it, i) => ({
            tempId: it.id,
            type: it.type,
            title: it.title,
            order: it.order ?? i + 1,
            url: it.type !== 'pdf' ? (it as { url: string }).url : undefined,
            documentId: it.type === 'pdf' ? (it as { documentId?: string }).documentId : undefined,
            fileUrl: it.type === 'pdf' ? (it as { fileUrl?: string }).fileUrl : undefined,
            information: (it as { information?: string }).information || '',
          })),
        })),
      }))
    );
  };

  const applyNewDraftFromUrl = () => {
    setEditingId(null);
    setCourseTitle('');
    setCourseDescription('');
    setCourseCode('');
    setWeeks([{ tempId: newTempId(), title: 'Week 1', order: 1, sections: [] }]);
  };

  const resetToCourseList = () => {
    startNew();
    skipNextUrlSync.current = true;
    setSearchParams({}, { replace: true });
    writeAdminCourseStored(user?.id, { mode: 'list' });
  };

  const openNewCourseForm = () => {
    applyNewDraftFromUrl();
    skipNextUrlSync.current = true;
    setSearchParams({ new: '1' }, { replace: false });
    writeAdminCourseStored(user?.id, { mode: 'new' });
  };

  const openEditCourseWithUrl = (course: Course) => {
    startEdit(course);
    skipNextUrlSync.current = true;
    setSearchParams({ course: course.id }, { replace: false });
    writeAdminCourseStored(user?.id, { mode: 'edit', courseId: course.id });
  };

  const coursesKey = useMemo(() => courses.map((c) => c.id).sort().join(','), [courses]);

  useEffect(() => {
    if (coursesLoading) return;
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }

    if (courses.length === 0) {
      startNew();
      if (qNew || qCourse) {
        skipNextUrlSync.current = true;
        setSearchParams({}, { replace: true });
      }
      writeAdminCourseStored(user?.id, { mode: 'list' });
      return;
    }

    const stored = readAdminCourseStored(user?.id);

    if (qNew) {
      applyNewDraftFromUrl();
      writeAdminCourseStored(user?.id, { mode: 'new' });
      if (qCourse) {
        skipNextUrlSync.current = true;
        setSearchParams({ new: '1' }, { replace: true });
      }
      return;
    }

    if (qCourse && courses.some((c) => c.id === qCourse)) {
      const c = courses.find((x) => x.id === qCourse)!;
      startEdit(c);
      writeAdminCourseStored(user?.id, { mode: 'edit', courseId: c.id });
      if (qNew) {
        skipNextUrlSync.current = true;
        setSearchParams({ course: qCourse }, { replace: true });
      }
      return;
    }

    if (qCourse && !courses.some((c) => c.id === qCourse)) {
      skipNextUrlSync.current = true;
      setSearchParams({}, { replace: true });
      startNew();
      writeAdminCourseStored(user?.id, { mode: 'list' });
      return;
    }

    if (!qNew && !qCourse && stored?.mode === 'edit' && stored.courseId && courses.some((c) => c.id === stored.courseId)) {
      const c = courses.find((x) => x.id === stored.courseId)!;
      startEdit(c);
      skipNextUrlSync.current = true;
      setSearchParams({ course: c.id }, { replace: true });
      writeAdminCourseStored(user?.id, { mode: 'edit', courseId: c.id });
      return;
    }

    if (!qNew && !qCourse && stored?.mode === 'new') {
      applyNewDraftFromUrl();
      skipNextUrlSync.current = true;
      setSearchParams({ new: '1' }, { replace: true });
      writeAdminCourseStored(user?.id, { mode: 'new' });
      return;
    }

    if (!qNew && !qCourse) {
      startNew();
      writeAdminCourseStored(user?.id, { mode: 'list' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL/storage sync; startNew/startEdit intentionally omitted
  }, [coursesLoading, coursesKey, qNew, qCourse, user?.id, setSearchParams]);

  const addWeek = () => {
    const order = weeks.length + 1;
    setWeeks((prev) => [
      ...prev,
      { tempId: newTempId(), title: `Week ${order}`, order, sections: [] },
    ]);
  };

  const updateWeek = (weekTempId: string, patch: Partial<WeekDraft>) => {
    setWeeks((prev) => prev.map((w) => (w.tempId === weekTempId ? { ...w, ...patch } : w)));
  };

  const removeWeek = (weekTempId: string) => {
    setWeeks((prev) => prev.filter((w) => w.tempId !== weekTempId));
  };

  const addSection = (weekTempId: string) => {
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.tempId !== weekTempId) return w;
        return {
          ...w,
          sections: [
            ...w.sections,
            { tempId: newTempId(), title: '', objective: '', outcome: '', items: [] },
          ],
        };
      })
    );
  };

  const updateSection = (weekTempId: string, sectionTempId: string, patch: Partial<SectionDraft>) => {
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.tempId !== weekTempId) return w;
        return {
          ...w,
          sections: w.sections.map((s) => (s.tempId === sectionTempId ? { ...s, ...patch } : s)),
        };
      })
    );
  };

  const removeSection = (weekTempId: string, sectionTempId: string) => {
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.tempId !== weekTempId) return w;
        return { ...w, sections: w.sections.filter((s) => s.tempId !== sectionTempId) };
      })
    );
  };

  const addItem = (weekTempId: string, sectionTempId: string) => {
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.tempId !== weekTempId) return w;
        return {
          ...w,
          sections: w.sections.map((s) => {
            if (s.tempId !== sectionTempId) return s;
            const order = s.items.length + 1;
            return {
              ...s,
              items: [
                ...s.items,
                { tempId: newTempId(), type: 'video', title: '', order, url: '', information: '' },
              ],
            };
          }),
        };
      })
    );
  };

  const updateItem = (weekTempId: string, sectionTempId: string, itemTempId: string, patch: Partial<ItemDraft>) => {
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.tempId !== weekTempId) return w;
        return {
          ...w,
          sections: w.sections.map((s) => {
            if (s.tempId !== sectionTempId) return s;
            return {
              ...s,
              items: s.items.map((it) => (it.tempId === itemTempId ? { ...it, ...patch } : it)),
            };
          }),
        };
      })
    );
  };

  const removeItem = (weekTempId: string, sectionTempId: string, itemTempId: string) => {
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.tempId !== weekTempId) return w;
        return {
          ...w,
          sections: w.sections.map((s) => {
            if (s.tempId !== sectionTempId) return s;
            return { ...s, items: s.items.filter((it) => it.tempId !== itemTempId) };
          }),
        };
      })
    );
  };

  const buildCourse = (): Course => {
    const id = editingId || courseService.generateId();
    const code = courseCode.trim() || id.replace(/\s+/g, '-').toUpperCase().slice(0, 32);
    return {
      id,
      title: courseTitle.trim(),
      description: courseDescription.trim() || undefined,
      courseCode: code,
      weeks: weeks.map((w, wi) => ({
        id: w.tempId.startsWith('tmp-') ? courseService.generateId() : w.tempId,
        title: w.title.trim() || `Week ${wi + 1}`,
        order: wi + 1,
        sections: w.sections.map((s) => ({
          id: s.tempId.startsWith('tmp-') ? courseService.generateId() : s.tempId,
          title: s.title.trim(),
          objective: s.objective.trim() || undefined,
          outcome: s.outcome.trim() || undefined,
          items: s.items
            .filter((it) => it.title.trim())
            .map((it, i) => {
              const base = {
                id: it.tempId.startsWith('tmp-') ? courseService.generateId() : it.tempId,
                title: it.title.trim(),
                order: i + 1,
                ...(it.information?.trim() ? { information: it.information.trim() } : {}),
              };
              if (it.type === 'video') {
                return { ...base, type: 'video' as const, url: (it.url || '').trim() };
              }
              if (it.type === 'link') {
                return { ...base, type: 'link' as const, url: (it.url || '').trim() };
              }
              return {
                ...base,
                type: 'pdf' as const,
                documentId: it.documentId?.trim() || undefined,
                fileUrl: it.fileUrl?.trim() || undefined,
              };
            }) as CourseItem[],
        })),
      })),
    };
  };

  const handleSave = async () => {
    if (!courseTitle.trim()) return;
    setSaving(true);
    try {
      const course = buildCourse();
      if (editingId) {
        await courseService.updateCourse(editingId, course);
      } else {
        await courseService.createCourse(course);
      }
      loadCourses({ silent: true });
      resetToCourseList();
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, 'Could not save the course.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this course? Students will no longer see it.')) return;
    try {
      await courseService.deleteCourse(id);
      loadCourses({ silent: true });
      if (editingId === id) resetToCourseList();
    } catch (e) {
      console.error(e);
      alert(getErrorMessage(e, 'Could not delete the course.'));
    }
  };

  const showForm = editingId !== null || courseTitle !== '' || weeks.length > 0;

  if (coursesLoading) {
    return <AdminCoursePageSkeleton />;
  }

  return (
    <div>
      <div className="mb-8 flex items-center">
        <BookOpen className="h-8 w-8 text-primary-600 mr-3 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-neutral-800">Courses</h1>
          <p className="text-neutral-600 mt-1 max-w-prose">
            Create and edit courses by week (Week 1, 2, 3…). Each week has sections with videos, links, and PDFs. Links use{' '}
            <code className="text-sm bg-neutral-100 px-1 rounded">?course=…</code> to edit a course or{' '}
            <code className="text-sm bg-neutral-100 px-1 rounded">?new=1</code> for a new draft (bookmarkable).
          </p>
        </div>
      </div>

      {!showForm ? (
        <>
          <div className="flex flex-wrap gap-3 mb-6">
            <Button onClick={openNewCourseForm}>
              <Plus className="h-4 w-4 mr-2" />
              Create course
            </Button>
            <Button variant="outline" onClick={downloadCourseTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download CSV template
            </Button>
          </div>
          <div className="space-y-4">
            {courses.map((c) => {
              const courseWeeks = getCourseWeeks(c);
              const sectionCount = courseWeeks.reduce((n, w) => n + w.sections.length, 0);
              return (
                <Card key={c.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-neutral-800">{c.title}</h3>
                      <p className="text-sm text-neutral-500 mt-0.5">
                        Code: <span className="font-medium text-neutral-700">{c.courseCode ?? c.id}</span>
                        {' · '}
                        {courseWeeks.length} week{courseWeeks.length !== 1 ? 's' : ''}, {sectionCount} section{sectionCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => setPreviewCourse(c)}>
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEditCourseWithUrl(c)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(c.id)} className="text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h2 className="text-xl font-semibold text-neutral-800">
                {editingId ? 'Edit course' : 'New course'}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { setImportOpen(true); setImportParsed(null); setImportErrors([]); setImportFileName(''); }}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Import CSV
                </Button>
                {weeks.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => exportCourseToCSV(courseTitle, weeks)}>
                    <Download className="h-4 w-4 mr-1" />
                    Export CSV
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={resetToCourseList}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>

            <div className="space-y-6">
              <Input
                label="Course title"
                placeholder="e.g. Blockchain Basics"
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
              />
              <Input
                label="Course code"
                placeholder="e.g. BLOCKCHAIN-101 (students with this code can access the course)"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
              />
              <TextArea
                label="Description (optional)"
                placeholder="Short description of the course"
                value={courseDescription}
                onChange={(e) => setCourseDescription(e.target.value)}
                rows={2}
              />

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-neutral-800">Weeks</span>
                  <Button type="button" variant="outline" size="sm" onClick={addWeek}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add week
                  </Button>
                </div>
                {weeks.length === 0 && (
                  <p className="text-sm text-neutral-500 mb-3">Add at least one week (e.g. Week 1, Week 2), then add sections under each week.</p>
                )}
                <div className="space-y-8">
                  {weeks.map((week) => (
                    <div key={week.tempId} className="border border-neutral-300 rounded-lg p-5 bg-neutral-50">
                      <div className="flex items-center justify-between mb-4">
                        <Input
                          placeholder="e.g. Week 1"
                          value={week.title}
                          onChange={(e) => updateWeek(week.tempId, { title: e.target.value })}
                          className="font-semibold text-neutral-800 max-w-[200px]"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => removeWeek(week.tempId)} className="text-red-600 shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="ml-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-neutral-600">Sections</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => addSection(week.tempId)}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add section
                          </Button>
                        </div>
                        <div className="space-y-6">
                          {week.sections.map((sec) => (
                            <div key={sec.tempId} className="border border-neutral-200 rounded-lg p-4 bg-white">
                              <div className="flex items-start gap-2 mb-3">
                                <GripVertical className="h-5 w-5 text-neutral-400 mt-1" />
                                <div className="flex-1 space-y-2">
                                  <Input
                                    placeholder="Section title (e.g. Day 1 - Introduction)"
                                    value={sec.title}
                                    onChange={(e) => updateSection(week.tempId, sec.tempId, { title: e.target.value })}
                                  />
                                  <Input
                                    placeholder="Objective (optional)"
                                    value={sec.objective}
                                    onChange={(e) => updateSection(week.tempId, sec.tempId, { objective: e.target.value })}
                                  />
                                  <Input
                                    placeholder="Outcome (optional)"
                                    value={sec.outcome}
                                    onChange={(e) => updateSection(week.tempId, sec.tempId, { outcome: e.target.value })}
                                  />
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => removeSection(week.tempId, sec.tempId)} className="text-red-600 shrink-0">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="ml-7">
                                <p className="text-sm font-medium text-neutral-600 mb-2">Items (videos, links, PDFs)</p>
                                {sec.items.map((it) => (
                                  <div key={it.tempId} className="mb-4 p-3 bg-neutral-50 border border-neutral-200 rounded space-y-2">
                                    <div className="flex flex-wrap gap-2 items-start">
                                      <select
                                        value={it.type}
                                        onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { type: e.target.value as ItemDraft['type'] })}
                                        className="rounded border border-neutral-300 px-2 py-1 text-sm"
                                      >
                                        <option value="video">Video</option>
                                        <option value="link">Link</option>
                                        <option value="pdf">PDF</option>
                                      </select>
                                      <Input
                                        placeholder="Title"
                                        value={it.title}
                                        onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { title: e.target.value })}
                                        className="flex-1 min-w-[120px]"
                                      />
                                      {it.type !== 'pdf' && (
                                        <Input
                                          placeholder={it.type === 'video' ? 'YouTube URL or direct .mp4 / .webm link' : 'URL'}
                                          value={it.url || ''}
                                          onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { url: e.target.value })}
                                          className="flex-1 min-w-[200px]"
                                        />
                                      )}
                                      {it.type === 'pdf' && (
                                        <>
                                          <select
                                            value={it.documentId || ''}
                                            onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { documentId: e.target.value || undefined, fileUrl: undefined })}
                                            className="rounded border border-neutral-300 px-2 py-1 text-sm min-w-[180px]"
                                          >
                                            <option value="">— Library —</option>
                                            {documents.map((d) => (
                                              <option key={d.id} value={d.id}>{d.title}</option>
                                            ))}
                                          </select>
                                          <input
                                            type="file"
                                            accept="application/pdf,.pdf"
                                            className="hidden"
                                            id={`admin-course-pdf-${it.tempId}`}
                                            onChange={(e) => {
                                              void handlePdfUploadForItem(week.tempId, sec.tempId, it, e.target.files);
                                              e.target.value = '';
                                            }}
                                            disabled={pdfUploadingItemTempId === it.tempId}
                                          />
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 gap-1"
                                            disabled={pdfUploadingItemTempId === it.tempId}
                                            onClick={() => document.getElementById(`admin-course-pdf-${it.tempId}`)?.click()}
                                            title="Upload a PDF to Resources and attach it to this item"
                                          >
                                            {pdfUploadingItemTempId === it.tempId ? (
                                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                            ) : (
                                              <Upload className="h-4 w-4" aria-hidden />
                                            )}
                                            Upload PDF
                                          </Button>
                                          <Input
                                            placeholder="Or direct PDF URL"
                                            value={it.fileUrl || ''}
                                            onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { fileUrl: e.target.value || undefined })}
                                            className="flex-1 min-w-[200px]"
                                          />
                                          <p className="w-full text-xs text-neutral-500 -mt-0.5">
                                            Upload sends the file to Resources and selects it here.{' '}
                                            {editingId
                                              ? 'New uploads are restricted to students who can access this course.'
                                              : 'After you save the course, re-upload or set access under Resources if you need course-only visibility.'}
                                          </p>
                                        </>
                                      )}
                                      <Button type="button" variant="outline" size="sm" onClick={() => removeItem(week.tempId, sec.tempId, it.tempId)} className="text-red-600 shrink-0">
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <TextArea
                                      placeholder="Student information (optional) — instructions or context shown above this resource in the course viewer."
                                      value={it.information || ''}
                                      onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { information: e.target.value })}
                                      rows={3}
                                      className="w-full text-sm min-h-[4.5rem]"
                                    />
                                  </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => addItem(week.tempId, sec.tempId)}>
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add item
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button onClick={handleSave} disabled={saving || !courseTitle.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save course
                </Button>
                <Button variant="outline" onClick={resetToCourseList}>Cancel</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* CSV Import Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setImportOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-800">Import course structure from CSV</h3>
              <button type="button" onClick={() => setImportOpen(false)} className="rounded-lg p-1.5 hover:bg-neutral-100 text-neutral-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Upload a CSV with columns: <code className="bg-neutral-100 px-1 rounded text-xs">week, section, objective, outcome, type, title, url, information</code>.
              Each row = one content item. Rows with the same week + section are grouped together.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={downloadCourseTemplate}>
                <Download className="h-4 w-4 mr-1" />
                Download template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => csvInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1" />
                {importFileName ? importFileName : 'Choose CSV file'}
              </Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleCSVFileChange}
              />
            </div>

            {importErrors.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Parse warnings
                </div>
                {importErrors.map((err, i) => (
                  <p key={i} className="text-xs text-amber-700 pl-6">{err}</p>
                ))}
              </div>
            )}

            {importParsed && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 space-y-1">
                <p className="font-semibold">Preview: {importParsed.length} week{importParsed.length !== 1 ? 's' : ''} parsed</p>
                {importParsed.map((w) => (
                  <p key={w.tempId} className="text-xs pl-2">
                    <span className="font-medium">{w.title}</span>
                    {' · '}{w.sections.length} section{w.sections.length !== 1 ? 's' : ''}
                    {' · '}{w.sections.reduce((n, s) => n + s.items.length, 0)} items
                  </p>
                ))}
                <p className="text-xs text-green-700 pt-1">This will <strong>replace</strong> the current week/section structure (course title and code stay the same).</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={applyCSVImport} disabled={!importParsed}>
                Apply import
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Course Preview */}
      {previewCourse && (
        <AdminCoursePreview course={previewCourse} onClose={() => setPreviewCourse(null)} />
      )}
    </div>
  );
};

export default AdminCourse;
