import React, { useState, useRef, useCallback } from 'react';
import { Button } from './Button';
import { X, Upload, AlertCircle, CheckCircle, Loader2, RotateCcw } from 'lucide-react';
import { documentsService } from '../services/documentsService';
import { getErrorMessage } from '../utils/apiError';

/** MIME types the server accepts (matches DOCUMENT_MIME_TYPES in fileUpload.ts). */
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
];

const ACCEPT_STRING = ACCEPTED_MIME_TYPES.join(',');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 20;

type ItemType = 'pdf' | 'download';

function mimeToItemType(mime: string): ItemType {
  if (mime === 'application/pdf') return 'pdf';
  return 'download';
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'failed';

interface QueuedFile {
  id: string;
  file: File;
  itemType: ItemType;
  status: FileStatus;
  error?: string;
  documentId?: string;
}

function pickCategory(categories: string[]): string {
  const preferred = ['Reference Materials', 'Lecture Notes', 'Course Materials', 'Tutorials', 'Study Guides', 'Other'];
  for (const p of preferred) {
    if (categories.includes(p)) return p;
  }
  return categories[0] ?? 'Other';
}

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  weeks: Array<{ tempId: string; title: string; sections: Array<{ tempId: string; title: string }> }>;
  courseTitle: string;
  courseId: string | null;
  docCategories: string[];
  onFilesUploaded: (
    items: Array<{ documentId: string; title: string; type: ItemType; fileName: string }>,
    weekTempId: string,
    sectionTempId: string,
  ) => void;
}

