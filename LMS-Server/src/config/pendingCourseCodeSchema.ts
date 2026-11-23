// Additive only: course access an admin gave a student who has no LMS account yet; moved to user_course_codes when the account is made.
export const pendingCourseCodeTables = ['pending_course_codes'];
export const pendingCourseCodeSchema = `CREATE TABLE IF NOT EXISTS pending_course_codes (
  email TEXT NOT NULL COLLATE NOCASE,
  course_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, course_code)
);`;
