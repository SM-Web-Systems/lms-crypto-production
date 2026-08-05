import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Award, Shield, Download, X } from 'lucide-react';
import { courseCompletionService } from '../services/courseCompletionService';
import type { TierInfo, CertificateTier, CertificateBadgeData } from '../types/api';

interface TierSelectorProps {
  courseId: string;
  onSelect: (tier: CertificateTier) => void;
  onCancel: () => void;
}

export function TierSelector({ courseId, onSelect, onCancel }: TierSelectorProps) {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    courseCompletionService.getTiers(courseId)
      .then((info) => {
        setTierInfo(info);
        // Auto-select if only one tier available
        if (info.tiersEnabled === 'free_only') {
          onSelect('free');
        } else if (info.tiersEnabled === 'paid_only') {
          onSelect('paid');
        }
      })
      .catch(() => setTierInfo(null))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-neutral-200 rounded w-1/2" />
            <div className="h-24 bg-neutral-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!tierInfo || tierInfo.tiersEnabled !== 'both') {
    return null; // Auto-selected or error
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Choose Certificate Type</h3>
          <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Free Tier Card */}
          <button
            onClick={() => onSelect('free')}
            className="w-full text-left border-2 border-neutral-200 hover:border-emerald-400 rounded-lg p-4 transition-colors"
          >
            <div className="flex items-start gap-3">
              <Award className="h-6 w-6 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold text-emerald-700">Free Badge</div>
                <p className="text-sm text-neutral-600 mt-1">
                  Digital certificate of completion. Download as SVG image.
                </p>
                <span className="inline-block mt-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Free
                </span>
              </div>
            </div>
          </button>

          {/* Paid Tier Card */}
          <button
            onClick={() => onSelect('paid')}
            className="w-full text-left border-2 border-neutral-200 hover:border-violet-400 rounded-lg p-4 transition-colors"
          >
            <div className="flex items-start gap-3">
              <Shield className="h-6 w-6 text-violet-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold text-violet-700">Verified NFT Certificate</div>
                <p className="text-sm text-neutral-600 mt-1">
                  On-chain credential on Stellar blockchain. Verifiable and permanent.
                </p>
                <span className="inline-block mt-2 text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded">
                  {tierInfo.isFree ? 'Free' : `$${(tierInfo.priceCents / 100).toFixed(2)}`}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Badge Display Component ─────────────────────────────────────────────────

interface BadgeDisplayProps {
  badgeId: string;
}

export function BadgeDisplay({ badgeId }: BadgeDisplayProps) {
  const [badge, setBadge] = useState<CertificateBadgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    courseCompletionService.getBadge(badgeId)
      .then(setBadge)
      .catch(() => setBadge(null))
      .finally(() => setLoading(false));
  }, [badgeId]);

  if (loading) return <span className="text-xs text-neutral-400">Loading badge...</span>;
  if (!badge) return null;

  const handleDownload = () => {
    const blob = new Blob([badge.badgeSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificate-${badge.badgeId.slice(0, 8)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
          <Award className="h-3 w-3 mr-1" />
          View Badge
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-3 w-3 mr-1" />
          Download
        </Button>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Your Certificate Badge</h3>
              <button onClick={() => setShowPreview(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="border rounded-lg overflow-hidden"
              dangerouslySetInnerHTML={{ __html: badge.badgeSvg }}
            />
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-3 w-3 mr-1" />
                Download SVG
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
