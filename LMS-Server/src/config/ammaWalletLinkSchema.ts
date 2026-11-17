// Additive only: the Amma-held wallet AmmaWallet created for an LMS learner, and the AmmaWallet user id that activation calls need.
export const ammaWalletLinkTables = ['amma_wallet_links'];
export const ammaWalletLinkSchema = `CREATE TABLE IF NOT EXISTS amma_wallet_links (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amma_user_id INTEGER NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  previous_address TEXT,
  imported_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);`;
