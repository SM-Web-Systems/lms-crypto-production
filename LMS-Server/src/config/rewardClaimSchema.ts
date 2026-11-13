// Additive only: a learner proves control of their Stellar key before any reward leaves the LMS.
export const rewardClaimTables = ['reward_claims'];
export const rewardClaimSchema = `CREATE TABLE IF NOT EXISTS reward_claims (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  amount_stroops INTEGER NOT NULL CHECK (amount_stroops > 0),
  nonce_hash TEXT NOT NULL UNIQUE,
  challenge_expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('challenged','verified','expired','cancelled')),
  verified_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_claims_user ON reward_claims(user_id, status);`;
