import type { User, Workspace } from '../types/api';

export const workspacePaths: Record<Workspace,string> = {
  admin:'/admin', lecturer:'/lecturer', 'teaching-assistant':'/ta', sponsor:'/sponsor',
  employer:'/employer', parent:'/parent', teacher:'/teacher', student:'/student',
};
export const workspaceLabels: Record<Workspace,string> = {
  admin:'Administration', lecturer:'Teaching', 'teaching-assistant':'Teaching assistant', sponsor:'Sponsorship',
  employer:'Employer', parent:'Parent', teacher:'Teacher', student:'Student learning',
};
export function workspacesFor(user: User | null): Workspace[] {
  return (user?.workspaces ?? []).filter((workspace) => Object.prototype.hasOwnProperty.call(workspacePaths,workspace));
}
export function canStudy(user: User | null): boolean {
  return workspacesFor(user).includes('student') && !!user?.permissions?.includes('course.view');
}
export function mobileHome(user: User | null): '/(auth)/sign-in' | '/(student)/dashboard' | '/workspace' | '/account' {
  if (!user) return '/(auth)/sign-in';
  if (user.deletionStatus === 'pending_deletion') return '/account';
  if (canStudy(user) && (!user.defaultWorkspace || user.defaultWorkspace === 'student')) return '/(student)/dashboard';
  return '/workspace';
}
export function canOpenStudentPath(user: User | null, path: string): boolean {
  if (!canStudy(user)) return false;
  const screen = path.split('/').filter(Boolean).at(-1);
  const required: Record<string,string> = {course:'course.view',submissions:'course.submit',documents:'document.view',quizzes:'quiz.view',forum:'forum.view',certificates:'certificate.view_own','certificate-detail':'certificate.view_own'};
  return !screen || !required[screen] || !!user?.permissions?.includes(required[screen]);
}
