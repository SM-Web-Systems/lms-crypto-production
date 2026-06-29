import React, { useState, useEffect } from 'react';
import { getAuthToken } from '../services/api';
import { documentsService } from '../services/documentsService';
import { Loader2 } from 'lucide-react';

interface PdfViewerProps {
  title: string;
  src: string;
  className?: string;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ title, src, className = '' }) => {
  return (
    <div
      className={`rounded-xl border border-neutral-200/90 bg-white shadow-card ring-1 ring-neutral-900/5 overflow-hidden ${className}`}
    >
      <div className="lms-embed-chrome-header">
        <h4 className="text-sm font-semibold text-neutral-800 tracking-tight">{title}</h4>
      </div>
      <div className="lms-embed-viewport--pdf h-[min(70vh,600px)] w-full overflow-auto">
        {/* object + iframe: better PDF inline behavior across browsers (Academy-style embedded doc). */}
        <object
          data={src}
          type="application/pdf"
          className="w-full h-full min-h-[600px] border-0 block bg-white"
          aria-label={title}
        >
          <iframe title={title} src={src} className="lms-embed-iframe--pdf" />
        </object>
      </div>
    </div>
  );
};

interface PdfViewerWithAuthProps {
  documentId: string;
  title: string;
  className?: string;
}

export const PdfViewerWithAuth: React.FC<PdfViewerWithAuthProps> = ({ documentId, title, className = '' }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const token = await getAuthToken();
        const url = documentsService.getDownloadUrl(documentId);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed to load PDF');
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setError('Could not load document');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  if (error) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!src) {
    return (
      <div className={`flex items-center justify-center h-48 bg-neutral-50 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }
  return <PdfViewer title={title} src={src} className={className} />;
};
