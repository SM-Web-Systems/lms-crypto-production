/**
 * UX-018 migration: decline_reason and declined_by_user_id on rewards.
 * Additive, idempotent, and safe on an existing database (no row or value lost).
 */
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ensureRewardDeclineColumns } from '../config/rewardDeclineMigration.js';

const newColumns = /\s*decline_reason\s+TEXT,\r?\n\s*declined_by_user_id\s+TEXT,/;
const schema = readFileSync(path.resolve('database/schema.sql'), 'utf8');
const preUpgradeSchema = schema.replace(newColumns, '');

function seed(db: Database.Database) {
  db.exec(`INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Sam', 'sam@example.invalid', 'h');
    INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, description, status, idempotency_key)
    VALUES ('r1', 'u1', 'teacher_class', 'g1', 'custom', 1000000, 'Keep me', 'draft', 'k1');`);
}
const rows = (db: Database.Database) => db.prepare('SELECT id, description, status, decline_reason, declined_by_user_id FROM rewards').all();

describe('ensureRewardDeclineColumns', () => {
  it('the fixture really is the pre-upgrade schema', () => {
    expect(preUpgradeSchema).not.toBe(schema);
    const ddl = preUpgradeSchema.match(/CREATE TABLE IF NOT EXISTS rewards \([\s\S]*?\n\);/)![0];
    expect(ddl).not.toMatch(/decline_reason|declined_by_user_id/);
  });

  it('adds the columns, keeps every row, and is idempotent', () => {
    const db = new Database(':memory:');
    db.exec(preUpgradeSchema); seed(db);
    ensureRewardDeclineColumns(db);
    ensureRewardDeclineColumns(db);
    expect(rows(db)).toEqual([{ id: 'r1', description: 'Keep me', status: 'draft', decline_reason: null, declined_by_user_id: null }]);
    db.close();
  });

  it('is a no-op on the current schema', () => {
    const db = new Database(':memory:');
    db.exec(schema); seed(db);
    const before = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'rewards'").get();
    ensureRewardDeclineColumns(db);
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'rewards'").get()).toEqual(before);
    db.close();
  });
});
