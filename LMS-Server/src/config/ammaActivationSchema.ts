// Additive only: durable queue for asking AmmaWallet to activate a learner's wallet after a confirmed certificate.
export const ammaActivationTables = ['amma_activations'];
export const ammaActivationSchema = `CREATE TABLE IF NOT EXISTS amma_activations (
  id TEXT PRIMARY KEY NOT NULL,
  completion_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amma_user_id INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','submitted','confirmed','blocked','failed')),
  remote_activation_id TEXT,
  remote_state TEXT,
  tx_hash TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_amma_activations_due ON amma_activations(status, next_attempt_at);
`;
