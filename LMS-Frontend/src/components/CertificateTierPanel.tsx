import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { Card, CardContent } from './Card';
import { Button } from './Button';
import { courseService } from '../services/courseService';
import { useAuth } from '../context/useAuth';
import { hasCapability } from '../utils/authorization';
import { getErrorMessage } from '../utils/apiError';
import type { CertificateTiers, CourseApprovalStatus } from '../types/course';

const OPTIONS: Array<{ value: CertificateTiers; label: string; help: string }> = [
  { value: 'free_only', label: 'Free certificate only', help: 'Learners get a free certificate badge. No NFT is minted.' },
  { value: 'paid_only', label: 'Paid certificate only', help: 'Learners pay for an NFT certificate on Stellar.' },
  { value: 'both', label: 'Both', help: 'Learners choose a free badge or a paid NFT certificate.' },
];

/**
 * Certificate tier on the course editor. A lecturer chooses it while the course is a draft or sent back;
 * once submitted only an administrator can change it. An administrator sets the paid price separately.
 */
export default function CertificateTierPanel({ courseId, status }: { courseId: string; status?: CourseApprovalStatus }) {
  const { user } = useAuth();
  const isAdmin = hasCapability(user, 'course.approve');
  const locked = !isAdmin && status !== 'draft' && status !== 'rejected';
  const [tiers, setTiers] = useState<CertificateTiers>('both');
  const [saved, setSaved] = useState<CertificateTiers>('both');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    courseService.getCertificateTiers(courseId)
      .then((t) => { if (live) { setTiers(t); setSaved(t); } })
      .catch(() => { /* keep the default */ });
    return () => { live = false; };
  }, [courseId]);

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try { const t = await courseService.setCertificateTiers(courseId, tiers); setTiers(t); setSaved(t); setNotice('Certificate tier saved.'); }
    catch (e) { setError(getErrorMessage(e, 'Could not save the certificate tier.')); }
    finally { setBusy(false); }
  };

  return (
    <Card className="border border-neutral-200">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-neutral-200 bg-neutral-50/60">
        <Award className="h-4 w-4 text-accent-teal" aria-hidden />
        <h3 className="text-sm font-semibold text-neutral-800">Certificate tier</h3>
      </div>
      <CardContent className="space-y-3 pt-4 pb-5">
        <p className="text-xs text-neutral-500">
          {locked
            ? 'The tier is locked once the course is submitted. Ask an administrator to change it.'
            : 'Choose which certificate learners can get. An administrator sets the price of the paid certificate.'}
        </p>
        <fieldset className="space-y-2" disabled={locked || busy}>
          <legend className="sr-only">Certificate tier</legend>
          {OPTIONS.map((o) => (
            <label key={o.value} className="flex items-start gap-3 cursor-pointer select-none">
              <input type="radio" name={`cert-tier-${courseId}`} value={o.value} checked={tiers === o.value}
                onChange={() => setTiers(o.value)}
                className="mt-0.5 h-4 w-4 border-neutral-300 text-accent-teal focus:ring-accent-teal" />
              <span className="text-sm text-neutral-700">{o.label}<span className="block text-xs text-neutral-500">{o.help}</span></span>
            </label>
          ))}
        </fieldset>
        {!locked && (
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy || tiers === saved}>
            Save certificate tier
          </Button>
        )}
        {notice && <p className="text-xs text-emerald-700" role="status">{notice}</p>}
        {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
