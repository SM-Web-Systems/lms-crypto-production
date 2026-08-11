/**
 * og-pages.test.ts — Phase 25 C2
 *
 * OG-BE-1: GET /verify/:id returns HTML with og:title containing course name
 * OG-BE-2: GET /verify/:id returns HTML with og:title containing student name
 * OG-BE-3: GET /verify/:id returns text/html content-type
 * OG-BE-4: GET /verify/nonexistent returns 404
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';

const WALLET = 'GBOHFMJWVGMYTWWBKRTDAZZ2MYXGKOVZWEW3JFPVJ4EK3CYG7BADGE01';

let userId: string;
let courseId: string;
let credentialId: string;

function seedOgData() {
  userId = uuidv4();
  courseId = uuidv4();
  credentialId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Alice Test', ?, 'hash', 'student')`,
  ).run(userId, `og-test-${userId}@test.com`);

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Blockchain Fundamentals', 'Test course', 'BLK-101', '[]')`,
  ).run(courseId);

  db.prepare(
    `INSERT INTO nft_credentials
       (id, user_id, wallet_address, mint_status, tx_hash, contract_id, network, course_id, soroban_token_id, is_superseded)
     VALUES (?, ?, ?, 'minted', 'ogtxhash123', 'CDPKSOOE4UZF', 'public', ?, 99, 0)`,
  ).run(credentialId, userId, WALLET, courseId);
}

beforeEach(() => {
  seedOgData();
});

describe('GET /verify/:credentialId (OG pages)', () => {
  it('OG-BE-1: returns HTML with og:title containing course name', async () => {
    const res = await request(app)
      .get(`/verify/${credentialId}`)
      .expect(200);

    expect(res.text).toContain('og:title');
    expect(res.text).toContain('Blockchain Fundamentals');
  });

  it('OG-BE-2: returns HTML with og:title containing student name', async () => {
    const res = await request(app)
      .get(`/verify/${credentialId}`)
      .expect(200);

    expect(res.text).toContain('Alice Test');
  });

  it('OG-BE-3: returns text/html content-type', async () => {
    const res = await request(app)
      .get(`/verify/${credentialId}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
  });

  it('OG-BE-4: returns 404 for non-existent credential', async () => {
    await request(app)
      .get(`/verify/${uuidv4()}`)
      .expect(404);
  });
});
