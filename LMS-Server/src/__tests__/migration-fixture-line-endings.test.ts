import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyUpgrade, detectSchemaVersion, planUpgrade } from '../scripts/migrateRewardTxnCheck.js';
import { fixtureSqlForDatabase, loadPreR3Fixture, mutateSqlFixture, readSqlFixture } from './helpers/sqlFixture.js';

const databaseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database');
const source = readSqlFixture(path.join(databaseDirectory, 'schema-v117-fixture.sql'));
const target = readSqlFixture(path.join(databaseDirectory, 'schema.sql'));

describe.each(['lf', 'crlf'])('migration fixtures with %s input', style => {
  it('reads the same fixture independently of the checkout newline style', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-newlines-'));
    try {
      const file = path.join(dir, 'fixture.sql');
      const bytes = fixtureSqlForDatabase(source, style);
      fs.writeFileSync(file, bytes);
      expect(fs.readFileSync(file, 'utf-8')).toContain(style === 'crlf' ? '\r\n' : '\n');
      expect(readSqlFixture(file)).toBe(source);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('constructs the pre-R3 database with the unique reference index genuinely absent', () => {
    const db = new Database(':memory:');
    try {
      loadPreR3Fixture(db, target, style);
      expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='idx_reward_txn_fund_ref_unique'").get()).toBeUndefined();
      expect((db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('reward_transactions')").get() as { n: number }).n).toBeGreaterThan(0);
    } finally { db.close(); }
  });

  it('plans and applies the real CHECK migration after SQLite parses the chosen newline style', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-newlines-'));
    const file = path.join(dir, 'fixture.db');
    try {
      const db = new Database(file);
      try {
        db.exec(fixtureSqlForDatabase(source, style));
        expect(db.prepare("SELECT sql FROM sqlite_master WHERE name='reward_transactions'").get()).toMatchObject({
          sql: expect.stringContaining(style === 'crlf' ? '\r\n' : '\n'),
        });
        expect(detectSchemaVersion(db)).toBe('source');
      } finally { db.close(); }
      const before = fs.readFileSync(file);
      expect(planUpgrade(file)).toBeDefined();
      expect(fs.readFileSync(file)).toEqual(before);
      expect(applyUpgrade(file).success).toBe(true);
      const upgraded = new Database(file, { readonly: true });
      try { expect(detectSchemaVersion(upgraded)).toBe('target'); } finally { upgraded.close(); }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('still refuses weakened DDL without changing the database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-newlines-'));
    const file = path.join(dir, 'fixture.db');
    try {
      const db = new Database(file);
      try {
        const weakened = mutateSqlFixture(fixtureSqlForDatabase(source, style),
          "CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire'))",
          "CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire') OR 1=1)");
        db.exec(fixtureSqlForDatabase(weakened, style));
        expect(detectSchemaVersion(db)).toBe('unknown');
      } finally { db.close(); }
      const before = fs.readFileSync(file);
      expect(() => applyUpgrade(file)).toThrow(/Unsupported schema/);
      expect(fs.readFileSync(file)).toEqual(before);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

it('refuses silent fixture mutation drift and unsupported newline modes', () => {
  expect(() => mutateSqlFixture(source, 'NOT_IN_THE_FIXTURE', '')).toThrow(/pattern not found/);
  expect(() => mutateSqlFixture(source, 'CREATE TABLE', 'CREATE TABLE')).toThrow(/did not change/);
  expect(() => fixtureSqlForDatabase(source, 'invalid')).toThrow(/Unsupported fixture/);
});
