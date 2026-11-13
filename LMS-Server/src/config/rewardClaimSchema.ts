// Additive only: a learner proves control of their Stellar key before any reward leaves the LMS.
export const rewardClaimTables = ['reward_claims', 'reward_claim_payouts'];
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
CREATE INDEX IF NOT EXISTS idx_reward_claims_user ON reward_claims(user_id, status);
CREATE TABLE IF NOT EXISTS reward_claim_payouts (
  claim_id TEXT PRIMARY KEY NOT NULL REFERENCES reward_claims(id) ON DELETE CASCADE,
  network TEXT NOT NULL CHECK (network IN ('testnet','public')),
  source TEXT NOT NULL,
  destination TEXT NOT NULL,
  amount_stroops INTEGER NOT NULL CHECK (amount_stroops > 0),
  activation_stroops INTEGER NOT NULL DEFAULT 0 CHECK (activation_stroops >= 0),
  tx_hash TEXT NOT NULL UNIQUE,
  envelope_xdr TEXT NOT NULL,
  max_time INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','paid','failed')),
  ledger INTEGER,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_claim_payouts_network ON reward_claim_payouts(network, status);`;
