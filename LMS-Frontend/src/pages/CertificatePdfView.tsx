import React, { useCallback, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { certificatePdfApiUrl } from '../lib/certificatePdf';

/**
 * In-app certificate PDF viewer.
 *
 * Why this page exists: when the LMS is installed to the iPhone home screen it runs
 * without any browser controls. Opening the certificate PDF in a new tab
 * (target="_blank") on the same site kept it inside that chrome-less window, so the
 * learner saw the PDF full screen with no way back. This page keeps the LMS
 * header and a Back button on screen and shows the PDF inside it.
 */

/** Browsers that cannot show a PDF inline (for example Chrome on Android) report false here. */
function canShowPdfInline(): boolean {
  if (typeof navigator === 'undefined') return true;
  const flag = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
  return flag !== false;
}

const CertificatePdfView: React.FC = () => {
  const { credentialId = '' } = useParams<{ credentialId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pdfUrl = certificatePdfApiUrl(credentialId);
  const fileName = `certificate-${credentialId}.pdf`;
  const inline = canShowPdfInline();

  const goBack = useCallback(() => {
    // location.key is 'default' when this page was the first one loaded (no in-app history).
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(`/verify/${encodeURIComponent(credentialId)}`, { replace: true });
    }
  }, [credentialId, location.key, navigate]);

  // Save without leaving the app: on iPhone this opens the share sheet (Save to Files, Mail, ...).
  const savePdf = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'application/pdf' }) : null;
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (file && nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: 'Certificate' });
        } catch {
          /* user closed the share sheet */
        }
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch {
      // Never navigate the whole app to the raw PDF: on the iPhone home-screen app that page has no Back button.
      setSaveError('The certificate could not be saved. Check your connection and try Save again.');
    } finally {
      setSaving(false);
    }
  }, [fileName, pdfUrl]);

  return (
    <div className="min-h-screen flex flex-col bg-neutral-100" data-testid="certificate-pdf-view">
      <header
        className="sticky top-0 z-10 flex items-center gap-2 bg-white border-b border-neutral-200 px-3 py-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <h1 className="flex-1 min-w-0 truncate text-sm font-semibold text-neutral-800 text-center">Certificate</h1>
        <button
          type="button"
          onClick={() => void savePdf()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      {saveError && (
        <p role="alert" className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{saveError}</p>
      )}
      <main className="flex-1 flex flex-col">
        {inline ? (
          <iframe title="Certificate PDF" src={pdfUrl} className="flex-1 w-full min-h-[80vh] border-0 bg-white" />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm text-neutral-600">This browser cannot show the PDF inside the page.</p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open PDF
            </a>
          </div>
        )}
      </main>
    </div>
  );
};

export default CertificatePdfView;
