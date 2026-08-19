/**
 * nft-metadata.test.ts — NFT metadata JSON endpoint
 *
 * META-1: Returns 404 for non-existent token ID
 * META-2: Returns 404 for failed (non-minted) credential
 * META-3: Returns 404 for superseded credential
 * META-4: Returns valid JSON metadata for minted credential
 * META-5: Returns correct attributes array
 * META-6: Handles null course gracefully (legacy quiz-triggered)
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';

function seedUser(): string {
  const id = uuidv4();
  db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, 'Meta Student', 'hash', 'student')`)
    .run(id, `meta-${id}@test.com`);
  return id;
}

function seedCourse(): string {
  const id = uuidv4();
  db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Blockchain Fundamentals', 'desc', 'BVC')`)
    .run(id);
  return id;
}

function seedQuiz(courseId: string): string {
  const id = uuidv4();
  db.prepare(`INSERT INTO quizzes (id, title, course_id, questions) VALUES (?, 'Final Exam', ?, '[]')`)
    .run(id, courseId);
  return id;
}

describe('GET /api/v1/nft/metadata/:tokenId', () => {
  it('META-1: returns 404 for non-existent token ID', async () => {
    const res = await request(app).get('/api/v1/nft/metadata/99999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Token not found');
  });

  it('META-2: returns 404 for failed credential', async () => {
    const userId = seedUser();
    const courseId = seedCourse();
    const quizId = seedQuiz(courseId);
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network, soroban_token_id, course_id)
       VALUES (?, ?, ?, 'GWALLET', 'failed', 'CTEST', 'testnet', 50000, ?)`
    ).run(uuidv4(), userId, quizId, courseId);

    const res = await request(app).get('/api/v1/nft/metadata/50000');
    expect(res.status).toBe(404);
  });

  it('META-3: returns 404 for superseded credential', async () => {
    const userId = seedUser();
    const courseId = seedCourse();
    const quizId = seedQuiz(courseId);
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network, soroban_token_id, course_id, is_superseded)
       VALUES (?, ?, ?, 'GWALLET', 'minted', 'CTEST', 'testnet', 50001, ?, 1)`
    ).run(uuidv4(), userId, quizId, courseId);

    const res = await request(app).get('/api/v1/nft/metadata/50001');
    expect(res.status).toBe(404);
  });

  it('META-4: returns valid JSON metadata for minted credential', async () => {
    const userId = seedUser();
    const courseId = seedCourse();
    const quizId = seedQuiz(courseId);
    const credId = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network, soroban_token_id, tx_hash, course_id)
       VALUES (?, ?, ?, 'GWALLET', 'minted', 'CCONTRACT', 'testnet', 50002, 'txhash123', ?)`
    ).run(credId, userId, quizId, courseId);

    const res = await request(app).get('/api/v1/nft/metadata/50002');
    expect(res.status).toBe(200);
    expect(res.body.name).toContain('Certificate #50002');
    expect(res.body.description).toContain('Meta Student');
    expect(res.body.description).toContain('Blockchain Fundamentals');
    expect(res.body.external_url).toContain(`/verify/${credId}`);
  });

  it('META-5: returns correct attributes array', async () => {
    const userId = seedUser();
    const courseId = seedCourse();
    const quizId = seedQuiz(courseId);
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network, soroban_token_id, tx_hash, course_id)
       VALUES (?, ?, ?, 'GWALLET', 'minted', 'CCONTRACT', 'testnet', 50005, 'txhash789', ?)`
    ).run(uuidv4(), userId, quizId, courseId);

    const res = await request(app).get('/api/v1/nft/metadata/50005');
    expect(res.status).toBe(200);
    const attrs = res.body.attributes;
    expect(attrs).toBeInstanceOf(Array);
    const courseAttr = attrs.find((a: { trait_type: string }) => a.trait_type === 'Course');
    expect(courseAttr?.value).toBe('Blockchain Fundamentals');
    const networkAttr = attrs.find((a: { trait_type: string }) => a.trait_type === 'Network');
    expect(networkAttr?.value).toBe('testnet');
  });

  it('META-6: handles null course gracefully (legacy quiz-triggered)', async () => {
    const userId = seedUser();
    const courseId = seedCourse();
    const quizId = seedQuiz(courseId);
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network, soroban_token_id, tx_hash)
       VALUES (?, ?, ?, 'GWALLET', 'minted', 'CCONTRACT', 'testnet', 50003, 'txhash456')`
    ).run(uuidv4(), userId, quizId);

    const res = await request(app).get('/api/v1/nft/metadata/50003');
    expect(res.status).toBe(200);
    expect(res.body.name).toContain('#50003');
  });
});
