/** UX-003 AC2/AC3: submission search and status filter run on the server, over every row. */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { execute } from '../config/database.js';
import { seedTestData, type TestIds } from './helpers/seed.js';
import { makeToken } from './helpers/auth.js';

let ids: TestIds;
let adminToken: string;

const list = (query: Record<string, string>) =>
  request(app).get('/api/v1/submissions').query(query).set('Authorization', `Bearer ${adminToken}`);
const titles = (res: request.Response) => res.body.data.submissions.map((s: { title: string }) => s.title).sort();

function submission(id: string, studentId: string, title: string, status = 'pending', submittedAt = '2026-11-01 10:00:00') {
  execute(
    "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, submitted_at) VALUES (?, ?, ?, 'desc', 'f.pdf', 10, '/tmp/f.pdf', ?, ?)",
    [id, studentId, title, status, submittedAt],
  );
}

beforeEach(() => {
  ids = seedTestData();
  adminToken = makeToken({ userId: ids.adminId, email: 'admin@test.com', role: 'admin' });
  // The two oldest rows sit past the first page of 20.
  submission('old-1', ids.studentId, 'Thesis draft', 'approved', '2026-01-01 10:00:00');
  submission('old-2', ids.linkedStudentId, 'Lab report', 'rejected', '2026-01-02 10:00:00');
  for (let i = 0; i < 43; i++) submission(`bulk-${i}`, ids.studentId, `Weekly ${i}`);
});

describe('GET /api/v1/submissions search', () => {
  it('pages over all 45 rows', async () => {
    const first = await list({});
    expect(first.status).toBe(200);
    expect(first.body.data.submissions).toHaveLength(20);
    expect(first.body.data.pagination).toMatchObject({ total: 45, totalPages: 3 });
    expect((await list({ page: '3' })).body.data.submissions).toHaveLength(5);
  });

  it('search matches submission title past the first page', async () => {
    const res = await list({ search: 'thesis' });
    expect(titles(res)).toEqual(['Thesis draft']);
    expect(res.body.data.pagination.total).toBe(1);
  });

  it('search matches student name', async () => {
    expect(titles(await list({ search: 'Linked Stud' }))).toEqual(['Lab report']);
  });

  it('search combines with status', async () => {
    expect((await list({ search: 'Weekly', status: 'pending' })).body.data.pagination.total).toBe(43);
    expect((await list({ search: 'Weekly', status: 'approved' })).body.data.pagination.total).toBe(0);
    expect((await list({ status: 'rejected', limit: '1' })).body.data.pagination.total).toBe(1);
  });

  it('search is a parameterised LIKE: wildcards and quotes are literal', async () => {
    for (const search of ['%', '_', "' OR 1=1 --"]) {
      const res = await list({ search });
      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(0);
    }
  });
});
