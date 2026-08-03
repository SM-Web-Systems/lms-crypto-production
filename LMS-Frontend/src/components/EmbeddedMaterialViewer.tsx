import React, { useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Info, Music, ClipboardCheck, Upload, Download as DownloadIcon } from 'lucide-react';
import type { CourseItem, CourseSection } from '../types/course';
import { PdfViewer, PdfViewerWithAuth } from './PdfViewer';
import {
  getIframeVideoEmbedSrc,
  isDirectVideoFileUrl,
  shouldOpenVideoInModal,
  isDirectAudioFileUrl,
  isOfficePresentationUrl,
  getOfficeOnlineEmbedUrl,
  isGoogleDriveUrl,
} from '../utils/mediaUrl';

function externalUrlForItem(item: CourseItem): string | null {
  if (item.type === 'video') return item.url.trim();
  if (item.type === 'link') return item.url.trim();
  if (item.type === 'text') return item.url.trim();
  if (item.type === 'pdf') return item.fileUrl?.trim() || null;
  if (item.type === 'audio') return item.url.trim();
  if (item.type === 'download') {
    const dl = item as { fileUrl?: string };
    return dl.fileUrl?.trim() || null;
  }
  return null;
}

function linkHostname(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function ExternalResourceCard({
  title,
  description,
  url,
}: {
  title: string;
  description?: string | null;
  url: string;
}) {
  const host = linkHostname(url);
  return (
    <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card ring-1 ring-neutral-900/5 overflow-hidden max-w-lg mx-auto">
      <div className="px-5 py-6 sm:px-8 sm:py-8 text-center">
        <h3 className="text-lg sm:text-xl font-bold text-primary-dark tracking-tight leading-snug">{title}</h3>
        {description?.trim() ? (
          <p className="text-sm text-neutral-600 mt-3 leading-relaxed max-w-prose mx-auto">{description}</p>
        ) : null}
        {host ? (
          <p className="text-xs text-neutral-500 mt-3 font-medium tabular-nums">{host}</p>
        ) : null}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-accent-teal px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-teal/90 transition-colors w-full sm:w-auto min-w-[200px]"
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          Open resource
        </a>
        <p className="text-xs text-neutral-500 mt-4 leading-relaxed">
          This resource opens in a new tab so you can use the full site without embedding limits.
        </p>
      </div>
    </div>
  );
}

interface EmbeddedMaterialViewerProps {
  section: CourseSection;
  item: CourseItem;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}

/**
 * In-page material view: optional instructor "information" above an embedded resource
 * (video / PDF). Generic web links use a link card instead of an iframe (many sites block embeds).
 */
export const EmbeddedMaterialViewer: React.FC<EmbeddedMaterialViewerProps> = ({
  section,
  item,
  onClose,
  onPrev,
  onNext,
  prevDisabled = true,
  nextDisabled = true,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ext = externalUrlForItem(item);

  const openInNewTab = () => {
    if (ext) window.open(ext, '_blank', 'noopener,noreferrer');
  };

  const isGenericWebLink =
    item.type === 'link' &&
    ext &&
    !shouldOpenVideoInModal(ext) &&
    !isDirectAudioFileUrl(ext) &&
    !isOfficePresentationUrl(ext);
  const showToolbarOpenTab = ext && !isGenericWebLink;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200/90 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to materials
        </button>
        {showToolbarOpenTab ? (
          <button
            type="button"
            onClick={openInNewTab}
            className="inline-flex items-center gap-2 rounded-lg border border-accent-teal/35 bg-accent-teal/10 px-3 py-2 text-sm font-semibold text-primary-dark hover:bg-accent-teal/15 transition-colors"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            Open in new tab
          </button>
        ) : null}
        {(onPrev || onNext) ? (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={prevDisabled}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200/90 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Previous
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="inline-flex items-center gap-1 rounded-lg border border-accent-teal/40 bg-accent-teal/10 px-3 py-2 text-sm font-semibold text-primary-dark shadow-sm hover:bg-accent-teal/15 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card ring-1 ring-neutral-900/5 overflow-hidden">
        <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">{section.title}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-primary-dark tracking-tight leading-snug">{item.title}</h1>
          {item.description?.trim() ? (
            <p className="text-sm text-neutral-600 mt-2 max-w-prose leading-relaxed">{item.description}</p>
          ) : null}
        </div>

        {item.information?.trim() ? (
          <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-neutral-200/80 bg-sky-50/50">
            <div className="flex gap-3 items-start max-w-prose">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
                <Info className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Information</p>
                <div className="text-sm text-neutral-800 mt-1.5 leading-relaxed whitespace-pre-wrap">{item.information}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-neutral-200/90 bg-neutral-100/50 p-2 sm:p-3 ring-1 ring-neutral-900/5">
        {item.type === 'pdf' ? (
          item.documentId ? (
            <PdfViewerWithAuth
              documentId={item.documentId}
              title={item.title}
              className="!shadow-md !ring-1 !ring-neutral-900/5"
            />
          ) : item.fileUrl?.trim() ? (
            <PdfViewer title={item.title} src={item.fileUrl.trim()} className="!shadow-md !ring-1 !ring-neutral-900/5" />
          ) : (
            <p className="text-sm text-neutral-600 px-4 py-8 text-center">No PDF file is attached to this item.</p>
          )
        ) : item.type === 'video' || (item.type === 'link' && ext && shouldOpenVideoInModal(ext)) ? (
          (() => {
            const url = item.type === 'video' ? item.url.trim() : ext!;
            const direct = isDirectVideoFileUrl(url);
            const iframeSrc = direct ? '' : getIframeVideoEmbedSrc(url);
            return direct ? (
              <div className="lms-video-stage w-full flex flex-col items-stretch rounded-lg overflow-hidden bg-black ring-1 ring-neutral-900/20">
                <video
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full max-h-[min(72vh,85dvh)] object-contain bg-black"
                  src={url}
                >
                  Your browser does not support embedded video.
                </video>
              </div>
            ) : (
              <div
                className="lms-video-stage w-full rounded-lg overflow-hidden ring-1 ring-neutral-900/20"
                style={{ paddingBottom: '56.25%' }}
              >
                <iframe
                  title={item.title}
                  src={iframeSrc}
                  className="lms-embed-iframe--video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            );
          })()
        ) : item.type === 'link' && ext && isDirectAudioFileUrl(ext) ? (
          <div className="flex flex-col items-center gap-5 py-8 px-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-teal/10 text-accent-teal">
              <Music className="h-8 w-8" aria-hidden />
            </span>
            <p className="text-base font-semibold text-neutral-800">{item.title}</p>
            <audio
              controls
              preload="metadata"
              className="w-full max-w-lg"
              src={ext}
            >
              Your browser does not support the audio element.
            </audio>
            <a
              href={ext}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent-teal font-medium hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Download audio file
            </a>
          </div>
        ) : item.type === 'link' && ext && isOfficePresentationUrl(ext) && !isGoogleDriveUrl(ext) ? (
          <div className="w-full rounded-lg overflow-hidden ring-1 ring-neutral-900/20">
            <div className="bg-neutral-800 px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-300">{item.title}</span>
              <a
                href={ext}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent-teal hover:text-accent-teal/80 font-medium"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                Download
              </a>
            </div>
            <iframe
              title={item.title}
              src={getOfficeOnlineEmbedUrl(ext)}
              className="w-full border-0"
              style={{ height: 'min(70vh, 640px)' }}
              allow="fullscreen"
            />
            <p className="text-xs text-neutral-500 text-center py-2">
              Powered by Microsoft Office Online · File must be publicly accessible
            </p>
          </div>
        ) : (item.type === 'link' || item.type === 'text') && ext ? (
          <ExternalResourceCard title={item.title} description={item.description} url={ext} />
        ) : item.type === 'audio' ? (
          <div className="flex flex-col items-center gap-5 py-8 px-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
              <Music className="h-8 w-8" aria-hidden />
            </span>
            <p className="text-base font-semibold text-neutral-800">{item.title}</p>
            {item.url?.trim() ? (
              <>
                <audio controls preload="metadata" className="w-full max-w-lg" src={item.url}>
                  Your browser does not support the audio element.
                </audio>
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-accent-teal font-medium hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" aria-hidden />
                  Download audio file
                </a>
              </>
            ) : (
              <p className="text-sm text-neutral-500">No audio file is attached to this item.</p>
            )}
          </div>
        ) : item.type === 'quiz' ? (
          (() => {
            const quizId = (item as { quizId?: string }).quizId?.trim();
            return quizId ? (
              <div className="flex flex-col items-center gap-5 py-8 px-4">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <ClipboardCheck className="h-8 w-8" aria-hidden />
                </span>
                <p className="text-base font-semibold text-neutral-800">{item.title}</p>
                {item.description?.trim() && (
                  <p className="text-sm text-neutral-600 max-w-prose text-center leading-relaxed">{item.description}</p>
                )}
                <a
                  href={`/student/quizzes?quiz=${quizId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 transition-colors min-w-[200px]"
                >
                  <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden />
                  Start quiz
                </a>
                <p className="text-xs text-neutral-500">
                  The quiz opens on the Quizzes page. Your progress is tracked there.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 py-8 px-4">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <ClipboardCheck className="h-8 w-8" aria-hidden />
                </span>
                <p className="text-base font-semibold text-neutral-800">{item.title}</p>
                <p className="text-sm text-neutral-500">This quiz has not been configured yet.</p>
              </div>
            );
          })()
        ) : item.type === 'assignment' ? (
          <div className="flex flex-col items-center gap-5 py-8 px-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Upload className="h-8 w-8" aria-hidden />
            </span>
            <p className="text-base font-semibold text-neutral-800">{item.title}</p>
            {item.description?.trim() && (
              <div className="text-sm text-neutral-700 max-w-prose text-center leading-relaxed whitespace-pre-wrap">
                {item.description}
              </div>
            )}
            {(item as { maxFileSize?: number }).maxFileSize ? (
              <p className="text-xs text-neutral-500">
                Max file size: {Math.round(((item as { maxFileSize: number }).maxFileSize) / 1048576)} MB
              </p>
            ) : null}
            <a
              href="/student/submissions"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors min-w-[200px]"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden />
              Go to submissions
            </a>
            <p className="text-xs text-neutral-500">
              Submit your work on the Submissions page.
            </p>
          </div>
        ) : item.type === 'download' ? (
          (() => {
            const dlItem = item as { documentId?: string; fileUrl?: string; fileName?: string };
            const downloadUrl = dlItem.documentId
              ? `/api/v1/documents/${dlItem.documentId}/download`
              : dlItem.fileUrl?.trim() || null;
            const displayName = dlItem.fileName || item.title;
            return (
              <div className="flex flex-col items-center gap-5 py-8 px-4">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-green-600">
                  <DownloadIcon className="h-8 w-8" aria-hidden />
                </span>
                <p className="text-base font-semibold text-neutral-800">{item.title}</p>
                {item.description?.trim() && (
                  <p className="text-sm text-neutral-600 max-w-prose text-center leading-relaxed">{item.description}</p>
                )}
                <p className="text-sm text-neutral-500 font-mono">{displayName}</p>
                {downloadUrl ? (
                  <a href={downloadUrl} download={displayName}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition-colors min-w-[200px]">
                    <DownloadIcon className="h-4 w-4 shrink-0" aria-hidden />
                    Download file
                  </a>
                ) : (
                  <p className="text-sm text-neutral-500">No file is attached to this download item.</p>
                )}
              </div>
            );
          })()
        ) : (
          <p className="text-sm text-neutral-600 px-4 py-8 text-center">This material has nothing to display.</p>
        )}
      </div>
    </div>
  );
};
