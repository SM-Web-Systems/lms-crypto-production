import { roleLabels, rolesText, type RolePresentation } from '../utils/rolePresentation';

export function RoleBadges({ subject }: { subject: RolePresentation | null | undefined }) {
  const labels = roleLabels(subject);
  return <span className="inline-flex flex-wrap gap-1">
    {labels.length ? labels.map((label, index) =>
      <span key={index} className="text-xs normal-case px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 break-words">{label}</span>
    ) : <span className="text-xs text-neutral-500">{rolesText(subject)}</span>}
  </span>;
}
