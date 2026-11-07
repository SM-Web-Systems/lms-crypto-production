import { seedTestAccount } from './helpers/rbacFixtures.js';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID as uuid } from 'node:crypto';
import app from '../app.js';
import { db, execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

function actor(role = 'role_sponsor') {
  const id = uuid(),
    email = id + '@audit.invalid';
  seedTestAccount(db, `INSERT INTO users(id,name,email,password_hash) VALUES (?,'Account',?,'unused')`, [id,email], ["role_student"]).changes;
  execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
  execute('INSERT INTO user_roles(user_id,role_id) VALUES (?,?)', [id, role]);
  return { id, token: generateToken({ userId: id, email, role: 'student' }) };
}
function course(status = 'published', tenantId: string | null = null) {
  const id = uuid();
  execute(
    "INSERT INTO courses(id,title,course_code,sections,sponsor_label,approval_status,tenant_id) VALUES (?,'Course',?,'[]','Same label',?,?)",
    [id, id, status, tenantId],
  );
  return id;
}
function cohort(owner: string, courseId: string) {
  const id = uuid();
  execute(
    "INSERT INTO sponsor_cohorts(id,sponsor_user_id,course_id,name,selected_tier,status,created_at) VALUES (?,?,?,'Cohort','paid','active','2026-03-01')",
    [id, owner, courseId],
  );
  return id;
}
function payment(
  userId: string,
  courseId: string,
  status = 'confirmed',
  createdAt = '2026-03-15T23:59:59.999Z',
) {
  const id = uuid();
  execute(
    "INSERT INTO payments(id,user_id,course_id,amount_cents,currency,payment_method,status,created_at) VALUES (?,?,?,2500,'ZAR','manual',?,?)",
    [id, userId, courseId, status, createdAt],
  );
  return id;
}
function member(cohortId: string, userId: string) {
  execute('INSERT INTO cohort_members(cohort_id,user_id) VALUES (?,?)', [cohortId, userId]);
}
function get(a: ReturnType<typeof actor>, path: string) {
  return request(app)
    .get('/api/v1' + path)
    .auth(a.token, { type: 'bearer' });
}
function seed() {
  const a = actor(),
    b = actor(),
    student = actor('role_student'),
    other = actor('role_student');
  const own = course(),
    outside = course(),
    ca = cohort(a.id, own),
    duplicate = cohort(a.id, own),
    cb = cohort(b.id, own);
  cohort(b.id, outside);
  member(ca, student.id);
  member(duplicate, student.id);
  member(cb, other.id);
  const ownPayment = payment(a.id, own),
    memberPayment = payment(student.id, own),
    outsidePayment = payment(student.id, outside),
    otherPayment = payment(other.id, own);
  execute('UPDATE sponsor_cohorts SET payment_id = ? WHERE id = ?', [ownPayment, ca]);
  return {
    a,
    b,
    student,
    other,
    own,
    outside,
    ca,
    duplicate,
    ownPayment,
    memberPayment,
    outsidePayment,
    otherPayment,
  };
}

describe('A05 — sponsor-scoped course reads', () => {
  it('sponsor-only analytics count only owned cohort members, deduplicating overlap', async () => {
    const { a, student, other, own } = seed();
    execute("UPDATE users SET walletAddress = 'GWALLET' WHERE id = ?", [student.id]);
    for (const [userId, status] of [
      [student.id, 'minted'],
      [student.id, 'pending'],
      [other.id, 'minted'],
    ]) {
      execute(
        "INSERT INTO nft_credentials(id,user_id,course_id,wallet_address,mint_status,contract_id) VALUES (?,?,?,'GWALLET',?,'audit-contract')",
        [uuid(), userId, own, status],
      );
    }
    const result = await get(a, '/sponsor/courses');
    expect(result.status).toBe(200);
    expect(result.body.data.courses).toHaveLength(1);
    expect(result.body.data.courses[0]).toMatchObject({
      courseId: own,
      enrollmentsCount: 1,
      walletsLinkedCount: 1,
      nftsIssuedCount: 1,
    });
    expect((await get(a, '/analytics/courses')).status).toBe(403);
    expect((await get(a, '/analytics/courses/export')).status).toBe(403);
    expect((await get(a, `/analytics/courses/${own}/students`)).status).toBe(403);
  });
  it('drill-down and CSV use membership ownership, not labels or shared course enrollment', async () => {
    const { a, student, other, own, outside } = seed();
    execute("UPDATE users SET name = '=FORMULA' WHERE id = ?", [student.id]);
    const students = await get(a, `/sponsor/courses/${own}/students`);
    expect(students.status).toBe(200);
    expect(students.body.data.students.map((s: { userId: string }) => s.userId)).toEqual([student.id]);
    expect((await get(a, `/sponsor/courses/${outside}/students`)).status).toBe(403);
    const csv = await get(a, '/sponsor/courses/export');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain("'=FORMULA");
    expect(csv.text).toContain(student.id + '@audit.invalid');
    expect(csv.text).not.toContain(other.id + '@audit.invalid');
    expect(csv.text.trim().split('\n')).toHaveLength(2);
  });
  it('sponsor reads remain owned when an administrative role is also assigned', async () => {
    const { a, own } = seed();
    execute('INSERT INTO user_roles(user_id,role_id) VALUES (?,?)', [a.id, 'role_admin']);
    expect(
      (await get(a, '/sponsor/courses')).body.data.courses.map((c: { courseId: string }) => c.courseId),
    ).toEqual([own]);
    expect((await get(a, '/sponsor/spending-report')).body.data.cohorts).toHaveLength(2);
    expect((await get(a, '/sponsor/dashboard')).body.data.cohorts).toHaveLength(2);
    expect((await get(a, '/admin/cohorts?view=own')).body.data.cohorts).toHaveLength(2);
  });
  it('empty sponsors have a metadata-only course catalog without unrelated tenant drafts', async () => {
    const a = actor(),
      published = course(),
      draft = course('draft'),
      tenantId = uuid();
    execute("INSERT INTO tenants(id,name,slug) VALUES (?,'Private',?)", [tenantId, tenantId]);
    const privateCourse = course('published', tenantId);
    expect((await get(a, '/sponsor/courses')).body.data.courses).toEqual([]);
    const options = await get(a, '/sponsor/course-options');
    expect(options.status).toBe(200);
    expect(options.body.data.courses.map((c: { id: string }) => c.id)).toEqual([published]);
    expect(JSON.stringify(options.body.data)).not.toContain('enrollmentsCount');
    for (const courseId of [draft, privateCourse])
      expect(
        (
          await request(app)
            .post('/api/v1/admin/cohorts')
            .auth(a.token, { type: 'bearer' })
            .send({ name: 'Forged', courseId })
        ).status,
      ).toBe(403);
  });
  it('assigned tenant membership permits that tenant catalog, and owned drafts remain selectable', async () => {
    const a = actor(),
      tenantId = uuid();
    execute("INSERT INTO tenants(id,name,slug) VALUES (?,'Tenant',?)", [tenantId, tenantId]);
    execute("INSERT INTO tenant_users(tenant_id,user_id,tenant_role) VALUES (?,?,'member')", [
      tenantId,
      a.id,
    ]);
    const available = course('published', tenantId),
      draft = course('draft');
    cohort(a.id, draft);
    expect(
      (await get(a, '/sponsor/course-options')).body.data.courses.map((c: { id: string }) => c.id).sort(),
    ).toEqual([available, draft].sort());
  });
  it('membership removal removes drill-down, CSV and cohort billing access immediately', async () => {
    const { a, student, ca, duplicate, own, memberPayment } = seed();
    execute('DELETE FROM cohort_members WHERE user_id = ? AND cohort_id IN (?,?)', [
      student.id,
      ca,
      duplicate,
    ]);
    expect((await get(a, `/sponsor/courses/${own}/students`)).body.data.students).toEqual([]);
    expect((await get(a, '/sponsor/billing?scope=cohort')).body.data.payments).toEqual([]);
    expect((await get(a, `/payments/${memberPayment}/receipt`)).status).toBe(403);
  });
  it('ordinary students cannot access sponsor aggregates or exports', async () => {
    const a = actor('role_student');
    for (const path of [
      '/sponsor/courses',
      '/sponsor/course-options',
      '/sponsor/courses/export',
      '/sponsor/dashboard',
      '/sponsor/spending-report',
    ])
      expect((await get(a, path)).status, path).toBe(403);
  });
  it('aggregate capability alone does not expose member identities', async () => {
    const { a, own } = seed();
    execute("INSERT INTO roles(id,name,label,is_system) VALUES ('aggregate','aggregate','Aggregate',0)");
    execute(
      "INSERT INTO role_permissions(role_id,permission_id) VALUES ('aggregate','perm_cohort_view_own')",
    );
    execute('DELETE FROM user_roles WHERE user_id = ?', [a.id]);
    execute("INSERT INTO user_roles(user_id,role_id) VALUES (?,'aggregate')", [a.id]);
    expect((await get(a, '/sponsor/courses')).status).toBe(200);
    expect((await get(a, '/sponsor/courses/export')).status).toBe(403);
    expect((await get(a, `/sponsor/courses/${own}/students`)).status).toBe(403);
  });
});

describe('A06 — sponsor billing semantics', () => {
  it('sponsor-only and sponsor plus student receive the same own payments', async () => {
    const { a, ownPayment } = seed();
    const read = () => get(a, '/sponsor/billing');
    expect((await read()).status).toBe(200);
    expect((await read()).body.data.payments.map((p: { id: string }) => p.id)).toEqual([ownPayment]);
    execute('INSERT INTO user_roles(user_id,role_id) VALUES (?,?)', [a.id, 'role_student']);
    expect((await read()).body.data.payments.map((p: { id: string }) => p.id)).toEqual([ownPayment]);
    expect(
      queryOne(
        "SELECT 1 FROM role_permissions WHERE role_id = 'role_sponsor' AND permission_id = 'perm_system_view_audit_log'",
      ),
    ).toBeNull();
  });
  it('cohort payments exclude sponsor payments and unrelated courses and members', async () => {
    const { a, memberPayment } = seed();
    const result = await get(a, '/sponsor/billing?scope=cohort');
    expect(result.status).toBe(200);
    expect(result.body.data.scope).toBe('cohort');
    expect(result.body.data.payments.map((p: { id: string }) => p.id)).toEqual([memberPayment]);
  });
  it('owners and matching cohort members have receipts; unrelated payments are denied', async () => {
    const { a, ownPayment, memberPayment, otherPayment, outsidePayment } = seed();
    for (const id of [ownPayment, memberPayment]) {
      const result = await get(a, `/payments/${id}/receipt`);
      expect(result.status).toBe(200);
      expect(result.headers['content-type']).toContain('application/pdf');
    }
    for (const id of [otherPayment, outsidePayment])
      expect((await get(a, `/payments/${id}/receipt`)).status).toBe(403);
  });
  it('own billing does not give students cohort billing access', async () => {
    const a = actor('role_student');
    expect((await get(a, '/sponsor/billing')).status).toBe(200);
    expect((await get(a, '/sponsor/billing?scope=cohort')).status).toBe(403);
    expect((await get(a, '/sponsor/billing?scope=all')).status).toBe(400);
  });
  it('inclusive date filters handle both timestamp formats at the day boundary', async () => {
    const a = actor(),
      id = course();
    const included = payment(a.id, id);
    payment(a.id, id, 'confirmed', '2026-03-16T00:00:00Z');
    const sqlite = payment(a.id, id, 'confirmed', '2026-03-15 23:59:59');
    const result = await get(a, '/sponsor/billing?from=2026-03-15&to=2026-03-15');
    expect(result.body.data.payments.map((p: { id: string }) => p.id).sort()).toEqual(
      [included, sqlite].sort(),
    );
  });
  it.each([
    'from=2026-02-30',
    'from=2026-13-01',
    'from=nope',
    'from=2026-04-01&to=2026-03-01',
    'from=2026-03-01&from=2026-03-02',
  ])('invalid date range is rejected: %s', async (query) => {
    const a = actor();
    for (const endpoint of ['billing', 'impact-report'])
      expect((await get(a, `/sponsor/${endpoint}?${query}`)).status).toBe(400);
  });
});

describe('A05 — impact course boundary', () => {
  it('drop-off excludes unrelated courses, partial progress and duplicate membership', async () => {
    const { a, student, own, outside } = seed();
    for (const [id, completed] of [
      [own, '2026-03-15'],
      [outside, '2026-03-15'],
      [own, null],
    ])
      execute(
        'INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id,completed_at) VALUES (?,?,?,?,?,?)',
        [uuid(), student.id, id, completed ? 'complete' : 'partial', 'section', completed],
      );
    const result = await get(a, '/sponsor/impact-report');
    expect(result.status).toBe(200);
    expect(result.body.data.dropOff).toEqual([
      {
        courseId: own,
        courseName: 'Course',
        itemId: 'complete',
        sectionId: 'section',
        completions: 1,
        totalMembers: 1,
        completionRate: 100,
      },
    ]);
    expect((await get(a, '/sponsor/impact-report?from=2026-04-01')).body.data.dropOff).toEqual([]);
  });
});
