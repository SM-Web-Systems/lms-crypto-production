import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { getIframeVideoEmbedSrc, isDirectVideoFileUrl } from '../utils/mediaUrl';

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** YouTube / embed URL, or a direct .mp4 / .webm / … file URL (native video element). */
  url: string;
}

/** Modal: native HTML5 video for direct files; iframe embed for YouTube and other hosts. */
export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  isOpen,
  onClose,
  title,
  url,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const direct = isDirectVideoFileUrl(url);
  const iframeSrc = direct ? '' : getIframeVideoEmbedSrc(url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-neutral-200/90 max-h-[90vh] w-full max-w-4xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90 shrink-0">
          <h3 className="text-lg font-semibold text-neutral-800 truncate pr-10">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {direct ? (
          <div className="lms-video-stage w-full flex flex-col items-stretch bg-black">
            <video
              controls
              preload="metadata"
              playsInline
              className="w-full max-h-[min(72vh,85dvh)] object-contain bg-black"
              src={url}
            >
              Your browser does not support embedded video.
            </video>
            <div className="px-4 py-3 bg-neutral-900/90 border-t border-white/10 text-left">
              <p className="text-sm text-white/90 font-medium">{title}</p>
              <p className="text-xs text-white/55 mt-0.5">Direct video file — use fullscreen for the best view.</p>
            </div>
          </div>
        ) : (
          <div
            className="lms-video-stage w-full rounded-b-xl overflow-hidden"
            style={{ paddingBottom: '56.25%' }}
          >
            <iframe
              title={title}
              src={iframeSrc}
              className="lms-embed-iframe--video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </div>
    </div>
  );
};
