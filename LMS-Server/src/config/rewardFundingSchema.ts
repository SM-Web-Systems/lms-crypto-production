import {platformCreditTables} from './platformCreditSchema.js';
// Additive schema only. Never backfill evidence for historical ledger entries.
export const rewardFundingSchema = `
CREATE TABLE IF NOT EXISTS reward_funding_intents (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('admin_grant','platform_credit','stellar','paystack')),
  network TEXT NOT NULL,
  asset TEXT NOT NULL,
  currency_code TEXT NOT NULL CHECK (currency_code = 'XLM'),
  amount_stroops INTEGER NOT NULL CHECK (typeof(amount_stroops) = 'integer' AND amount_stroops > 0 AND amount_stroops <= 9007199254740991),
  reference TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','consumed')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(actor_user_id, idempotency_key),
  CHECK ((status = 'pending' AND consumed_at IS NULL) OR (status = 'consumed' AND consumed_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS reward_funding_evidence (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL UNIQUE REFERENCES reward_funding_intents(id) ON DELETE RESTRICT,
  ledger_transaction_id TEXT NOT NULL UNIQUE REFERENCES reward_transactions(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL,
  network TEXT NOT NULL,
  reference TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_type, network, reference)
);
CREATE TRIGGER IF NOT EXISTS reward_funding_intent_immutable
BEFORE UPDATE ON reward_funding_intents
WHEN NEW.id IS NOT OLD.id OR NEW.reward_id IS NOT OLD.reward_id
  OR NEW.owner_user_id IS NOT OLD.owner_user_id OR NEW.actor_user_id IS NOT OLD.actor_user_id
  OR NEW.source_type IS NOT OLD.source_type OR NEW.network IS NOT OLD.network
  OR NEW.asset IS NOT OLD.asset OR NEW.currency_code IS NOT OLD.currency_code
  OR NEW.amount_stroops IS NOT OLD.amount_stroops OR NEW.reference IS NOT OLD.reference
  OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.created_at IS NOT OLD.created_at OR OLD.status = 'consumed'
BEGIN SELECT RAISE(ABORT, 'funding intent is immutable'); END;
CREATE TRIGGER IF NOT EXISTS reward_funding_intent_no_delete
BEFORE DELETE ON reward_funding_intents
BEGIN SELECT RAISE(ABORT, 'funding history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS reward_funding_evidence_no_update
BEFORE UPDATE ON reward_funding_evidence
BEGIN SELECT RAISE(ABORT, 'funding evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS reward_funding_evidence_no_delete
BEFORE DELETE ON reward_funding_evidence
BEGIN SELECT RAISE(ABORT, 'funding evidence is immutable'); END;
CREATE TABLE IF NOT EXISTS reward_stellar_funding_bindings (
  intent_id TEXT PRIMARY KEY REFERENCES reward_funding_intents(id) ON DELETE RESTRICT,
  destination TEXT NOT NULL,
  memo_hash TEXT NOT NULL UNIQUE CHECK (length(memo_hash) = 64 AND memo_hash NOT GLOB '*[^a-f0-9]*')
);
CREATE TABLE IF NOT EXISTS reward_stellar_funding_evidence (
  evidence_id TEXT PRIMARY KEY REFERENCES reward_funding_evidence(id) ON DELETE RESTRICT,
  transaction_hash TEXT NOT NULL CHECK (length(transaction_hash) = 64),
  ledger_sequence INTEGER NOT NULL CHECK (typeof(ledger_sequence) = 'integer' AND ledger_sequence > 0),
  ledger_hash TEXT NOT NULL CHECK (length(ledger_hash) = 64)
);
CREATE TRIGGER IF NOT EXISTS reward_stellar_binding_no_update
BEFORE UPDATE ON reward_stellar_funding_bindings
BEGIN SELECT RAISE(ABORT, 'Stellar binding is immutable'); END;
CREATE TRIGGER IF NOT EXISTS reward_stellar_binding_no_delete
BEFORE DELETE ON reward_stellar_funding_bindings
BEGIN SELECT RAISE(ABORT, 'Stellar binding is immutable'); END;
CREATE TRIGGER IF NOT EXISTS reward_stellar_evidence_no_update
BEFORE UPDATE ON reward_stellar_funding_evidence
BEGIN SELECT RAISE(ABORT, 'Stellar evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS reward_stellar_evidence_no_delete
BEFORE DELETE ON reward_stellar_funding_evidence
BEGIN SELECT RAISE(ABORT, 'Stellar evidence is immutable'); END;
`;

export const fundingSchemaTables = ['reward_funding_intents', 'reward_funding_evidence',
  'reward_stellar_funding_bindings', 'reward_stellar_funding_evidence', ...platformCreditTables];
