// Additive only: a user asks for a parent, teacher, employer or sponsor role and an administrator decides.
export const roleRequestTables = ['role_requests'];
export const roleRequestSchema = `CREATE TABLE IF NOT EXISTS role_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','declined','cancelled')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_role_requests_user ON role_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_role_requests_status ON role_requests(status, created_at);`;
