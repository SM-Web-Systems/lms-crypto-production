export const offlineLearningSchemaTables = ['offline_learning_leases', 'offline_progress_receipts'];

export const offlineLearningSchema = `
CREATE TABLE IF NOT EXISTS offline_learning_leases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  content_version TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > issued_at),
  UNIQUE (user_id, course_id, session_hash, content_version)
);

CREATE INDEX IF NOT EXISTS idx_offline_learning_leases_expiry ON offline_learning_leases(expires_at);
CREATE INDEX IF NOT EXISTS idx_offline_learning_leases_course ON offline_learning_leases(course_id);

CREATE TABLE IF NOT EXISTS offline_progress_receipts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  retain_until INTEGER NOT NULL,
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_offline_progress_receipts_expiry ON offline_progress_receipts(retain_until);

CREATE TRIGGER IF NOT EXISTS offline_learning_revoke_course_code_delete
AFTER DELETE ON user_course_codes
BEGIN
  DELETE FROM offline_learning_leases WHERE user_id = OLD.user_id AND course_code = OLD.course_code;
END;

CREATE TRIGGER IF NOT EXISTS offline_learning_revoke_course_code_update
AFTER UPDATE OF user_id, course_code ON user_course_codes
WHEN NEW.user_id != OLD.user_id OR NEW.course_code != OLD.course_code
BEGIN
  DELETE FROM offline_learning_leases WHERE user_id = OLD.user_id AND course_code = OLD.course_code;
END;

CREATE TRIGGER IF NOT EXISTS offline_learning_revoke_course
AFTER UPDATE OF approval_status, course_code ON courses
WHEN NEW.course_code IS NOT OLD.course_code OR COALESCE(NEW.approval_status, '') NOT IN ('approved', 'published')
BEGIN
  DELETE FROM offline_learning_leases WHERE course_id = OLD.id;
END;
`;
