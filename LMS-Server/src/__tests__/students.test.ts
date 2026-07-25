import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { seedTestData, type TestIds, LINKED_WALLET_ADDRESS } from './helpers/seed.js';
import { makeToken } from './helpers/auth.js';

let ids: TestIds;
let adminToken: string;
let studentToken: string;

beforeEach(() => {
  ids = seedTestData();
  adminToken = makeToken({ userId: ids.adminId, email: 'admin@test.com', role: 'admin' });
  studentToken = makeToken({ userId: ids.studentUserId, email: 'student@test.com', role: 'student', studentId: ids.studentId });
});

describe('GET /api/v1/students', () => {
  it('returns 403 for student role', async () => {
    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('admin gets students list with walletAddress and walletLinkingStatus fields', async () => {
    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students.length).toBeGreaterThanOrEqual(1);

    const student = res.body.data.students.find((s: { id: string }) => s.id === ids.studentId);
    expect(student).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(student, 'walletAddress')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(student, 'walletLinkingStatus')).toBe(true);
  });

  it('student with wallet_linking_status none returns walletLinkingStatus: none', async () => {
    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const student = res.body.data.students.find((s: { id: string }) => s.id === ids.studentId);
    expect(student.walletLinkingStatus).toBe('none');
  });

  it('linked student returns correct wallet fields', async () => {
    const res = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const linked = res.body.data.students.find((s: { id: string }) => s.id === ids.linkedStudentId);
    expect(linked).toBeDefined();
    expect(linked.walletAddress).toBe(LINKED_WALLET_ADDRESS);
    expect(linked.walletLinkingStatus).toBe('linked');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/students');
    expect(res.status).toBe(401);
  });
});
