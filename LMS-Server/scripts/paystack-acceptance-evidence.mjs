import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const helperSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');

function requireEvidence(condition, code) {
  if (!condition) throw new Error(code);
}

// Retain real sandbox ledgers on both success and asynchronous/provider failure.
// The caller closes SQLite first. Credentials and arbitrary metadata are excluded.
export function retainPaystackAcceptanceEvidence(root, directory, evidence) {
  const parent = realpathSync(root);
  const target = realpathSync(directory);
  requireEvidence(target === directory && path.dirname(target) === parent &&
    path.basename(target).startsWith('lms-paystack-acceptance-'), 'UNEXPECTED_ACCEPTANCE_DIRECTORY');
  requireEvidence(evidence.mode === 'paystack-test-mode' &&
    ['passed', 'pending', 'failed'].includes(evidence.status), 'INVALID_ACCEPTANCE_STATE');
  requireEvidence(typeof evidence.chargeReference === 'string' &&
    /^lms-[A-Za-z0-9-]{1,120}$/.test(evidence.chargeReference), 'INVALID_TEST_CHARGE_REFERENCE');
  requireEvidence(evidence.refundReference === undefined ||
    /^lms-refund-[A-Za-z0-9_-]{1,53}$/.test(evidence.refundReference), 'INVALID_TEST_REFUND_REFERENCE');
  requireEvidence(['isolation', 'database', 'loopback', 'checkout', 'charge-settlement', 'receipt', 'refund'].includes(evidence.stage)
    && /^[a-f0-9]{64}$/.test(evidence.scriptSha256 ?? ''), 'INVALID_ACCEPTANCE_PROVENANCE');
  requireEvidence(Number.isSafeInteger(evidence.amount) && evidence.amount > 0 &&
    /^[A-Z]{3}$/.test(evidence.currency), 'INVALID_TEST_PAYMENT_TERMS');
  const database = path.join(target, 'synthetic.db');
  const metadata = lstatSync(database);
  requireEvidence(metadata.isFile() && !metadata.isSymbolicLink(), 'INVALID_ACCEPTANCE_DATABASE');
  const record = {
    version: 1,
    mode: 'paystack-test-mode',
    status: evidence.status,
    stage: evidence.stage,
    capturedAt: new Date().toISOString(),
    sourceRevision: /^[a-f0-9]{40}$/.test(evidence.sourceRevision ?? '') ? evidence.sourceRevision : null,
    scriptSha256: evidence.scriptSha256,
    evidenceHelperSha256: helperSha256,
    databaseFile: 'synthetic.db',
    databaseSha256: createHash('sha256').update(readFileSync(database)).digest('hex'),
    chargeReference: evidence.chargeReference,
    refundReference: evidence.refundReference,
    currency: evidence.currency,
    amount: evidence.amount,
    nextAction: evidence.status === 'passed' ? 'Retain for acceptance review.' :
      'Reconcile these exact test references before any replacement checkout or refund. Resume signed delivery using this ledger.',
  };
  const receipt = path.join(target, 'acceptance-state.json');
  writeFileSync(receipt, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { directory: target, receipt, databaseSha256: record.databaseSha256 };
}
