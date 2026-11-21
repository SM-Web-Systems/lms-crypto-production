import { useState } from 'react';
import { CheckCircle, Download, Undo2 } from 'lucide-react';
import Button from './Button';
import type { Submission } from '../types/api';
import { taService } from '../services/taService';
import { getErrorMessage } from '../utils/apiError';

const proposedLabel = (status?: string) => (status === 'rejected' ? 'Reject' : 'Approve');

function TaGradeRow({ sub, onDecided, onDownload }: {
  sub: Submission;
  onDecided: () => void;
  onDownload: (id: string) => void;
}) {
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      onDecided();
    } catch (err) {
      setError(getErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const sendBack = () => {
    if (!note.trim()) { setError('Add a note for the TA before sending the grade back.'); return; }
    void run(() => taService.sendBackGrade(sub.id, note.trim()), 'Could not send the grade back.');
  };

  return (
    <div data-testid={`ta-grade-${sub.id}`} className="px-5 py-4 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{sub.studentName}</p>
          <p className="text-sm text-gray-700">{sub.title}</p>
          <p className="text-xs text-gray-500 mt-1">
            Graded by {sub.gradedByName ?? 'a TA'} · <span className="font-medium">Proposed: {proposedLabel(sub.proposedStatus)}</span>
          </p>
          {sub.taFeedback && <p className="text-xs text-gray-600 mt-1"><strong>TA feedback:</strong> {sub.taFeedback}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => onDownload(sub.id)} aria-label={`Download ${sub.fileName} from ${sub.studentName}`}>
            <Download className="h-3 w-3" aria-hidden />
          </Button>
          <Button variant="success" size="sm" disabled={busy} onClick={() => void run(() => taService.approveGrade(sub.id), 'Could not approve the grade.')}>
            Approve grade
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setSendingBack(o => !o); setError(''); }}>
            Send back
          </Button>
        </div>
      </div>
      {sendingBack && (
        <div className="mt-3 space-y-2">
          <label htmlFor={`ta-note-${sub.id}`} className="block text-sm font-medium text-neutral-700">Note for the TA</label>
          <textarea
            id={`ta-note-${sub.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What should the TA change?"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
          />
          <Button variant="danger" size="sm" disabled={busy} onClick={sendBack}>
            <Undo2 className="h-3 w-3 mr-1" aria-hidden />Send back to TA
          </Button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** UX-002: TA grades waiting for a lecturer or admin decision. */
export function TaGradeApprovals({ submissions, error, onDecided, onDownload }: {
  submissions: Submission[];
  error: string | null;
  onDecided: () => void;
  onDownload: (id: string) => void;
}) {
  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (submissions.length === 0) {
    return (
      <div className="text-center py-10">
        <CheckCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" aria-hidden />
        <p className="text-gray-500 text-sm">No TA grades are waiting for approval.</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden">
      {submissions.map((sub) => <TaGradeRow key={sub.id} sub={sub} onDecided={onDecided} onDownload={onDownload} />)}
    </div>
  );
}
