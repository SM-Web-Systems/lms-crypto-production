// Additive only: a learner must accept before a teacher's class includes them.
export const classInvitationTables = ['class_invitations'];
export const classInvitationSchema = `CREATE TABLE IF NOT EXISTS class_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_class_invitations_user ON class_invitations(invited_user_id, status);
CREATE INDEX IF NOT EXISTS idx_class_invitations_group ON class_invitations(group_id, status);`;
