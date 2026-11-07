export const platformCreditTables = ['platform_backing_intents','platform_backing_deposits','platform_credit_requests',
  'platform_credit_grants','platform_credit_reservations','platform_credit_consumptions','platform_credit_audit'];

export const platformCreditSchema = `
CREATE TABLE IF NOT EXISTS platform_backing_intents (
  id TEXT PRIMARY KEY,
  requester_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  network TEXT NOT NULL CHECK (network IN ('testnet','public')),
  destination TEXT NOT NULL,
  memo_hash TEXT NOT NULL UNIQUE CHECK (length(memo_hash) = 64),
  amount_stroops INTEGER NOT NULL CHECK (typeof(amount_stroops) = 'integer' AND amount_stroops > 0 AND amount_stroops <= 9007199254740991),
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(requester_user_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS platform_backing_deposits (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL UNIQUE REFERENCES platform_backing_intents(id) ON DELETE RESTRICT,
  verified_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  network TEXT NOT NULL CHECK (network IN ('testnet','public')),
  operation_id TEXT NOT NULL,
  amount_stroops INTEGER NOT NULL CHECK (typeof(amount_stroops) = 'integer' AND amount_stroops > 0 AND amount_stroops <= 9007199254740991),
  transaction_hash TEXT NOT NULL CHECK (length(transaction_hash) = 64),
  ledger_sequence INTEGER NOT NULL CHECK (typeof(ledger_sequence) = 'integer' AND ledger_sequence > 0),
  ledger_hash TEXT NOT NULL CHECK (length(ledger_hash) = 64),
  created_at TEXT NOT NULL,
  UNIQUE(network,operation_id)
);
CREATE TABLE IF NOT EXISTS platform_credit_requests (
  id TEXT PRIMARY KEY,
  requester_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  beneficiary_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  network TEXT NOT NULL CHECK (network IN ('testnet','public')),
  amount_stroops INTEGER NOT NULL CHECK (typeof(amount_stroops) = 'integer' AND amount_stroops > 0 AND amount_stroops <= 9007199254740991),
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','cancelled')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(requester_user_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS platform_credit_grants (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES platform_credit_requests(id) ON DELETE RESTRICT,
  approved_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approval_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(approved_by_user_id,approval_key)
);
CREATE TABLE IF NOT EXISTS platform_credit_reservations (
  intent_id TEXT PRIMARY KEY REFERENCES reward_funding_intents(id) ON DELETE RESTRICT,
  grant_id TEXT NOT NULL REFERENCES platform_credit_grants(id) ON DELETE RESTRICT,
  amount_stroops INTEGER NOT NULL CHECK (typeof(amount_stroops) = 'integer' AND amount_stroops > 0 AND amount_stroops <= 9007199254740991),
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','consumed','released')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_credit_consumptions (
  intent_id TEXT PRIMARY KEY REFERENCES platform_credit_reservations(intent_id) ON DELETE RESTRICT,
  evidence_id TEXT NOT NULL UNIQUE REFERENCES reward_funding_evidence(id) ON DELETE RESTRICT,
  fund_transaction_id TEXT NOT NULL UNIQUE REFERENCES reward_transactions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_credit_audit (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('deposit_intent','deposit_verified','credit_requested','credit_approved','request_cancelled','credit_reserved','credit_consumed','reservation_released')),
  object_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  network TEXT NOT NULL CHECK (network IN ('testnet','public')),
  amount_stroops INTEGER NOT NULL CHECK (typeof(amount_stroops) = 'integer' AND amount_stroops > 0 AND amount_stroops <= 9007199254740991),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS platform_credit_request_immutable
BEFORE UPDATE ON platform_credit_requests
WHEN OLD.status != 'pending' OR NEW.id IS NOT OLD.id OR NEW.requester_user_id IS NOT OLD.requester_user_id
  OR NEW.beneficiary_user_id IS NOT OLD.beneficiary_user_id OR NEW.network IS NOT OLD.network
  OR NEW.amount_stroops IS NOT OLD.amount_stroops OR NEW.reason IS NOT OLD.reason
  OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.expires_at IS NOT OLD.expires_at OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT,'platform credit request is immutable'); END;
CREATE TRIGGER IF NOT EXISTS platform_credit_reservation_immutable
BEFORE UPDATE ON platform_credit_reservations
WHEN OLD.status != 'held' OR NEW.intent_id IS NOT OLD.intent_id OR NEW.grant_id IS NOT OLD.grant_id
  OR NEW.amount_stroops IS NOT OLD.amount_stroops OR NEW.expires_at IS NOT OLD.expires_at OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT,'platform credit reservation is immutable'); END;
CREATE TRIGGER IF NOT EXISTS reward_operation_not_platform_backing
BEFORE INSERT ON reward_funding_evidence
WHEN NEW.source_type = 'stellar' AND EXISTS (SELECT 1 FROM platform_backing_deposits WHERE network=NEW.network AND operation_id=NEW.reference)
BEGIN SELECT RAISE(ABORT,'funding_operation_already_consumed'); END;
CREATE TRIGGER IF NOT EXISTS platform_operation_not_reward_funding
BEFORE INSERT ON platform_backing_deposits
WHEN EXISTS (SELECT 1 FROM reward_funding_evidence WHERE source_type='stellar' AND network=NEW.network AND reference=NEW.operation_id)
BEGIN SELECT RAISE(ABORT,'funding_operation_already_consumed'); END;
` + platformCreditTables.map(table => `
CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
BEGIN SELECT RAISE(ABORT,'platform credit history is immutable'); END;
` + (['platform_credit_requests','platform_credit_reservations'].includes(table) ? '' : `
CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table}
BEGIN SELECT RAISE(ABORT,'platform credit history is immutable'); END;
`)).join('');
