// Additive only (F7): a sponsor's invitation puts a learner in a cohort only after the learner accepts.
export const cohortInvitationTables = ['cohort_invitations'];
export const cohortInvitationSchema = `CREATE TABLE IF NOT EXISTS cohort_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  cohort_id TEXT NOT NULL REFERENCES sponsor_cohorts(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cohort_invitations_user ON cohort_invitations(invited_user_id, status);
CREATE INDEX IF NOT EXISTS idx_cohort_invitations_cohort ON cohort_invitations(cohort_id, status);`;
