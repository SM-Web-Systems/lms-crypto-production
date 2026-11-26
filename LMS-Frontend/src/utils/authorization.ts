import type { User, Workspace } from '../types/api';

export const workspacePaths: Record<Workspace, string> = {
  admin: '/admin', lecturer: '/lecturer', 'teaching-assistant': '/ta',
  sponsor: '/sponsor', employer: '/employer', parent: '/parent', teacher: '/teacher', student: '/student',
};
export function hasCapability(user: User | null | undefined, permission: string): boolean {
  return user?.permissions?.includes(permission) ?? false;
}
export function availableWorkspaces(user: User | null | undefined): Workspace[] {
  return (user?.workspaces ?? []).filter(w => Object.prototype.hasOwnProperty.call(workspacePaths, w));
}
export function homeForUser(user: User | null | undefined): string {
  const workspaces = availableWorkspaces(user);
  const selected = user?.defaultWorkspace && workspaces.includes(user.defaultWorkspace) ? user.defaultWorkspace : workspaces[0];
  return selected ? workspacePaths[selected] : '/access-denied';
}
/**
 * The workspace a route belongs to. Shared routes (/profile, /messages, ...) have none, so they keep
 * `preferred` (the workspace the user was last in) when the user still has it, else the default.
 */
export function activeWorkspace(user: User | null | undefined, pathname: string, preferred?: Workspace | null): Workspace | undefined {
  const available = availableWorkspaces(user);
  return available.find(w => pathname === workspacePaths[w] || pathname.startsWith(workspacePaths[w] + '/'))
    ?? (preferred && available.includes(preferred) ? preferred : undefined)
    ?? available.find(w => w === user?.defaultWorkspace) ?? available[0];
}

// Kept in memory and, where allowed, in sessionStorage so a reload of /profile stays in the same workspace.
const LAST_WORKSPACE_KEY = 'lms_last_workspace';
let lastWorkspace: Workspace | null = null;
export function rememberedWorkspace(): Workspace | null {
  if (lastWorkspace) return lastWorkspace;
  try {
    const stored = sessionStorage.getItem(LAST_WORKSPACE_KEY);
    if (stored && Object.prototype.hasOwnProperty.call(workspacePaths, stored)) lastWorkspace = stored as Workspace;
  } catch { /* storage unavailable */ }
  return lastWorkspace;
}
export function rememberWorkspace(workspace: Workspace): void {
  lastWorkspace = workspace;
  try { sessionStorage.setItem(LAST_WORKSPACE_KEY, workspace); } catch { /* storage unavailable */ }
}
const requirements: Record<string, string[]> = {
  '/admin/students': ['user.manage'], '/admin/submissions': ['course.grade'],
  '/admin/documents': ['document.manage'], '/admin/course': ['course.manage'],
  '/admin/quizzes': ['quiz.manage'], '/admin/certificates': ['certificate.approve'],
  '/admin/sponsor': ['cohort.manage', 'system.view_audit_log'], '/admin/users': ['user.assign_role', 'user.view_all'],
  '/lecturer/course': ['course.manage'], '/lecturer/quizzes': ['quiz.manage'], '/lecturer/submissions': ['course.grade'], '/lecturer/certificates': ['certificate.approve'],
  '/admin/rewards': ['reward.manage'], '/admin/platform-credit': ['reward.manage'],
  '/student/submissions': ['course.submit'], '/student/payments': ['billing.view_own'],
  '/student/rewards': ['reward.view_own'], '/student/badges': ['certificate.view_own'],
  '/student/progress': ['course.view'],
  '/sponsor/cohorts': ['cohort.manage'], '/sponsor/billing': ['billing.view_own'],
  '/sponsor/impact': ['impact_report.read'], '/sponsor/rewards': ['reward.view_assigned'],
};
export function canAccessPath(user: User | null | undefined, pathname: string): boolean {
  if (!user) return false;
  const workspaces = availableWorkspaces(user);
  const routeWorkspace = (Object.keys(workspacePaths) as Workspace[]).find(w => pathname === workspacePaths[w] || pathname.startsWith(workspacePaths[w] + '/'));
  if (routeWorkspace && !workspaces.includes(routeWorkspace)
    && !(pathname === '/admin/course' && workspaces.includes('lecturer'))) return false;
  const required = (pathname.startsWith('/admin/sponsor/') ? requirements['/admin/sponsor'] : requirements[pathname]) ?? (pathname.endsWith('/course') || pathname.includes('/courses/') || pathname.endsWith('/course-members') ? ['course.view']
    : pathname.endsWith('/documents') ? ['document.view']
    : pathname.endsWith('/quizzes') ? ['quiz.view']
    : pathname.endsWith('/forum') ? ['forum.view'] : []);
  return required.every(p => hasCapability(user, p));
}
