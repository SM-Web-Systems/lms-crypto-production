/**
 * mintService.test.ts
 *
 * Tests for NFT credential minting logic.
 * All tests run without real Soroban RPC calls — the mint service is a no-op
 * when NFT_MINTER_SECRET or NFT_CONTRACT_ID are absent.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../config/database.js';
import { queryOne } from '../config/database.js';
import { isTriggerQuiz, mintCredentialForQuiz } from '../services/mintService.js';
import { v4 as uuidv4 } from 'uuid';

// ── Helpers ─────────────────────────────────────────────────────────────────

function seedUserAndQuiz() {
  const userId = uuidv4();
  const quizId = uuidv4();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
     VALUES (?, 'Test User', ?, 'hash', 'student', 'GWALLET123', 'linked')`
  ).run(userId, `user-${userId}@test.com`);
  db.prepare(
    `INSERT INTO quizzes (id, title, passing_score, questions)
     VALUES (?, 'Test Quiz', 70, '[]')`
  ).run(quizId);
  return { userId, quizId };
}

// ── isTriggerQuiz ────────────────────────────────────────────────────────────

describe('isTriggerQuiz', () => {
  afterEach(() => {
    delete process.env.NFT_TRIGGER_QUIZ_IDS;
  });

  it('returns false when NFT_TRIGGER_QUIZ_IDS is not set', () => {
    expect(isTriggerQuiz('any-quiz-id')).toBe(false);
  });

  it('returns false when NFT_TRIGGER_QUIZ_IDS is empty string', () => {
    process.env.NFT_TRIGGER_QUIZ_IDS = '';
    expect(isTriggerQuiz('any-quiz-id')).toBe(false);
  });

  it('returns true when quiz ID is in the list', () => {
    process.env.NFT_TRIGGER_QUIZ_IDS = 'quiz-a,quiz-b,quiz-c';
    expect(isTriggerQuiz('quiz-b')).toBe(true);
  });

  it('returns false when quiz ID is not in the list', () => {
    process.env.NFT_TRIGGER_QUIZ_IDS = 'quiz-a,quiz-b';
    expect(isTriggerQuiz('quiz-x')).toBe(false);
  });

  it('trims whitespace around quiz IDs', () => {
    process.env.NFT_TRIGGER_QUIZ_IDS = ' quiz-a , quiz-b ';
    expect(isTriggerQuiz('quiz-a')).toBe(true);
  });

  it('handles single quiz ID with no commas', () => {
    process.env.NFT_TRIGGER_QUIZ_IDS = 'only-quiz';
    expect(isTriggerQuiz('only-quiz')).toBe(true);
    expect(isTriggerQuiz('other-quiz')).toBe(false);
  });
});

// ── mintCredentialForQuiz no-op behaviour ────────────────────────────────────

describe('mintCredentialForQuiz — unconfigured (no-op)', () => {
  beforeEach(() => {
    delete process.env.NFT_MINTER_SECRET;
    delete process.env.NFT_CONTRACT_ID;
  });

  afterEach(() => {
    delete process.env.NFT_MINTER_SECRET;
    delete process.env.NFT_CONTRACT_ID;
  });

  it('returns without creating any DB row when both vars are absent', async () => {
    const { userId, quizId } = seedUserAndQuiz();
    await mintCredentialForQuiz({ userId, quizId, walletAddress: 'GWALLET123' });
    const row = queryOne('SELECT * FROM nft_credentials WHERE user_id = ?', [userId]);
    expect(row).toBeNull();
  });

  it('returns without creating any DB row when only CONTRACT_ID is set', async () => {
    process.env.NFT_CONTRACT_ID = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';
    const { userId, quizId } = seedUserAndQuiz();
    await mintCredentialForQuiz({ userId, quizId, walletAddress: 'GWALLET123' });
    const row = queryOne('SELECT * FROM nft_credentials WHERE user_id = ?', [userId]);
    expect(row).toBeNull();
  });

  it('returns without creating any DB row when only MINTER_SECRET is set', async () => {
    process.env.NFT_MINTER_SECRET = 'S_FAKE_SECRET_FOR_TEST_ONLY';
    const { userId, quizId } = seedUserAndQuiz();
    await mintCredentialForQuiz({ userId, quizId, walletAddress: 'GWALLET123' });
    const row = queryOne('SELECT * FROM nft_credentials WHERE user_id = ?', [userId]);
    expect(row).toBeNull();
  });
});

// ── nft_credentials schema ───────────────────────────────────────────────────

describe('nft_credentials table schema', () => {
  it('table exists in test DB', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nft_credentials'")
      .get();
    expect(row).not.toBeNull();
  });

  it('can insert a pending credential row directly', () => {
    const { userId, quizId } = seedUserAndQuiz();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'GWALLET123', 'pending', 'CCONTRACT123', 'public')`
    ).run(id, userId, quizId);

    const row = queryOne<{
      id: string;
      mint_status: string;
      tx_hash: string | null;
      contract_id: string;
    }>('SELECT * FROM nft_credentials WHERE id = ?', [id]);

    expect(row).not.toBeNull();
    expect(row!.mint_status).toBe('pending');
    expect(row!.tx_hash).toBeNull();
    expect(row!.contract_id).toBe('CCONTRACT123');
  });

  it('enforces UNIQUE (user_id, quiz_id)', () => {
    const { userId, quizId } = seedUserAndQuiz();
    const insert = () =>
      db.prepare(
        `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network)
         VALUES (?, ?, ?, 'GWALLET123', 'pending', 'CCONTRACT123', 'public')`
      ).run(uuidv4(), userId, quizId);

    insert(); // first — succeeds
    expect(() => insert()).toThrow(); // second — UNIQUE violation
  });

  it('enforces mint_status CHECK constraint', () => {
    const { userId, quizId } = seedUserAndQuiz();
    expect(() =>
      db.prepare(
        `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network)
         VALUES (?, ?, ?, 'GWALLET123', 'invalid_status', 'CCONTRACT123', 'public')`
      ).run(uuidv4(), userId, quizId)
    ).toThrow();
  });

  it('can update mint_status to minted with tx_hash', () => {
    const { userId, quizId } = seedUserAndQuiz();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'GWALLET123', 'pending', 'CCONTRACT123', 'public')`
    ).run(id, userId, quizId);

    db.prepare(
      `UPDATE nft_credentials SET mint_status = 'minted', tx_hash = 'abc123hash', updated_at = datetime('now')
       WHERE id = ?`
    ).run(id);

    const row = queryOne<{ mint_status: string; tx_hash: string | null }>(
      'SELECT mint_status, tx_hash FROM nft_credentials WHERE id = ?',
      [id]
    );
    expect(row!.mint_status).toBe('minted');
    expect(row!.tx_hash).toBe('abc123hash');
  });

  it('can update mint_status to failed with error message', () => {
    const { userId, quizId } = seedUserAndQuiz();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'GWALLET123', 'pending', 'CCONTRACT123', 'public')`
    ).run(id, userId, quizId);

    db.prepare(
      `UPDATE nft_credentials SET mint_status = 'failed', error = 'Simulation failed: contract not found'
       WHERE id = ?`
    ).run(id);

    const row = queryOne<{ mint_status: string; error: string | null }>(
      'SELECT mint_status, error FROM nft_credentials WHERE id = ?',
      [id]
    );
    expect(row!.mint_status).toBe('failed');
    expect(row!.error).toContain('Simulation failed');
  });

  it('cascades delete when user is deleted', () => {
    const { userId, quizId } = seedUserAndQuiz();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'GWALLET123', 'pending', 'CCONTRACT123', 'public')`
    ).run(id, userId, quizId);

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    const row = queryOne('SELECT * FROM nft_credentials WHERE id = ?', [id]);
    expect(row).toBeNull();
  });
});
