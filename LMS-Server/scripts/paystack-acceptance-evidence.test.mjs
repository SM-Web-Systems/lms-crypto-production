import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { retainPaystackAcceptanceEvidence } from './paystack-acceptance-evidence.mjs';

function fixture(t, prefix = 'lms-paystack-acceptance-') {
  const root = realpathSync(tmpdir());
  const directory = realpathSync(mkdtempSync(path.join(root, prefix)));
  writeFileSync(path.join(directory, 'synthetic.db'), 'synthetic closed SQLite fixture', { mode: 0o600 });
  t.after(() => {
    const target = realpathSync(directory);
    assert.equal(path.dirname(target), root);
    assert.ok(path.basename(target).startsWith(prefix));
    rmSync(target, { recursive: true, force: true });
  });
  return { root, directory };
}
const evidence = {
  mode: 'paystack-test-mode', status: 'pending', stage: 'refund',
  chargeReference: 'lms-pay-synthetic-reference', refundReference: 'lms-refund-synthetic',
  sourceRevision: 'a'.repeat(40), scriptSha256: 'b'.repeat(64), currency: 'ZAR', amount: 1000,
};

test('real-mode outcome records preserve the ledger and exclude credentials', t => {
  for (const status of ['passed', 'pending', 'failed']) {
    const { root, directory } = fixture(t);
    const before = readFileSync(path.join(directory, 'synthetic.db'));
    const retained = retainPaystackAcceptanceEvidence(root, directory, {
      ...evidence, status, secretKey: 'MUST_NOT_BE_WRITTEN', jwtSecret: 'NEVER_COPY_THIS',
    });
    const raw = readFileSync(retained.receipt, 'utf8');
    const record = JSON.parse(raw);
    assert.equal(record.status, status);
    assert.equal(record.chargeReference, evidence.chargeReference);
    assert.equal(record.refundReference, evidence.refundReference);
    assert.equal(record.databaseSha256.length, 64);
    assert.equal(raw.includes('MUST_NOT_BE_WRITTEN'), false);
    assert.equal(raw.includes('NEVER_COPY_THIS'), false);
    assert.deepEqual(readFileSync(path.join(directory, 'synthetic.db')), before);
    if (process.platform !== 'win32') assert.equal(statSync(retained.receipt).mode & 0o777, 0o600);
  }
});

test('an existing reconciliation receipt cannot be overwritten', t => {
  const { root, directory } = fixture(t);
  const retained = retainPaystackAcceptanceEvidence(root, directory, evidence);
  const before = readFileSync(retained.receipt);
  assert.throws(() => retainPaystackAcceptanceEvidence(root, directory, { ...evidence, status: 'passed' }), /EEXIST/);
  assert.deepEqual(readFileSync(retained.receipt), before);
});

test('unowned fixture paths and live-mode labels are refused without deleting data', t => {
  const wrong = fixture(t, 'other-lms-test-');
  assert.throws(() => retainPaystackAcceptanceEvidence(wrong.root, wrong.directory, evidence), /UNEXPECTED_ACCEPTANCE_DIRECTORY/);
  const { root, directory } = fixture(t);
  assert.throws(() => retainPaystackAcceptanceEvidence(root, directory, { ...evidence, mode: 'live' }), /INVALID_ACCEPTANCE_STATE/);
  assert.equal(readFileSync(path.join(directory, 'synthetic.db'), 'utf8'), 'synthetic closed SQLite fixture');
});

test('key-like charge references and invalid payment terms are refused', t => {
  const { root, directory } = fixture(t);
  assert.throws(() => retainPaystackAcceptanceEvidence(root, directory, { ...evidence, chargeReference: 'sk_test_credential' }), /INVALID_TEST_CHARGE_REFERENCE/);
  assert.throws(() => retainPaystackAcceptanceEvidence(root, directory, { ...evidence, refundReference: 'sk_test_credential' }), /INVALID_TEST_REFUND_REFERENCE/);
  assert.throws(() => retainPaystackAcceptanceEvidence(root, directory, { ...evidence, scriptSha256: 'sk_test_credential' }), /INVALID_ACCEPTANCE_PROVENANCE/);
  assert.throws(() => retainPaystackAcceptanceEvidence(root, directory, { ...evidence, amount: 0 }), /INVALID_TEST_PAYMENT_TERMS/);
});
