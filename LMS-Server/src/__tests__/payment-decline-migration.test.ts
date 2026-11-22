/**
 * Cohort payment approval migration: decline_reason, declined_by and declined_at on payments.
 * Additive, idempotent, and safe on an existing database (no row or value lost).
 */
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ensurePaymentDeclineColumns } from '../config/paymentDeclineMigration.js';

const newColumns = /\s*decline_reason\s+TEXT,\r?\n\s*declined_by\s+TEXT,\r?\n\s*declined_at\s+TEXT,/;
const schema = readFileSync(path.resolve('database/schema.sql'), 'utf8');
const preUpgradeSchema = schema.replace(newColumns, '');

function seed(db: Database.Database) {
  db.exec(`INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Sam', 'sam@example.invalid', 'h');
    INSERT INTO courses (id, title, course_code) VALUES ('c1', 'Course', 'C1');
    INSERT INTO payments (id, user_id, course_id, amount_cents, currency, status, notes)
    VALUES ('p1', 'u1', 'c1', 5000, 'USD', 'pending', 'Keep me');`);
}
const rows = (db: Database.Database) => db.prepare('SELECT id, amount_cents, status, notes, decline_reason, declined_by, declined_at FROM payments').all();

describe('ensurePaymentDeclineColumns', () => {
  it('the fixture really is the pre-upgrade schema', () => {
    expect(preUpgradeSchema).not.toBe(schema);
    const ddl = preUpgradeSchema.match(/CREATE TABLE IF NOT EXISTS payments \([\s\S]*?\n\);/)![0];
    expect(ddl).not.toMatch(/decline_reason|declined_by|declined_at/);
  });

  it('adds the columns, keeps every row, and is idempotent', () => {
    const db = new Database(':memory:');
    db.exec(preUpgradeSchema); seed(db);
    ensurePaymentDeclineColumns(db);
    ensurePaymentDeclineColumns(db);
    expect(rows(db)).toEqual([{ id: 'p1', amount_cents: 5000, status: 'pending', notes: 'Keep me', decline_reason: null, declined_by: null, declined_at: null }]);
    db.close();
  });

  it('is a no-op on the current schema', () => {
    const db = new Database(':memory:');
    db.exec(schema); seed(db);
    const before = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'payments'").get();
    ensurePaymentDeclineColumns(db);
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'payments'").get()).toEqual(before);
    db.close();
  });
});
