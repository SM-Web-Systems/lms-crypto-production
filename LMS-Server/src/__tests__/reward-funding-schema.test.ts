import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { validateDatabase } from '../config/databaseBootstrap.js';
import { rewardFundingSchema } from '../config/rewardFundingSchema.js';

const canonical = fs.readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8');
function database(sql = canonical) {
  const target = new Database(':memory:');
  target.pragma('foreign_keys = ON');
  target.exec(sql);
  return target;
}

describe('funding schema additive upgrade contract', () => {
  it('accepts the canonical funding schema and requires it after migration', () => {
    const target = database();
    try {
      expect(() => validateDatabase(target)).not.toThrow();
      target.exec('DROP TABLE reward_stellar_funding_evidence; DROP TABLE reward_stellar_funding_bindings; DROP TABLE reward_funding_evidence; DROP TABLE reward_funding_intents');
      expect(() => validateDatabase(target)).not.toThrow();
      expect(() => validateDatabase(target, true)).toThrow(/funding schema/);
      target.exec(rewardFundingSchema);
      expect(() => validateDatabase(target)).not.toThrow();
      expect(target.prepare('SELECT COUNT(*) AS n FROM reward_funding_evidence').get()).toEqual({n: 0});
    } finally { target.close(); }
  });

  it('refuses weakened integer/amount constraints before any startup writes', () => {
    const weakened = canonical.replace("typeof(amount_stroops) = 'integer' AND amount_stroops > 0 AND amount_stroops <= 9007199254740991", 'amount_stroops > 0');
    expect(weakened).not.toBe(canonical);
    const target = database(weakened);
    try { expect(() => validateDatabase(target)).toThrow(/changed funding schema/); }
    finally { target.close(); }
  });

  it('refuses a partial pre-existing funding table instead of silently recreating it', () => {
    const target = database();
    try {
      target.exec('DROP TABLE reward_stellar_funding_evidence; DROP TABLE reward_stellar_funding_bindings; DROP TABLE reward_funding_evidence; DROP TABLE reward_funding_intents; CREATE TABLE reward_funding_intents(id TEXT PRIMARY KEY)');
      expect(() => validateDatabase(target)).toThrow(/changed funding schema/);
      target.exec(rewardFundingSchema);
      expect(() => validateDatabase(target, true)).toThrow(/changed funding schema/);
    } finally { target.close(); }
  });
});
