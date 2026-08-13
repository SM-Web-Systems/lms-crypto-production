import { describe, it, expect } from 'vitest';
import { db } from '../config/database.js';

describe('Reward Schema', () => {
  it('R-SCHEMA-1: rewards table has 13-state CHECK constraint', () => {
    const id = 'test-reward-schema-1';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${id}', 'Test', '${id}@test.com', 'hash', 'admin')`);
    // Valid state
    expect(() => {
      db.prepare(
        `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key, status)
         VALUES (?, ?, 'sponsor_cohort', 'scope1', 'custom', 100, 'idem-s1', 'draft')`
      ).run(id, id);
    }).not.toThrow();

    // Invalid state
    expect(() => {
      db.prepare(
        `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key, status)
         VALUES (?, ?, 'sponsor_cohort', 'scope2', 'custom', 100, 'idem-s1b', 'invalid_state')`
      ).run(`${id}-bad`, id);
    }).toThrow();
  });

  it('R-SCHEMA-2: reward_accounts created with funder/recipient/platform types', () => {
    const uid = 'test-ra-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);

    for (const type of ['funder', 'recipient', 'platform']) {
      expect(() => {
        db.prepare(
          `INSERT INTO reward_accounts (id, user_id, account_type) VALUES (?, ?, ?)`
        ).run(`ra-${type}`, uid, type);
      }).not.toThrow();
    }

    // Invalid type
    expect(() => {
      db.prepare(
        `INSERT INTO reward_accounts (id, user_id, account_type) VALUES (?, ?, 'invalid')`
      ).run('ra-bad', uid);
    }).toThrow();
  });

  it('R-SCHEMA-3: reward_transactions has CHECK constraints', () => {
    const uid = 'test-txn-user';
    const rid = 'test-txn-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-txn1')`);

    // system actor with user_id should fail
    expect(() => {
      db.prepare(
        `INSERT INTO reward_transactions (id, reward_id, source_account_type, destination_account_type, destination_bucket,
         actor_type, actor_user_id, transaction_type, amount_stroops, previous_state, new_state, idempotency_key,
         funding_source_type, source_user_id, destination_user_id)
         VALUES (?, ?, 'external', 'funder', 'available', 'system', ?, 'fund', 100, 'draft', 'funded', 'idem-txn-bad', 'stellar', NULL, ?)`
      ).run('txn-bad', rid, uid, uid);
    }).toThrow();
  });

  it('R-SCHEMA-4: reward_allocations UNIQUE(reward_id, student_user_id)', () => {
    const uid = 'test-alloc-user';
    const rid = 'test-alloc-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-alloc1')`);

    db.prepare(
      `INSERT INTO reward_allocations (id, reward_id, student_user_id, amount_stroops, idempotency_key) VALUES (?, ?, ?, 100, ?)`
    ).run('alloc1', rid, uid, 'idem-a1');

    expect(() => {
      db.prepare(
        `INSERT INTO reward_allocations (id, reward_id, student_user_id, amount_stroops, idempotency_key) VALUES (?, ?, ?, 100, ?)`
      ).run('alloc2', rid, uid, 'idem-a2');
    }).toThrow(); // UNIQUE violation
  });

  it('R-SCHEMA-5: reward_eligibility_events composite unique', () => {
    const uid = 'test-elig-user';
    const rid = 'test-elig-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-elig1')`);

    db.prepare(
      `INSERT INTO reward_eligibility_events (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key) VALUES (?, ?, 'course_completion', 'src1', ?, 'eligible', ?)`
    ).run('elig1', rid, uid, 'idem-e1');

    expect(() => {
      db.prepare(
        `INSERT INTO reward_eligibility_events (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key) VALUES (?, ?, 'course_completion', 'src1', ?, 'eligible', ?)`
      ).run('elig2', rid, uid, 'idem-e2');
    }).toThrow(); // composite UNIQUE violation
  });

  it('R-SCHEMA-6: reward_audience_snapshots table exists', () => {
    const uid = 'test-snap-user';
    const rid = 'test-snap-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-snap1')`);

    expect(() => {
      db.prepare(
        `INSERT INTO reward_audience_snapshots (id, reward_id, student_user_id) VALUES (?, ?, ?)`
      ).run('snap1', rid, uid);
    }).not.toThrow();
  });

  it('R-SCHEMA-7: invalid enum values rejected', () => {
    const uid = 'test-enum-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);

    // Invalid scope_type
    expect(() => {
      db.prepare(
        `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key)
         VALUES (?, ?, 'invalid_scope', 's1', 'custom', 100, 'idem-enum1')`
      ).run('r-enum1', uid);
    }).toThrow();

    // Invalid reward_type
    expect(() => {
      db.prepare(
        `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key)
         VALUES (?, ?, 'sponsor_cohort', 's1', 'invalid_type', 100, 'idem-enum2')`
      ).run('r-enum2', uid);
    }).toThrow();
  });

  it('R-SCHEMA-8: ON DELETE RESTRICT prevents cascade deletion', () => {
    const uid = 'test-del-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.prepare(
      `INSERT INTO reward_accounts (id, user_id, account_type) VALUES (?, ?, 'funder')`
    ).run('ra-del', uid);

    // Deleting user with reward account should fail
    expect(() => {
      db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    }).toThrow();
  });

  it('R-SCHEMA-9: XLM-only currency enforced', () => {
    const uid = 'test-curr-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);

    expect(() => {
      db.prepare(
        `INSERT INTO reward_accounts (id, user_id, account_type, currency_code) VALUES (?, ?, 'funder', 'USD')`
      ).run('ra-usd', uid);
    }).toThrow();
  });

  it('R-SCHEMA-10: reward_event_outbox created with composite unique', () => {
    const uid = 'test-outbox-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);

    db.prepare(
      `INSERT INTO reward_event_outbox (id, event_type, event_source_id, student_user_id) VALUES (?, 'course_completion', 'src1', ?)`
    ).run('outbox1', uid);

    // Duplicate (event_type, event_source_id, student_user_id) should fail
    expect(() => {
      db.prepare(
        `INSERT INTO reward_event_outbox (id, event_type, event_source_id, student_user_id) VALUES (?, 'course_completion', 'src1', ?)`
      ).run('outbox2', uid);
    }).toThrow();
  });

  it('R-SCHEMA-11: reward_refund_attempts created with RESTRICT FKs', () => {
    const uid = 'test-rra-user';
    const rid = 'test-rra-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-rra1')`);
    db.prepare(
      `INSERT INTO reward_allocations (id, reward_id, student_user_id, amount_stroops, idempotency_key) VALUES (?, ?, ?, 100, ?)`
    ).run('alloc-rra', rid, uid, 'idem-rra-a');

    expect(() => {
      db.prepare(
        `INSERT INTO reward_refund_attempts (id, reward_id, allocation_id, attempted_by_user_id, attempted_amount_stroops, recipient_available_stroops)
         VALUES (?, ?, ?, ?, 100, 50)`
      ).run('rra1', rid, 'alloc-rra', uid);
    }).not.toThrow();
  });
});
