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
export function activeWorkspace(user: User | null | undefined, pathname: string): Workspace | undefined {
  const available = availableWorkspaces(user);
  return available.find(w => pathname === workspacePaths[w] || pathname.startsWith(workspacePaths[w] + '/'))
    ?? available.find(w => w === user?.defaultWorkspace) ?? available[0];
}
const requirements: Record<string, string[]> = {
  '/admin/students': ['user.view_all'], '/admin/submissions': ['course.grade'],
  '/admin/documents': ['document.manage'], '/admin/course': ['course.manage'],
  '/admin/quizzes': ['quiz.manage'], '/admin/certificates': ['certificate.approve'],
  '/admin/sponsor': ['cohort.manage', 'system.view_audit_log'], '/admin/users': ['user.assign_role', 'user.view_all'],
  '/lecturer/course': ['course.manage'], '/lecturer/submissions': ['course.manage'],
  '/student/submissions': ['course.submit'], '/student/payments': ['billing.view_own'],
  '/student/rewards': ['reward.view_own'], '/student/badges': ['certificate.view_own'],
  '/student/progress': ['course.view'], '/ta/grade': ['course.grade_pending'],
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
