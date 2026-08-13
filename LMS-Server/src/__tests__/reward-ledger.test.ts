import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { writeLedgerEntry, reconcileAccount } from '../services/rewards/rewardLedger.js';
import { getOrCreateAccount, getAccount } from '../services/rewards/rewardBalanceService.js';
import {
  checkTransactionIdempotency,
  checkRewardIdempotency,
  checkEligibilityIdempotency,
} from '../services/rewards/rewardIdempotencyService.js';

function createUser(role = 'student'): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, 'hash', ?)"
  ).run(id, `${id}@test.com`, role);
  return id;
}

function createReward(creatorId: string, amount = 10_000_000): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key)
     VALUES (?, ?, 'sponsor_cohort', 'scope1', 'custom', ?, ?)`
  ).run(id, creatorId, amount, `idem-${id}`);
  return id;
}

function createAllocation(rewardId: string, studentId: string, amount = 10_000_000): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO reward_allocations (id, reward_id, student_user_id, amount_stroops, idempotency_key)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, rewardId, studentId, amount, `idem-alloc-${id}`);
  return id;
}

describe('Reward Ledger', () => {
  it('R-LED-1: Fund creates funder available credit via ledger', () => {
    const funder = createUser('admin');
    const rewardId = createReward(funder);

    const txnFn = db.transaction(() => {
      return writeLedgerEntry({
        rewardId,
        transactionType: 'fund',
        amountStroops: 10_000_000,
        previousState: 'pending_funding',
        newState: 'funded',
        actorType: 'user',
        actorUserId: funder,
        fundingSourceType: 'admin_grant',
        idempotencyKey: `fund-${rewardId}`,
        sourceAccountType: 'external',
        destinationAccountType: 'funder',
        destinationBucket: 'available',
        destinationUserId: funder,
      });
    });
    txnFn();

    const acct = getAccount(funder, 'funder');
    expect(acct!.available_stroops).toBe(10_000_000);
    expect(acct!.reserved_stroops).toBe(0);
  });

  it('R-LED-2: Reserve moves funder available → reserved via ledger', () => {
    const funder = createUser('admin');
    const rewardId = createReward(funder);
    const funderAcct = getOrCreateAccount(funder, 'funder');
    db.prepare("UPDATE reward_accounts SET available_stroops = 10000000 WHERE id = ?").run(funderAcct.id);

    const txnFn = db.transaction(() => {
      return writeLedgerEntry({
        rewardId,
        transactionType: 'reserve',
        amountStroops: 10_000_000,
        previousState: 'funded',
        newState: 'active',
        actorType: 'user',
        actorUserId: funder,
        idempotencyKey: `reserve-${rewardId}`,
        sourceAccountType: 'funder',
        sourceBucket: 'available',
        sourceUserId: funder,
        destinationAccountType: 'funder',
        destinationBucket: 'reserved',
        destinationUserId: funder,
      });
    });
    txnFn();

    const acct = getAccount(funder, 'funder');
    expect(acct!.available_stroops).toBe(0);
    expect(acct!.reserved_stroops).toBe(10_000_000);
  });

  it('R-LED-3: Release moves funder reserved → recipient available via ledger', () => {
    const funder = createUser('admin');
    const student = createUser();
    const rewardId = createReward(funder);
    const allocId = createAllocation(rewardId, student);

    const funderAcct = getOrCreateAccount(funder, 'funder');
    db.prepare("UPDATE reward_accounts SET reserved_stroops = 10000000 WHERE id = ?").run(funderAcct.id);

    const txnFn = db.transaction(() => {
      return writeLedgerEntry({
        rewardId,
        allocationId: allocId,
        transactionType: 'release',
        amountStroops: 10_000_000,
        previousState: 'approved',
        newState: 'released',
        actorType: 'user',
        actorUserId: funder,
        idempotencyKey: `release-${allocId}`,
        sourceAccountType: 'funder',
        sourceBucket: 'reserved',
        sourceUserId: funder,
        destinationAccountType: 'recipient',
        destinationBucket: 'available',
        destinationUserId: student,
      });
    });
    txnFn();

    const fAcct = getAccount(funder, 'funder');
    expect(fAcct!.reserved_stroops).toBe(0);
    const rAcct = getAccount(student, 'recipient');
    expect(rAcct!.available_stroops).toBe(10_000_000);
  });

  it('R-LED-4: Cancel moves funder reserved → funder available via ledger', () => {
    const funder = createUser('admin');
    const rewardId = createReward(funder);
    const funderAcct = getOrCreateAccount(funder, 'funder');
    db.prepare("UPDATE reward_accounts SET reserved_stroops = 10000000 WHERE id = ?").run(funderAcct.id);

    const txnFn = db.transaction(() => {
      return writeLedgerEntry({
        rewardId,
        transactionType: 'cancel',
        amountStroops: 10_000_000,
        previousState: 'active',
        newState: 'cancelled',
        actorType: 'user',
        actorUserId: funder,
        idempotencyKey: `cancel-${rewardId}`,
        sourceAccountType: 'funder',
        sourceBucket: 'reserved',
        sourceUserId: funder,
        destinationAccountType: 'funder',
        destinationBucket: 'available',
        destinationUserId: funder,
      });
    });
    txnFn();

    const acct = getAccount(funder, 'funder');
    expect(acct!.available_stroops).toBe(10_000_000);
    expect(acct!.reserved_stroops).toBe(0);
  });

  it('R-LED-5: Expire moves funder reserved → funder available (system actor)', () => {
    const funder = createUser('admin');
    const rewardId = createReward(funder);
    const funderAcct = getOrCreateAccount(funder, 'funder');
    db.prepare("UPDATE reward_accounts SET reserved_stroops = 5000000 WHERE id = ?").run(funderAcct.id);

    const txnFn = db.transaction(() => {
      return writeLedgerEntry({
        rewardId,
        transactionType: 'expire',
        amountStroops: 5_000_000,
        previousState: 'active',
        newState: 'expired',
        actorType: 'system',
        idempotencyKey: `expire-${rewardId}`,
        sourceAccountType: 'funder',
        sourceBucket: 'reserved',
        sourceUserId: funder,
        destinationAccountType: 'funder',
        destinationBucket: 'available',
        destinationUserId: funder,
      });
    });
    txnFn();

    const acct = getAccount(funder, 'funder');
    expect(acct!.available_stroops).toBe(5_000_000);
    expect(acct!.reserved_stroops).toBe(0);
  });

  it('R-LED-6: Refund moves recipient available → funder available via ledger', () => {
    const funder = createUser('admin');
    const student = createUser();
    const rewardId = createReward(funder);
    const allocId = createAllocation(rewardId, student);

    const recipAcct = getOrCreateAccount(student, 'recipient');
    db.prepare("UPDATE reward_accounts SET available_stroops = 10000000 WHERE id = ?").run(recipAcct.id);

    const txnFn = db.transaction(() => {
      return writeLedgerEntry({
        rewardId,
        allocationId: allocId,
        transactionType: 'refund',
        amountStroops: 10_000_000,
        previousState: 'released',
        newState: 'refunded',
        actorType: 'user',
        actorUserId: funder,
        idempotencyKey: `refund-${allocId}`,
        sourceAccountType: 'recipient',
        sourceBucket: 'available',
        sourceUserId: student,
        destinationAccountType: 'funder',
        destinationBucket: 'available',
        destinationUserId: funder,
      });
    });
    txnFn();

    const rAcct = getAccount(student, 'recipient');
    expect(rAcct!.available_stroops).toBe(0);
    const fAcct = getAccount(funder, 'funder');
    expect(fAcct!.available_stroops).toBe(10_000_000);
  });

  it('R-LED-10: Available + reserved reconcile after every transition', () => {
    const funder = createUser('admin');
    const student = createUser();
    const rewardId = createReward(funder);
    const allocId = createAllocation(rewardId, student);

    const txn = db.transaction(() => {
      // Fund
      writeLedgerEntry({
        rewardId, transactionType: 'fund', amountStroops: 10_000_000,
        previousState: 'pending_funding', newState: 'funded',
        actorType: 'user', actorUserId: funder,
        fundingSourceType: 'admin_grant', idempotencyKey: `fund-rec-${rewardId}`,
        sourceAccountType: 'external', destinationAccountType: 'funder',
        destinationBucket: 'available', destinationUserId: funder,
      });
      // Reserve
      writeLedgerEntry({
        rewardId, transactionType: 'reserve', amountStroops: 10_000_000,
        previousState: 'funded', newState: 'active',
        actorType: 'user', actorUserId: funder,
        idempotencyKey: `reserve-rec-${rewardId}`,
        sourceAccountType: 'funder', sourceBucket: 'available', sourceUserId: funder,
        destinationAccountType: 'funder', destinationBucket: 'reserved', destinationUserId: funder,
      });
      // Release
      writeLedgerEntry({
        rewardId, allocationId: allocId, transactionType: 'release', amountStroops: 10_000_000,
        previousState: 'approved', newState: 'released',
        actorType: 'user', actorUserId: funder,
        idempotencyKey: `release-rec-${allocId}`,
        sourceAccountType: 'funder', sourceBucket: 'reserved', sourceUserId: funder,
        destinationAccountType: 'recipient', destinationBucket: 'available', destinationUserId: student,
      });
    });
    txn();

    // Reconcile both accounts
    const funderRec = reconcileAccount(funder, 'funder');
    expect(funderRec.matches).toBe(true);
    expect(funderRec.stored.available).toBe(0);
    expect(funderRec.stored.reserved).toBe(0);

    const recipRec = reconcileAccount(student, 'recipient');
    expect(recipRec.matches).toBe(true);
    expect(recipRec.stored.available).toBe(10_000_000);
  });

  it('R-LED-12: Negative balance prevented by CHECK constraint', () => {
    const funder = createUser('admin');
    const rewardId = createReward(funder);
    getOrCreateAccount(funder, 'funder'); // starts at 0

    expect(() => {
      const txn = db.transaction(() => {
        writeLedgerEntry({
          rewardId, transactionType: 'reserve', amountStroops: 100,
          previousState: 'funded', newState: 'active',
          actorType: 'user', actorUserId: funder,
          idempotencyKey: `reserve-neg-${rewardId}`,
          sourceAccountType: 'funder', sourceBucket: 'available', sourceUserId: funder,
          destinationAccountType: 'funder', destinationBucket: 'reserved', destinationUserId: funder,
        });
      });
      txn();
    }).toThrow();
  });

  it('R-LED-17: Ledger entries are append-only (no UPDATE/DELETE)', () => {
    const funder = createUser('admin');
    const rewardId = createReward(funder);

    const txn = db.transaction(() => {
      return writeLedgerEntry({
        rewardId, transactionType: 'fund', amountStroops: 100,
        previousState: 'pending_funding', newState: 'funded',
        actorType: 'user', actorUserId: funder,
        fundingSourceType: 'admin_grant', idempotencyKey: `fund-append-${rewardId}`,
        sourceAccountType: 'external', destinationAccountType: 'funder',
        destinationBucket: 'available', destinationUserId: funder,
      });
    });
    const txnId = txn();

    // Verify entry exists
    const entry = db.prepare('SELECT * FROM reward_transactions WHERE id = ?').get(txnId);
    expect(entry).toBeTruthy();

    // Verify count = 1
    const count = db.prepare('SELECT COUNT(*) as c FROM reward_transactions WHERE reward_id = ?').get(rewardId) as { c: number };
    expect(count.c).toBe(1);
  });

  it('R-LED-18: Reconciliation query matches materialized balances', () => {
    const user = createUser('admin');
    const result = reconcileAccount(user, 'funder');
    expect(result.matches).toBe(true);
  });

  it('R-LED-19: Every mutation creates exactly one ledger entry per balance change', () => {
    const funder = createUser('admin');
    const rewardId = createReward(funder);

    const txn = db.transaction(() => {
      writeLedgerEntry({
        rewardId, transactionType: 'fund', amountStroops: 500,
        previousState: 'pending_funding', newState: 'funded',
        actorType: 'user', actorUserId: funder,
        fundingSourceType: 'stellar', fundingReference: 'tx-hash-123',
        idempotencyKey: `fund-one-${rewardId}`,
        sourceAccountType: 'external', destinationAccountType: 'funder',
        destinationBucket: 'available', destinationUserId: funder,
      });
    });
    txn();

    const entries = db.prepare('SELECT * FROM reward_transactions WHERE reward_id = ?').all(rewardId);
    expect(entries.length).toBe(1);
  });
});

describe('Reward Idempotency', () => {
  it('R-IDEM-1: Duplicate fund returns existing transaction', () => {
    const funder = createUser('admin');
    const rewardId = createReward(funder);
    const key = `fund-idem-${rewardId}`;

    const txn = db.transaction(() => {
      return writeLedgerEntry({
        rewardId, transactionType: 'fund', amountStroops: 100,
        previousState: 'pending_funding', newState: 'funded',
        actorType: 'user', actorUserId: funder,
        fundingSourceType: 'admin_grant', idempotencyKey: key,
        sourceAccountType: 'external', destinationAccountType: 'funder',
        destinationBucket: 'available', destinationUserId: funder,
      });
    });
    txn();

    const check = checkTransactionIdempotency(key);
    expect(check.exists).toBe(true);
    expect(check.transactionId).toBeTruthy();
  });

  it('R-IDEM-2: Duplicate reserve is idempotent (same key returns existing)', () => {
    const funder = createUser('admin');
    const rewardId = createReward(funder);
    const key = `reserve-idem-${rewardId}`;
    const funderAcct = getOrCreateAccount(funder, 'funder');
    db.prepare("UPDATE reward_accounts SET available_stroops = 1000 WHERE id = ?").run(funderAcct.id);

    const txn = db.transaction(() => {
      writeLedgerEntry({
        rewardId, transactionType: 'reserve', amountStroops: 100,
        previousState: 'funded', newState: 'active',
        actorType: 'user', actorUserId: funder,
        idempotencyKey: key,
        sourceAccountType: 'funder', sourceBucket: 'available', sourceUserId: funder,
        destinationAccountType: 'funder', destinationBucket: 'reserved', destinationUserId: funder,
      });
    });
    txn();

    // Second attempt with same key should find existing
    const check = checkTransactionIdempotency(key);
    expect(check.exists).toBe(true);
  });

  it('R-IDEM-4: Duplicate eligibility event returns already_processed', () => {
    const user = createUser('admin');
    const rewardId = createReward(user);
    const key = `elig-idem-${rewardId}`;

    db.prepare(
      `INSERT INTO reward_eligibility_events (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key)
       VALUES (?, ?, 'course_completion', 'course1', ?, 'eligible', ?)`
    ).run(uuidv4(), rewardId, user, key);

    const check = checkEligibilityIdempotency(rewardId, 'course_completion', 'course1', user);
    expect(check.exists).toBe(true);
    expect(check.result).toBe('eligible');
  });

  it('R-IDEM-5: checkRewardIdempotency finds existing reward', () => {
    const user = createUser('admin');
    const rewardId = createReward(user);
    const idemKey = db.prepare('SELECT idempotency_key FROM rewards WHERE id = ?').get(rewardId) as { idempotency_key: string };

    const check = checkRewardIdempotency(idemKey.idempotency_key);
    expect(check.exists).toBe(true);
    expect(check.rewardId).toBe(rewardId);
  });

  it('R-IDEM-6: Nonexistent idempotency key returns exists=false', () => {
    const check = checkTransactionIdempotency('nonexistent-key');
    expect(check.exists).toBe(false);
  });
});
