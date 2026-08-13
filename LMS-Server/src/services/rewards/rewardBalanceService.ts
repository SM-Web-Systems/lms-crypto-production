import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import type { RewardAccountRow, AccountType } from './rewardTypes.js';

export function getOrCreateAccount(
  userId: string,
  accountType: AccountType,
  currency: string = 'XLM'
): RewardAccountRow {
  const existing = db.prepare(
    'SELECT * FROM reward_accounts WHERE user_id = ? AND account_type = ? AND currency_code = ?'
  ).get(userId, accountType, currency) as RewardAccountRow | undefined;

  if (existing) return existing;

  const id = uuidv4();
  db.prepare(
    'INSERT INTO reward_accounts (id, user_id, account_type, currency_code) VALUES (?, ?, ?, ?)'
  ).run(id, userId, accountType, currency);

  return db.prepare('SELECT * FROM reward_accounts WHERE id = ?').get(id) as RewardAccountRow;
}

export function getAccount(
  userId: string,
  accountType: AccountType,
  currency: string = 'XLM'
): RewardAccountRow | null {
  const row = db.prepare(
    'SELECT * FROM reward_accounts WHERE user_id = ? AND account_type = ? AND currency_code = ?'
  ).get(userId, accountType, currency) as RewardAccountRow | undefined;
  return row ?? null;
}

export function creditAvailable(accountId: string, amount: number): void {
  const result = db.prepare(
    "UPDATE reward_accounts SET available_stroops = available_stroops + ?, updated_at = datetime('now') WHERE id = ?"
  ).run(amount, accountId);
  if (result.changes === 0) throw new Error(`Account ${accountId} not found`);
}

export function debitAvailable(accountId: string, amount: number): void {
  const result = db.prepare(
    "UPDATE reward_accounts SET available_stroops = available_stroops - ?, updated_at = datetime('now') WHERE id = ? AND available_stroops >= ?"
  ).run(amount, accountId, amount);
  if (result.changes === 0) throw new Error(`Insufficient available balance or account ${accountId} not found`);
}

export function creditReserved(accountId: string, amount: number): void {
  const result = db.prepare(
    "UPDATE reward_accounts SET reserved_stroops = reserved_stroops + ?, updated_at = datetime('now') WHERE id = ?"
  ).run(amount, accountId);
  if (result.changes === 0) throw new Error(`Account ${accountId} not found`);
}

export function debitReserved(accountId: string, amount: number): void {
  const result = db.prepare(
    "UPDATE reward_accounts SET reserved_stroops = reserved_stroops - ?, updated_at = datetime('now') WHERE id = ? AND reserved_stroops >= ?"
  ).run(amount, accountId, amount);
  if (result.changes === 0) throw new Error(`Insufficient reserved balance or account ${accountId} not found`);
}

export function getAccountById(accountId: string): RewardAccountRow | null {
  const row = db.prepare('SELECT * FROM reward_accounts WHERE id = ?').get(accountId) as RewardAccountRow | undefined;
  return row ?? null;
}
