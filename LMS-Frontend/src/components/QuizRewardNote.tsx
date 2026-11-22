import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { rewardService } from '../services/rewardService';
import { formatXlm } from '../utils/xlmAmount';
import { useXlmUsdcPrice } from '../hooks/useXlmUsdcPrice';

/** Server times arrive as ISO (completedAt) or raw SQLite UTC text (released_at). */
const serverMs = (t: string) => Date.parse(t.includes('T') ? t : `${t.replace(' ', 'T')}Z`);

/**
 * UX-012 (web half, matches the mobile QuizRewardNote from #279): after a quiz pass, say what it earned and
 * link to Rewards. An auto-release reward is released while the server handles the submit, so its released_at
 * sits within seconds of completedAt; a reward that needs approval is not listed yet.
 */
export function QuizRewardNote({ passed, completedAt }: { passed: boolean; completedAt: string }) {
  const [earned, setEarned] = useState<number | null>(null);
  const xlmUsdc = useXlmUsdcPrice();
  useEffect(() => {
    if (!passed) return;
    let cancelled = false;
    rewardService
      .getMyRewards()
      .then((rows) => {
        const passedAt = serverMs(completedAt);
        // Whole-second timestamps, so allow a little slack either side; anything outside is another event's reward.
        const total = (rows ?? [])
          .filter((r) => r.status === 'released' && r.releasedAt && Math.abs(serverMs(r.releasedAt) - passedAt) <= 5000)
          .reduce((sum, r) => sum + Number(r.amountStroops || 0), 0);
        if (!cancelled) setEarned(total);
      })
      .catch(() => undefined); // Without the amount the learner still gets the link.
    return () => {
      cancelled = true;
    };
  }, [passed, completedAt]);
  if (!passed) return null;
  return (
    <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <Gift className="h-5 w-5 shrink-0 text-emerald-700 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-1">
          {earned ? (
            <p role="status" className="text-neutral-800">
              You earned <strong>{formatXlm(earned, xlmUsdc)}</strong>. It stays in your LMS balance until you claim it to your wallet.
            </p>
          ) : earned === 0 ? (
            <p className="text-neutral-700">Some rewards need your instructor's approval before they appear in Rewards.</p>
          ) : null}
          <Link to="/student/rewards" className="inline-block font-semibold text-emerald-800 underline-offset-2 hover:underline">
            See my rewards
          </Link>
        </div>
      </div>
    </div>
  );
}
