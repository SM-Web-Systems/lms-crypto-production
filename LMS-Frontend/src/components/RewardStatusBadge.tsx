/**
 * RewardStatusBadge — Displays reward or allocation status as a styled pill.
 */

import React from 'react';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  // Reward states
  draft:                      { bg: 'bg-neutral-100', text: 'text-neutral-600',  label: 'Draft' },
  pending_funding:            { bg: 'bg-yellow-100',  text: 'text-yellow-800',   label: 'Pending Funding' },
  funded:                     { bg: 'bg-blue-100',    text: 'text-blue-800',     label: 'Funded' },
  active:                     { bg: 'bg-blue-100',    text: 'text-blue-800',     label: 'Active' },
  eligible_pending_approval:  { bg: 'bg-amber-100',   text: 'text-amber-800',    label: 'Pending Approval' },
  approved:                   { bg: 'bg-teal-100',    text: 'text-teal-800',     label: 'Approved' },
  eligible_auto_release:      { bg: 'bg-cyan-100',    text: 'text-cyan-800',     label: 'Auto-Release' },
  partially_released:         { bg: 'bg-emerald-100', text: 'text-emerald-800',  label: 'Partially Released' },
  released:                   { bg: 'bg-green-100',   text: 'text-green-800',    label: 'Released' },
  cancelled:                  { bg: 'bg-red-100',     text: 'text-red-800',      label: 'Cancelled' },
  expired:                    { bg: 'bg-neutral-200', text: 'text-neutral-700',  label: 'Expired' },
  partially_refunded:         { bg: 'bg-orange-100',  text: 'text-orange-800',   label: 'Partially Refunded' },
  refunded:                   { bg: 'bg-red-100',     text: 'text-red-700',      label: 'Refunded' },
  // Allocation states
  pending:                    { bg: 'bg-yellow-100',  text: 'text-yellow-800',   label: 'Pending' },
  eligible:                   { bg: 'bg-blue-100',    text: 'text-blue-800',     label: 'Eligible' },
};

const DEFAULT_STYLE = { bg: 'bg-neutral-100', text: 'text-neutral-600' };

interface RewardStatusBadgeProps {
  status: string;
  className?: string;
  /** Overrides the label, e.g. a learner sees a released allocation as "Earned" (in the LMS, not yet paid to a wallet). */
  label?: string;
}

export const RewardStatusBadge: React.FC<RewardStatusBadgeProps> = ({ status, className = '', label: labelOverride }) => {
  const style = STATUS_STYLES[status] ?? DEFAULT_STYLE;
  const label = labelOverride ?? STATUS_STYLES[status]?.label ?? status.replace(/_/g, ' ');

  return (
    <span
      data-testid="reward-status-badge"
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text} ${className}`}
    >
      {label}
    </span>
  );
};
