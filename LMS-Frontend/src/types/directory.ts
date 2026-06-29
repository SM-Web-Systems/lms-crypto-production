export type UserRole = 'student' | 'admin';

export interface DirectoryUser {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  /** Course codes this user can access (students); set by admin when adding to courses or editing. */
  courseCodes?: string[];
}
