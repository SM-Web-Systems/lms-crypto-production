/** UX-003 AC2/AC5: student search and wallet filter run on the server, over every row. */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { execute } from '../config/database.js';
import { seedTestData, type TestIds } from './helpers/seed.js';
import { makeToken } from './helpers/auth.js';

let ids: TestIds;
let adminToken: string;

const list = (query: Record<string, string>) =>
  request(app).get('/api/v1/students').query(query).set('Authorization', `Bearer ${adminToken}`);
const names = (res: request.Response) => res.body.data.students.map((s: { name: string }) => s.name).sort();

beforeEach(() => {
  ids = seedTestData();
  adminToken = makeToken({ userId: ids.adminId, email: 'admin@test.com', role: 'admin' });
  // 25 extra students so the two seeded ones are past the default page of 20.
  for (let i = 0; i < 25; i++) {
    execute(
      "INSERT INTO students (id, name, email, enrollment_number, department, semester) VALUES (?, ?, ?, ?, 'Physics', 1)",
      [`bulk-${i}`, `Bulk ${i}`, `bulk${i}@test.com`, `BULK-${i}`],
    );
  }
});

describe('GET /api/v1/students search', () => {
  it('total counts every row, not the page', async () => {
    const res = await list({});
    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(20);
    expect(res.body.data.pagination.total).toBe(27);
  });

  it('search matches name, email, enrollment number and department across pages', async () => {
    expect(names(await list({ search: 'Linked' }))).toEqual(['Linked Student']);
    expect(names(await list({ search: 'student@test' }))).toEqual(['Student User']);
    expect(names(await list({ search: 'STU-00' }))).toEqual(['Linked Student', 'Student User']);
    const dept = await list({ search: 'computer sci' });
    expect(names(dept)).toEqual(['Linked Student', 'Student User']);
    expect(dept.body.data.pagination.total).toBe(2);
  });

  it('search is a parameterised LIKE: wildcards and quotes are literal', async () => {
    for (const search of ['%', '_', "' OR 1=1 --"]) {
      const res = await list({ search });
      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(0);
    }
  });

  it('walletStatus filters on the linked wallet', async () => {
    expect(names(await list({ walletStatus: 'linked' }))).toEqual(['Linked Student']);
    const none = await list({ walletStatus: 'none', search: 'STU-00' });
    expect(names(none)).toEqual(['Student User']);
    expect((await list({ walletStatus: 'existing_account' })).body.data.pagination.total).toBe(0);
  });
});
