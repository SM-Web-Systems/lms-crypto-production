import type { RoleSummary } from '../types/api';

export interface RolePresentation {
  roleSummaries?: RoleSummary[];
  rbacRoles?: string[];
}

/** Presentation only: never infer access or a workspace from an assignment name. */
export function roleLabels(subject: RolePresentation | null | undefined): string[] {
  if (Array.isArray(subject?.roleSummaries)) return subject.roleSummaries.map(role => role.label || role.name);
  // Exact assignment names can be displayed when human labels are unavailable.
  return [...new Set(subject?.rbacRoles ?? [])];
}

export function rolesText(subject: RolePresentation | null | undefined): string {
  if (!Array.isArray(subject?.roleSummaries) && !Array.isArray(subject?.rbacRoles)) return 'Roles unavailable';
  return roleLabels(subject).join(', ') || 'No roles assigned';
}

/** Replace sessions with known identity/current-context fields only. Never hydrate JWT hints. */
export function currentSessionUser<T extends {id: string; name: string; email: string}>(user: T) {
  const keys = ['id','name','email','walletAddress','walletLinkingStatus','authProvider',
    'courseCodes','rbacRoles','roleSummaries','permissions','workspaces','defaultWorkspace',
    'adminTier','assignedCourses','deletionStatus'] as const;
  const current: Partial<T> = {};
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(user,key)) {
    const field = key as keyof T;
    current[field] = user[field];
  }
  return current as Pick<T, Extract<keyof T, typeof keys[number]>>;
}
