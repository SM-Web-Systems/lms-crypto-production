import React, { useState, useRef, useCallback } from 'react';
import { Button } from './Button';
import { X, Upload, FileSpreadsheet, FolderOpen, Loader2, AlertTriangle, Trash2, ChevronRight, ChevronLeft, Check, Code } from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';
import { toastSuccess } from '../utils/toastBus';

/* ─── Preview types ─── */

type PreviewItem = {
  id: string;
  title: string;
  type: 'video' | 'link' | 'pdf' | 'text' | 'audio' | 'quiz' | 'assignment' | 'download';
  fileName?: string;
  documentId?: string;
  url?: string;
  quizId?: string;
  description?: string;
  information?: string;
  warnings: string[];
};

type PreviewSection = {
  id: string;
  week: string;
  title: string;
  items: PreviewItem[];
};

type ImportSource = 'zip' | 'csv' | 'folder' | 'github' | null;

const VALID_TYPES = ['video', 'link', 'pdf', 'text', 'audio', 'quiz', 'assignment', 'download'] as const;

/* ─── CSV parsing (duplicated from AdminCourse.tsx to keep wizard self-contained) ─── */

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

function newId(): string {
  return 'iw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function parseCSVToPreview(raw: string): { sections: PreviewSection[]; errors: string[] } {
  const errors: string[] = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { sections: [], errors: ['CSV is empty or has no data rows.'] };

  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const weekIdx = header.indexOf('week');
  const secIdx = header.indexOf('section');
  const objIdx = header.indexOf('objective');
  const typeIdx = header.indexOf('type');
  const titleIdx = header.indexOf('title');
  const urlIdx = header.indexOf('url');
  const infoIdx = header.indexOf('information');
  const quizIdIdx = header.indexOf('quizid');
  const descIdx = header.indexOf('description');
  const fileNameIdx = header.indexOf('filename');
  const docIdIdx = header.indexOf('documentid');

  if (weekIdx < 0 || secIdx < 0) {
    return { sections: [], errors: ['CSV must have "week" and "section" columns.'] };
  }

  // objIdx used for future extension — suppress lint warning
  void objIdx;

  const sectionMap = new Map<string, PreviewSection>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const weekTitle = (cols[weekIdx] ?? '').trim() || 'Week 1';
    const secTitle = (cols[secIdx] ?? '').trim() || 'Imported';
    const itemType = typeIdx >= 0 ? (cols[typeIdx] ?? '').trim().toLowerCase() : '';
    const itemTitle = titleIdx >= 0 ? (cols[titleIdx] ?? '').trim() : '';

    const key = `${weekTitle}||${secTitle}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, { id: newId(), week: weekTitle, title: secTitle, items: [] });
    }

    if (!itemTitle || !itemType) continue;

    const warnings: string[] = [];
    if (!VALID_TYPES.includes(itemType as typeof VALID_TYPES[number])) {
      errors.push(`Row ${i + 1}: unknown type "${itemType}"`);
      continue;
    }

    const url = urlIdx >= 0 ? (cols[urlIdx] ?? '').trim() : '';
    if (['video', 'link', 'audio'].includes(itemType) && !url) {
      warnings.push(`URL required for ${itemType} items`);
    }
    const quizId = quizIdIdx >= 0 ? (cols[quizIdIdx] ?? '').trim() : '';
    if (itemType === 'quiz' && !quizId) {
      warnings.push('Quiz ID required');
    }
    const fileName = fileNameIdx >= 0 ? (cols[fileNameIdx] ?? '').trim() : '';
    if (itemType === 'download' && !fileName) {
      warnings.push('File name required');
    }

    sectionMap.get(key)!.items.push({
      id: newId(),
      title: itemTitle,
      type: itemType as PreviewItem['type'],
      url: url || undefined,
      quizId: quizId || undefined,
      description: descIdx >= 0 ? (cols[descIdx] ?? '').trim() || undefined : undefined,
      information: infoIdx >= 0 ? (cols[infoIdx] ?? '').trim() || undefined : undefined,
      fileName: fileName || undefined,
      documentId: docIdIdx >= 0 ? (cols[docIdIdx] ?? '').trim() || undefined : undefined,
      warnings,
    });
  }

  return { sections: [...sectionMap.values()], errors };
}

/* ─── Main component ─── */

type ImportWizardProps = {
  open: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  onImportComplete: () => void;
};

/** MIME types the server accepts for documents. */
const DOC_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
  'text/markdown',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
]);

function mimeToItemType(mime: string): 'pdf' | 'download' | 'text' {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/markdown') return 'text';
  return 'download';
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export default function ImportWizard({ open, onClose, courseId, courseTitle, onImportComplete }: ImportWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [source, setSource] = useState<ImportSource>(null);
  const [sections, setSections] = useState<PreviewSection[]>([]);
  const [globalWarnings, setGlobalWarnings] = useState<string[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState('');
  const [folderProgress, setFolderProgress] = useState<{ done: number; total: number } | null>(null);

  const [githubUrl, setGithubUrl] = useState('');
  const [githubSubPath, setGithubSubPath] = useState('');
  const [githubRef, setGithubRef] = useState('main');
  const [githubError, setGithubError] = useState('');
  const [githubLoading, setGithubLoading] = useState(false);

  const zipInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep(1);
    setSource(null);
    setSections([]);
    setGlobalWarnings([]);
    setParseErrors([]);
    setLoading(false);
    setImportMode('append');
    setCommitting(false);
    setCommitError('');
    setFolderProgress(null);
    setGithubUrl('');
    setGithubSubPath('');
    setGithubRef('main');
    setGithubError('');
    setGithubLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    if (committing || loading) return;
    reset();
    onClose();
  }, [committing, loading, reset, onClose]);

  /* ── ZIP source ── */
  const handleZipFile = useCallback(async (file: File) => {
    setLoading(true);
    setParseErrors([]);
    try {
      const formData = new FormData();
      formData.append('zipfile', file);
      const res = await fetch(`/api/v1/courses/${courseId}/import/zip`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lms_token')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setParseErrors([data.error?.message || 'ZIP upload failed']);
        return;
      }
      const preview = data.data.preview;
      // Convert server preview to local format with IDs
      const mapped: PreviewSection[] = preview.sections.map((s: { title: string; week: string; items: Array<{ title: string; type: string; fileName: string; documentId: string; warnings: string[] }> }) => ({
        id: newId(),
        week: s.week,
        title: s.title,
        items: s.items.map((item) => ({
          id: newId(),
          title: item.title,
          type: item.type,
          fileName: item.fileName,
          documentId: item.documentId,
          warnings: item.warnings || [],
        })),
      }));
      setSections(mapped);
      setGlobalWarnings(preview.warnings || []);
      setSource('zip');
      setStep(2);
    } catch (e) {
      setParseErrors([getErrorMessage(e, 'Failed to process ZIP')]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  /* ── CSV source ── */
  const handleCSVFile = useCallback((file: File) => {
    setLoading(true);
    setParseErrors([]);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const result = parseCSVToPreview(text);
      setSections(result.sections);
      setParseErrors(result.errors);
      setGlobalWarnings([]);
      setSource('csv');
      setStep(2);
      setLoading(false);
    };
    reader.onerror = () => {
      setParseErrors(['Failed to read CSV file']);
      setLoading(false);
    };
    reader.readAsText(file);
  }, []);

  /* ── Folder source ── */
  const handleFolderFiles = useCallback(async (files: FileList) => {
    setLoading(true);
    setParseErrors([]);
    const fileArr = Array.from(files).filter((f) => {
      const name = f.name;
      if (name.startsWith('.') || name.startsWith('__MACOSX')) return false;
      const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      if (relPath.includes('__MACOSX') || relPath.includes('/.')) return false;
      return true;
    });

    if (fileArr.length === 0) {
      setParseErrors(['No valid files found in folder']);
      setLoading(false);
      return;
    }

    const sectionMap = new Map<string, PreviewSection>();
    const warnings: string[] = [];
    setFolderProgress({ done: 0, total: fileArr.length });

    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = relPath.split('/').filter(Boolean);
      // First part is the selected folder name — skip it
      const pathParts = parts.length > 1 ? parts.slice(1) : parts;
      const fileName = pathParts[pathParts.length - 1];

      if (!DOC_MIME_TYPES.has(file.type)) {
        warnings.push(`Skipped "${fileName}" (unsupported type: ${file.type || 'unknown'})`);
        setFolderProgress({ done: i + 1, total: fileArr.length });
        continue;
      }

      // Determine week/section from path
      let weekTitle: string;
      let sectionTitle: string;
      if (pathParts.length >= 3) {
        weekTitle = pathParts[0];
        sectionTitle = pathParts[1];
      } else if (pathParts.length === 2) {
        weekTitle = pathParts[0];
        sectionTitle = 'Imported';
      } else {
        weekTitle = 'Imported';
        sectionTitle = 'Imported';
      }

      // Upload file via documents service
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', stripExtension(fileName));
        formData.append('description', 'Imported from folder');
        formData.append('category', 'Course Materials');
        formData.append('courseIds', JSON.stringify([courseId]));

        const res = await fetch('/api/v1/documents', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('lms_token')}` },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          warnings.push(`Failed to upload "${fileName}": ${data.error?.message || 'error'}`);
          setFolderProgress({ done: i + 1, total: fileArr.length });
          continue;
        }

        const key = `${weekTitle}||${sectionTitle}`;
        if (!sectionMap.has(key)) {
          sectionMap.set(key, { id: newId(), week: weekTitle, title: sectionTitle, items: [] });
        }
        const information = data.data?.renderedHtml;
        sectionMap.get(key)!.items.push({
          id: newId(),
          title: stripExtension(fileName),
          type: mimeToItemType(file.type),
          fileName,
          documentId: data.data?.id,
          ...(information ? { information } : {}),
          warnings: [],
        });
      } catch (e) {
        warnings.push(`Failed to upload "${fileName}": ${getErrorMessage(e, 'error')}`);
      }
      setFolderProgress({ done: i + 1, total: fileArr.length });
    }

    setSections([...sectionMap.values()]);
    setGlobalWarnings(warnings);
    setSource('folder');
    setStep(2);
    setLoading(false);
    setFolderProgress(null);
  }, [courseId]);

  /* ── GitHub source ── */
  const handleGitHubFetch = useCallback(async () => {
    if (!githubUrl.trim()) {
      setGithubError('Repository URL is required');
      return;
    }

    setGithubLoading(true);
    setGithubError('');

    try {
      const token = localStorage.getItem('lms_token');
      const res = await fetch(`/api/v1/courses/${courseId}/import/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          repoUrl: githubUrl.trim(),
          subPath: githubSubPath.trim() || undefined,
          ref: githubRef.trim() || 'main',
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setGithubError(json.error?.message || 'Failed to fetch repository');
        return;
      }

      const preview = json.data.preview;
      const mapped: PreviewSection[] = preview.sections.map((s: { title: string; week: string; items: Array<{ title: string; type: string; fileName?: string; documentId?: string; information?: string; warnings?: string[] }> }) => ({
        id: newId(),
        week: s.week,
        title: s.title,
        items: s.items.map((item) => ({
          id: newId(),
          title: item.title,
          type: item.type,
          fileName: item.fileName,
          documentId: item.documentId,
          information: item.information,
          warnings: item.warnings || [],
        })),
      }));

      setSections(mapped);
      setGlobalWarnings(preview.warnings || []);
      setSource('github');
      setStep(2);
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setGithubLoading(false);
    }
  }, [courseId, githubUrl, githubSubPath, githubRef]);

  /* ── Preview editing ── */
  const updateItemField = useCallback((sectionId: string, itemId: string, field: keyof PreviewItem, value: string) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId
          ? { ...sec, items: sec.items.map((item) => item.id === itemId ? { ...item, [field]: value } : item) }
          : sec,
      ),
    );
  }, []);

  const removeItem = useCallback((sectionId: string, itemId: string) => {
    setSections((prev) =>
      prev
        .map((sec) =>
          sec.id === sectionId
            ? { ...sec, items: sec.items.filter((item) => item.id !== itemId) }
            : sec,
        )
        .filter((sec) => sec.items.length > 0),
    );
  }, []);

  const updateSectionField = useCallback((sectionId: string, field: 'title' | 'week', value: string) => {
    setSections((prev) =>
      prev.map((sec) => sec.id === sectionId ? { ...sec, [field]: value } : sec),
    );
  }, []);

  /* ── Commit ── */
  const handleCommit = useCallback(async () => {
    setCommitting(true);
    setCommitError('');
    try {
      // Group sections by week for the import endpoint
      // The import endpoint expects flat sections, so we convert
      const importSections = sections.map((sec) => ({
        title: sec.title,
        objective: '',
        outcome: '',
        items: sec.items.map((item) => ({
          type: item.type,
          title: item.title,
          ...(item.url ? { url: item.url } : {}),
          ...(item.documentId ? { documentId: item.documentId } : {}),
          ...(item.quizId ? { quizId: item.quizId } : {}),
          ...(item.description ? { description: item.description } : {}),
          ...(item.information ? { information: item.information } : {}),
          ...(item.fileName ? { fileName: item.fileName } : {}),
        })),
      }));

      const res = await fetch(`/api/v1/courses/${courseId}/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('lms_token')}`,
        },
        body: JSON.stringify({ mode: importMode, sections: importSections }),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = data.error?.details;
        if (details && Array.isArray(details)) {
          setCommitError(details.map((d: { section?: number; item?: number; message: string }) =>
            `Section ${(d.section ?? 0) + 1}${d.item !== undefined ? `, Item ${d.item + 1}` : ''}: ${d.message}`
          ).join('\n'));
        } else {
          setCommitError(data.error?.message || 'Import failed');
        }
        return;
      }
      toastSuccess(`Imported ${data.data?.sectionsImported ?? 0} section(s), ${data.data?.itemsImported ?? 0} item(s)`);
      reset();
      onClose();
      onImportComplete();
    } catch (e) {
      setCommitError(getErrorMessage(e, 'Import request failed'));
    } finally {
      setCommitting(false);
    }
  }, [sections, courseId, importMode, reset, onClose, onImportComplete]);

  if (!open) return null;

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const totalWarnings = sections.reduce((sum, s) => sum + s.items.reduce((ws, item) => ws + item.warnings.length, 0), 0) + globalWarnings.length;
  const weeks = [...new Set(sections.map((s) => s.week))];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-wizard-title"
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
      tabIndex={-1}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col" data-testid="import-wizard">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b">
          <div>
            <h2 id="import-wizard-title" className="text-lg font-semibold text-neutral-800">
              Import Wizard {courseTitle ? `— ${courseTitle}` : ''}
            </h2>
            <div className="flex gap-2 mt-1">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`h-1.5 w-16 rounded-full ${s <= step ? 'bg-blue-500' : 'bg-neutral-200'}`} />
              ))}
            </div>
          </div>
          <button onClick={handleClose} disabled={committing || loading} className="text-neutral-400 hover:text-neutral-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {/* Step 1: Source Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">Choose an import source for your course content.</p>

              {parseErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  {parseErrors.map((e, i) => <p key={i} className="text-sm text-red-700">{e}</p>)}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4" data-testid="source-options">
                {/* ZIP */}
                <button
                  className="border rounded-xl p-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  onClick={() => zipInputRef.current?.click()}
                  disabled={loading}
                  data-testid="source-zip"
                >
                  <Upload className="h-8 w-8 text-blue-500 mb-2" />
                  <div className="font-medium text-neutral-800">Upload ZIP</div>
                  <p className="text-xs text-neutral-500 mt-1">Folders map to weeks &amp; sections</p>
                </button>
                <input ref={zipInputRef} type="file" accept=".zip,application/zip" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleZipFile(f); e.target.value = ''; }}
                />

                {/* CSV */}
                <button
                  className="border rounded-xl p-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  onClick={() => csvInputRef.current?.click()}
                  disabled={loading}
                  data-testid="source-csv"
                >
                  <FileSpreadsheet className="h-8 w-8 text-green-500 mb-2" />
                  <div className="font-medium text-neutral-800">Upload CSV</div>
                  <p className="text-xs text-neutral-500 mt-1">12-column manifest format</p>
                </button>
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCSVFile(f); e.target.value = ''; }}
                />

                {/* Folder */}
                <button
                  className="border rounded-xl p-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={loading}
                  data-testid="source-folder"
                >
                  <FolderOpen className="h-8 w-8 text-amber-500 mb-2" />
                  <div className="font-medium text-neutral-800">Select Folder</div>
                  <p className="text-xs text-neutral-500 mt-1">Drag or browse a local folder</p>
                </button>
                <input ref={folderInputRef} type="file" className="hidden"
                  {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                  onChange={(e) => { const f = e.target.files; if (f && f.length > 0) void handleFolderFiles(f); e.target.value = ''; }}
                />

                {/* GitHub */}
                <button
                  type="button"
                  onClick={() => { setSource('github'); setGithubError(''); }}
                  disabled={loading}
                  data-testid="source-github"
                  className={`border rounded-xl p-4 text-left transition-colors ${
                    source === 'github' ? 'border-blue-500 bg-blue-50' : 'hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  <Code className="h-8 w-8 text-neutral-600 mb-2" />
                  <div className="font-medium text-neutral-800">GitHub Repository</div>
                  <p className="text-xs text-neutral-500 mt-1">Import from a public repo</p>
                </button>
              </div>

              {/* GitHub form */}
              {source === 'github' && (
                <div className="space-y-3 mt-4 border rounded-lg p-4 bg-neutral-50">
                  <div>
                    <label htmlFor="github-url" className="block text-sm font-medium text-neutral-700 mb-1">
                      Repository URL <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="github-url"
                      type="url"
                      value={githubUrl}
                      onChange={(e) => { setGithubUrl(e.target.value); setGithubError(''); }}
                      placeholder="https://github.com/SM-Web-Systems/repo-name"
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="github-subpath" className="block text-sm font-medium text-neutral-700 mb-1">
                      Subdirectory <span className="text-neutral-400">(optional)</span>
                    </label>
                    <input
                      id="github-subpath"
                      type="text"
                      value={githubSubPath}
                      onChange={(e) => setGithubSubPath(e.target.value)}
                      placeholder="/courseware"
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="github-ref" className="block text-sm font-medium text-neutral-700 mb-1">
                      Branch / Tag
                    </label>
                    <input
                      id="github-ref"
                      type="text"
                      value={githubRef}
                      onChange={(e) => setGithubRef(e.target.value)}
                      placeholder="main"
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  {githubError && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {githubError}
                    </p>
                  )}
                  <Button
                    onClick={() => void handleGitHubFetch()}
                    disabled={githubLoading}
                    className="w-full"
                  >
                    {githubLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Fetching...</>
                    ) : (
                      <><Code className="h-4 w-4 mr-1" /> Fetch</>
                    )}
                  </Button>
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {folderProgress
                    ? `Uploading files: ${folderProgress.done}/${folderProgress.total}`
                    : 'Processing...'}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Editable Preview */}
          {step === 2 && (
            <div className="space-y-4" data-testid="preview-step">
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-600">
                  {totalItems} item{totalItems !== 1 ? 's' : ''} in {sections.length} section{sections.length !== 1 ? 's' : ''} across {weeks.length} week{weeks.length !== 1 ? 's' : ''}
                  {totalWarnings > 0 && <span className="text-amber-600 ml-2">— {totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}</span>}
                </p>
              </div>

              {globalWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
                  {globalWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" /> {w}
                    </p>
                  ))}
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  {parseErrors.map((e, i) => <p key={i} className="text-sm text-red-700">{e}</p>)}
                </div>
              )}

              {sections.length === 0 ? (
                <p className="text-sm text-neutral-500 py-8 text-center">No items to preview.</p>
              ) : (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                  {sections.map((sec) => (
                    <div key={sec.id} className="border rounded-lg">
                      <div className="bg-neutral-50 px-4 py-2 flex items-center gap-2 text-sm border-b">
                        <input
                          className="border rounded px-2 py-0.5 w-28 text-sm"
                          value={sec.week}
                          onChange={(e) => updateSectionField(sec.id, 'week', e.target.value)}
                          aria-label="Week"
                          data-testid={`section-week-${sec.id}`}
                        />
                        <span className="text-neutral-400">/</span>
                        <input
                          className="border rounded px-2 py-0.5 flex-1 text-sm"
                          value={sec.title}
                          onChange={(e) => updateSectionField(sec.id, 'title', e.target.value)}
                          aria-label="Section"
                          data-testid={`section-title-${sec.id}`}
                        />
                        <span className="text-xs text-neutral-400">{sec.items.length} item{sec.items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="divide-y">
                        {sec.items.map((item) => (
                          <div key={item.id} className="px-4 py-2 flex items-center gap-2 text-sm">
                            <input
                              className="border rounded px-2 py-0.5 flex-1 text-sm"
                              value={item.title}
                              onChange={(e) => updateItemField(sec.id, item.id, 'title', e.target.value)}
                              aria-label="Item title"
                              data-testid={`item-title-${item.id}`}
                            />
                            <select
                              className="border rounded px-1 py-0.5 text-xs"
                              value={item.type}
                              onChange={(e) => updateItemField(sec.id, item.id, 'type', e.target.value)}
                              aria-label="Item type"
                              data-testid={`item-type-${item.id}`}
                            >
                              {VALID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                            {item.fileName && (
                              <span className="text-xs text-neutral-400 truncate max-w-[120px]" title={item.fileName}>{item.fileName}</span>
                            )}
                            {item.warnings.length > 0 && (
                              <span title={item.warnings.join(', ')} className="text-amber-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <button onClick={() => removeItem(sec.id, item.id)} className="text-red-400 hover:text-red-600" aria-label="Remove item">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="space-y-4" data-testid="confirm-step">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <h3 className="font-medium text-blue-800">Import Summary</h3>
                <p className="text-sm text-blue-700">
                  <strong>{sections.length}</strong> section{sections.length !== 1 ? 's' : ''} with <strong>{totalItems}</strong> item{totalItems !== 1 ? 's' : ''} across <strong>{weeks.length}</strong> week{weeks.length !== 1 ? 's' : ''}
                </p>
                {totalWarnings > 0 && (
                  <p className="text-sm text-amber-600">{totalWarnings} warning{totalWarnings !== 1 ? 's' : ''} (items will still be imported)</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Import Mode</label>
                <select
                  className="border rounded px-3 py-1.5 text-sm w-full"
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}
                  data-testid="import-mode"
                >
                  <option value="append">Append — add after existing sections</option>
                  <option value="replace">Replace — remove existing sections</option>
                </select>
              </div>

              {commitError && (
                <pre className="text-sm text-red-600 bg-red-50 rounded p-2 whitespace-pre-wrap">{commitError}</pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t">
          <div>
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)} disabled={committing}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={committing || loading}>Cancel</Button>
            {step === 2 && sections.length > 0 && (
              <Button size="sm" onClick={() => setStep(3)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 3 && (
              <Button size="sm" onClick={() => void handleCommit()} disabled={committing || sections.length === 0}>
                {committing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                Import
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
