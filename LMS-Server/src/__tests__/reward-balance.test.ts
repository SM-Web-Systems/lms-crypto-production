import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import {
  getOrCreateAccount,
  getAccount,
  creditAvailable,
  debitAvailable,
  creditReserved,
  debitReserved,
} from '../services/rewards/rewardBalanceService.js';

function createUser(role = 'student'): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, 'hash', ?)"
  ).run(id, `${id}@test.com`, role);
  return id;
}

describe('Reward Balance Service', () => {
  it('R-BAL-1: Create funder account, verify available = 0', () => {
    const userId = createUser('admin');
    const account = getOrCreateAccount(userId, 'funder');
    expect(account.available_stroops).toBe(0);
    expect(account.reserved_stroops).toBe(0);
    expect(account.account_type).toBe('funder');
    expect(account.currency_code).toBe('XLM');
  });

  it('R-BAL-2: Create recipient account, verify available = 0', () => {
    const userId = createUser();
    const account = getOrCreateAccount(userId, 'recipient');
    expect(account.available_stroops).toBe(0);
    expect(account.reserved_stroops).toBe(0);
    expect(account.account_type).toBe('recipient');
  });

  it('R-BAL-3: Funder + recipient are distinct accounts', () => {
    const userId = createUser('admin');
    const funder = getOrCreateAccount(userId, 'funder');
    const recipient = getOrCreateAccount(userId, 'recipient');
    expect(funder.id).not.toBe(recipient.id);
    expect(funder.account_type).toBe('funder');
    expect(recipient.account_type).toBe('recipient');
  });

  it('R-BAL-4: UNIQUE(user_id, account_type, currency_code) enforced — getOrCreate is idempotent', () => {
    const userId = createUser('admin');
    const first = getOrCreateAccount(userId, 'funder');
    const second = getOrCreateAccount(userId, 'funder');
    expect(first.id).toBe(second.id);
  });

  it('R-BAL-5: available_stroops >= 0 enforced', () => {
    const userId = createUser();
    const account = getOrCreateAccount(userId, 'recipient');
    // Debit more than available should throw
    expect(() => debitAvailable(account.id, 1)).toThrow();
  });

  it('R-BAL-6: reserved_stroops >= 0 enforced', () => {
    const userId = createUser('admin');
    const account = getOrCreateAccount(userId, 'funder');
    // Debit reserved more than available should throw
    expect(() => debitReserved(account.id, 1)).toThrow();
  });

  it('R-BAL-7: creditAvailable and debitAvailable work correctly', () => {
    const userId = createUser('admin');
    const account = getOrCreateAccount(userId, 'funder');
    creditAvailable(account.id, 10_000_000);
    const updated = getAccount(userId, 'funder');
    expect(updated!.available_stroops).toBe(10_000_000);

    debitAvailable(account.id, 3_000_000);
    const after = getAccount(userId, 'funder');
    expect(after!.available_stroops).toBe(7_000_000);
  });

  it('R-BAL-8: creditReserved and debitReserved work correctly', () => {
    const userId = createUser('admin');
    const account = getOrCreateAccount(userId, 'funder');
    creditReserved(account.id, 5_000_000);
    const updated = getAccount(userId, 'funder');
    expect(updated!.reserved_stroops).toBe(5_000_000);

    debitReserved(account.id, 2_000_000);
    const after = getAccount(userId, 'funder');
    expect(after!.reserved_stroops).toBe(3_000_000);
  });

  it('R-BAL-9: getAccount returns null for nonexistent account', () => {
    const userId = createUser();
    const account = getAccount(userId, 'platform');
    expect(account).toBeNull();
  });

  it('R-BAL-10: getOrCreateAccount returns existing account without modification', () => {
    const userId = createUser('admin');
    const account = getOrCreateAccount(userId, 'funder');
    creditAvailable(account.id, 100);
    const same = getOrCreateAccount(userId, 'funder');
    expect(same.available_stroops).toBe(100);
  });
});
