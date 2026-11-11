import type { RoleSummary } from '../types/api';

export interface RolePresentation {
  roleSummaries?: RoleSummary[];
  rbacRoles?: string[];
}

/** Presentation only: never infer access or a workspace from an assignment name. */
export function roleLabels(subject: RolePresentation | null | undefined): string[] {
  if (Array.isArray(subject?.roleSummaries)) return subject.roleSummaries.map(role => role.label || role.name);
  // Step 2 servers already supply exact assignment names, but not human labels.
  return [...new Set(subject?.rbacRoles ?? [])];
}

export function rolesText(subject: RolePresentation | null | undefined): string {
  if (!Array.isArray(subject?.roleSummaries) && !Array.isArray(subject?.rbacRoles)) return 'Roles unavailable';
  return roleLabels(subject).join(', ') || 'No roles assigned';
}

/** Discard old single-role hints on every verified session replacement. */
export function currentSessionUser<T extends { role?: string }>(user: T): Omit<T, 'role'> {
  const { role: _legacyHint, ...current } = user;
  return current;
}
