import type { RolePresentation } from '../utils/rolePresentation';

export interface DirectoryUser extends RolePresentation {
  id: string;
  name: string;
  email?: string;
  /** Course codes this user can access (students); set by admin when adding to courses or editing. */
  courseCodes?: string[];
}

/** Scoped course enrollment with learner-profile membership, not an access grant. */
export interface CourseMember extends DirectoryUser {
  email: string;
  studentId?: string | null;
}
