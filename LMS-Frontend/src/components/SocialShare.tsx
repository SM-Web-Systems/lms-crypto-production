import React, { useState } from 'react';
import { Briefcase, AtSign, Link, Check } from 'lucide-react';

interface SocialShareProps {
  url: string;
  title: string;
  compact?: boolean;
}

const SocialShare: React.FC<SocialShareProps> = ({ url, title, compact = false }) => {
  const [copied, setCopied] = useState(false);

  const shareOnLinkedIn = () => {
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
  };

  const shareOnTwitter = () => {
    const text = `I earned a blockchain-verified certificate: ${title}`;
    const shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const btnClass = compact
    ? 'inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors'
    : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800 transition-colors';

  const iconSize = compact ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <div className={compact ? 'flex items-center gap-3' : 'flex items-center justify-center gap-3 pt-4'}>
      <button type="button" onClick={shareOnLinkedIn} className={btnClass} aria-label="Share on LinkedIn">
        <Briefcase className={iconSize} aria-hidden />
        {!compact && 'LinkedIn'}
      </button>
      <button type="button" onClick={shareOnTwitter} className={btnClass} aria-label="Share on Twitter">
        <AtSign className={iconSize} aria-hidden />
        {!compact && 'Twitter'}
      </button>
      <button type="button" onClick={copyLink} className={btnClass} aria-label="Copy link">
        {copied ? <Check className={iconSize} aria-hidden /> : <Link className={iconSize} aria-hidden />}
        {!compact && (copied ? 'Copied!' : 'Copy Link')}
        {compact && copied && <span className="text-xs">Copied!</span>}
      </button>
    </div>
  );
};

export default SocialShare;
