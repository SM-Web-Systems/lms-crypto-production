// Additive only: an invitation sent to an email that has no LMS account yet. It becomes an ordinary
// pending parent, class or team invitation when the person signs up with that email and opens the link.
export const emailInvitationTables = ['email_invitations'];
export const emailInvitationSchema = `CREATE TABLE IF NOT EXISTS email_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('parent','class','team')),
  target_id TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending','claimed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  claimed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_invitations_email ON email_invitations(email, status);
CREATE INDEX IF NOT EXISTS idx_email_invitations_inviter ON email_invitations(invited_by, created_at);`;