export default function BulkUploadModal({
  open,
  onClose,
  weeks,
  courseTitle,
  courseId,
  docCategories,
  onFilesUploaded,
}: BulkUploadModalProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [weekTempId, setWeekTempId] = useState('');
  const [sectionTempId, setSectionTempId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when opened
  const resetState = useCallback(() => {
    setQueue([]);
    setWeekTempId(weeks[0]?.tempId ?? '');
    setSectionTempId(weeks[0]?.sections[0]?.tempId ?? '');
    setUploading(false);
    setDragOver(false);
  }, [weeks]);

  // Sync default week/section when weeks change or modal opens
  React.useEffect(() => {
    if (open) resetState();
  }, [open, resetState]);

  // Update section when week changes
  const handleWeekChange = (wId: string) => {
    setWeekTempId(wId);
    const w = weeks.find((w) => w.tempId === wId);
    setSectionTempId(w?.sections[0]?.tempId ?? '');
  };

  const selectedWeek = weeks.find((w) => w.tempId === weekTempId);
  const sections = selectedWeek?.sections ?? [];

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const errors: string[] = [];
    const valid: QueuedFile[] = [];

    for (const f of arr) {
      if (queue.length + valid.length >= MAX_FILES) {
        errors.push(`Maximum ${MAX_FILES} files per batch. "${f.name}" skipped.`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        errors.push(`"${f.name}" exceeds 10 MB limit.`);
        continue;
      }
      if (!ACCEPTED_MIME_TYPES.includes(f.type)) {
        errors.push(`"${f.name}" has unsupported type (${f.type || 'unknown'}).`);
        continue;
      }
      valid.push({
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        itemType: mimeToItemType(f.type),
        status: 'pending',
      });
    }

    if (errors.length > 0) {
      alert(errors.join('\n'));
    }
    if (valid.length > 0) {
      setQueue((prev) => [...prev, ...valid]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((f) => f.id !== id));
  };

  const startUpload = async () => {
    if (!weekTempId || !sectionTempId) {
      alert('Please select a week and section first.');
      return;
    }
    const pending = queue.filter((f) => f.status === 'pending' || f.status === 'failed');
    if (pending.length === 0) return;

    setUploading(true);
    const category = pickCategory(docCategories);
    const uploaded: Array<{ documentId: string; title: string; type: ItemType; fileName: string }> = [];

    for (const qf of pending) {
      // Mark uploading
      setQueue((prev) => prev.map((f) => (f.id === qf.id ? { ...f, status: 'uploading' as FileStatus, error: undefined } : f)));

      try {
        const title = qf.file.name.replace(/\.[^.]+$/, '');
        const created = await documentsService.create({
          title,
          description: `Bulk upload for "${courseTitle.trim() || 'course'}".`,
          category,
          file: qf.file,
          courseIds: courseId ? [courseId] : undefined,
        });
        setQueue((prev) =>
          prev.map((f) => (f.id === qf.id ? { ...f, status: 'done' as FileStatus, documentId: created.id } : f)),
        );
        uploaded.push({ documentId: created.id, title, type: qf.itemType, fileName: qf.file.name });
      } catch (err) {
        setQueue((prev) =>
          prev.map((f) =>
            f.id === qf.id ? { ...f, status: 'failed' as FileStatus, error: getErrorMessage(err, 'Upload failed') } : f,
          ),
        );
      }
    }

    setUploading(false);

    if (uploaded.length > 0) {
      onFilesUploaded(uploaded, weekTempId, sectionTempId);
    }
  };

  const retryFile = async (fileId: string) => {
    const qf = queue.find((f) => f.id === fileId);
    if (!qf || qf.status !== 'failed') return;

    setQueue((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: 'uploading' as FileStatus, error: undefined } : f)));
    const category = pickCategory(docCategories);

    try {
      const title = qf.file.name.replace(/\.[^.]+$/, '');
      const created = await documentsService.create({
        title,
        description: `Bulk upload for "${courseTitle.trim() || 'course'}".`,
        category,
        file: qf.file,
        courseIds: courseId ? [courseId] : undefined,
      });
      setQueue((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, status: 'done' as FileStatus, documentId: created.id } : f)),
      );
      onFilesUploaded([{ documentId: created.id, title, type: qf.itemType, fileName: qf.file.name }], weekTempId, sectionTempId);
    } catch (err) {
      setQueue((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: 'failed' as FileStatus, error: getErrorMessage(err, 'Upload failed') } : f,
        ),
      );
    }
  };

  if (!open) return null;

  const doneCount = queue.filter((f) => f.status === 'done').length;
  const failedCount = queue.filter((f) => f.status === 'failed').length;
  const totalCount = queue.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Bulk upload files"
      data-testid="bulk-upload-modal"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b">
          <h2 className="text-lg font-semibold text-neutral-800">Bulk Upload Files</h2>
          <button onClick={onClose} disabled={uploading} className="text-neutral-400 hover:text-neutral-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Week & Section selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Week</label>
              <select
                value={weekTempId}
                onChange={(e) => handleWeekChange(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                data-testid="bulk-upload-week-select"
              >
                {weeks.map((w) => (
                  <option key={w.tempId} value={w.tempId}>{w.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Section</label>
              <select
                value={sectionTempId}
                onChange={(e) => setSectionTempId(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                data-testid="bulk-upload-section-select"
              >
                {sections.map((s) => (
                  <option key={s.tempId} value={s.tempId}>{s.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-accent-teal bg-accent-teal/5' : 'border-neutral-300 hover:border-neutral-400'
            }`}
            data-testid="bulk-upload-dropzone"
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-neutral-400" />
            <p className="text-sm text-neutral-600">Drag files here or click to browse</p>
            <p className="text-xs text-neutral-400 mt-1">PDF, images, Office docs, ZIP — max 10 MB each, up to 20 files</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_STRING}
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
              data-testid="bulk-upload-file-input"
            />
          </div>

          {/* Note about video/audio */}
          <p className="text-xs text-neutral-500">
            Video and audio items cannot be bulk-uploaded (they require URLs). Use "Add Item" in the editor for those.
          </p>

          {/* File list */}
          {queue.length > 0 && (
            <div className="space-y-2" data-testid="bulk-upload-file-list">
              {queue.map((qf) => (
                <div key={qf.id} className="flex items-center gap-2 p-2 rounded-lg bg-neutral-50 text-sm">
                  {qf.status === 'pending' && <div className="h-4 w-4 rounded-full bg-neutral-300" />}
                  {qf.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-accent-teal" />}
                  {qf.status === 'done' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {qf.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-500" />}
                  <span className="flex-1 truncate">{qf.file.name}</span>
                  <span className="text-xs text-neutral-400">{qf.itemType}</span>
                  {qf.status === 'failed' && (
                    <button
                      onClick={() => void retryFile(qf.id)}
                      className="text-accent-teal hover:text-accent-teal/80"
                      title="Retry"
                      data-testid={`bulk-upload-retry-${qf.id}`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                  {(qf.status === 'pending' || qf.status === 'failed') && !uploading && (
                    <button onClick={() => removeFile(qf.id)} className="text-neutral-400 hover:text-red-500" title="Remove">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {/* Progress summary */}
              {totalCount > 0 && (
                <div className="text-xs text-neutral-500 text-right" data-testid="bulk-upload-progress">
                  {doneCount}/{totalCount} uploaded{failedCount > 0 ? ` · ${failedCount} failed` : ''}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            {doneCount > 0 && failedCount === 0 ? 'Done' : 'Cancel'}
          </Button>
          {queue.some((f) => f.status === 'pending' || f.status === 'failed') && (
            <Button onClick={() => void startUpload()} disabled={uploading || !weekTempId || !sectionTempId}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Upload {queue.filter((f) => f.status === 'pending' || f.status === 'failed').length} files
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
