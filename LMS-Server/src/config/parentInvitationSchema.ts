// Additive only: a learner who already has an account must accept before a parent is linked to them.
export const parentInvitationTables = ['parent_invitations'];
export const parentInvitationSchema = `CREATE TABLE IF NOT EXISTS parent_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  parent_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_user ON parent_invitations(invited_user_id, status);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_parent ON parent_invitations(parent_user_id, status);`;
