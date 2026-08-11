/**
 * bulk-export.test.ts — Phase 25 C5
 *
 * BULK-BE-1: POST /credentials/bulk-export with valid credentialIds returns ZIP
 * BULK-BE-2: POST /credentials/bulk-export with > 100 IDs returns 400
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

let studentId: string;
let studentToken: string;
let courseId: string;
let credentialId: string;

function seedBulkExportData() {
  studentId = uuidv4();
  courseId = uuidv4();
  credentialId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Bulk Student', ?, ?, 'student')`,
  ).run(studentId, `bulk-${studentId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Bulk Course', 'Test', 'BLK-101', '[]')`,
  ).run(courseId);

  db.prepare(
    `INSERT INTO nft_credentials (id, user_id, course_id, wallet_address, tx_hash, contract_id, network, mint_status, is_superseded)
     VALUES (?, ?, ?, 'GABCD1234', 'tx123', 'CONTRACT1', 'public', 'minted', 0)`,
  ).run(credentialId, studentId, courseId);

  studentToken = makeToken({ userId: studentId, email: `bulk-${studentId}@test.com`, role: 'student' });
}

beforeEach(() => {
  seedBulkExportData();
});

describe('POST /api/v1/credentials/bulk-export (Phase 25 C5)', () => {
  it('BULK-BE-1: returns ZIP with valid credentialIds', async () => {
    const res = await request(app)
      .post('/api/v1/credentials/bulk-export')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ credentialIds: [credentialId] })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('certificates-');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('BULK-BE-2: returns 400 when > 100 credentialIds', async () => {
    const ids = Array.from({ length: 101 }, () => uuidv4());
    const res = await request(app)
      .post('/api/v1/credentials/bulk-export')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ credentialIds: ids })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('100');
  });
});
