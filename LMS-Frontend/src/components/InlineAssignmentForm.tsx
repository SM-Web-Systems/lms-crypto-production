import { useState } from 'react';
import { submissionsService } from '../services/submissionsService';
import { Upload } from 'lucide-react';

interface InlineAssignmentFormProps {
  courseId: string;
  weekId?: string;
  itemId: string;
  allowedMimeTypes?: string[];
  maxFileSize?: number;
  onSubmitted?: () => void;
}

type Step = 'idle' | 'uploading' | 'success' | 'error';

export default function InlineAssignmentForm({
  courseId,
  weekId,
  itemId,
  allowedMimeTypes,
  maxFileSize,
  onSubmitted,
}: InlineAssignmentFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFile(null); return; }

    if (maxFileSize && f.size > maxFileSize) {
      setErrorMsg(`File exceeds maximum size of ${Math.round(maxFileSize / 1048576)} MB.`);
      setStep('error');
      e.target.value = '';
      return;
    }

    if (allowedMimeTypes?.length && !allowedMimeTypes.includes(f.type)) {
      setErrorMsg('File type not accepted. Please choose a different format.');
      setStep('error');
      e.target.value = '';
      return;
    }

    setFile(f);
    if (step === 'error') { setStep('idle'); setErrorMsg(''); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setStep('uploading');
    try {
      await submissionsService.create({
        title: title.trim(),
        description: '',
        file,
        courseId,
        weekId,
        itemId,
      });
      setStep('success');
      onSubmitted?.();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Failed to submit. Please try again.');
      setStep('error');
    }
  };

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 px-4">
        <span className="inline-block rounded-full bg-green-100 px-4 py-1 text-sm font-semibold text-green-700">
          Submitted successfully
        </span>
        <a href="/student/submissions" className="text-xs text-accent-teal hover:underline">
          View all submissions
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 py-4 px-4 max-w-md mx-auto">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Submission title"
        required
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      <input
        type="file"
        onChange={handleFileChange}
        accept={allowedMimeTypes?.join(',')}
        className="w-full text-sm text-neutral-600 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
      />

      {step === 'error' && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={!file || !title.trim() || step === 'uploading'}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[200px]"
      >
        {step === 'uploading' ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            Submit assignment
          </>
        )}
      </button>

      <a href="/student/submissions" className="text-xs text-accent-teal hover:underline">
        Go to submissions page
      </a>
    </form>
  );
}
