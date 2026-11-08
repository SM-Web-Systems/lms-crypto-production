import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../app.js';
import { db, hashToken } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

afterEach(() => vi.unstubAllEnvs());

function fixture(textOnly = false) {
  const courseId = randomUUID();
  const courseCode = 'OFF-' + courseId;
  const items = [
    {id: 'lesson-text', title: 'Text lesson', type: 'text', information: 'Read this offline.', url: 'https://private.invalid/content'},
    ...(textOnly ? [] : [
      {id: 'lesson-audio', title: 'Streaming lesson', type: 'audio', url: 'https://private.invalid/audio'},
      {id: 'lesson-quiz', title: 'Online quiz', type: 'quiz', quizId: 'private-quiz'},
      {id: 'lesson-assignment', title: 'Assignment', type: 'assignment'},
      {id: 'lesson-url-only', title: 'External reading', type: 'text', url: 'https://private.invalid/reading'},
    ]),
  ];
  db.prepare('INSERT INTO courses(id, title, course_code, sections) VALUES (?,?,?,?)').run(
    courseId, 'Offline course', courseCode, JSON.stringify([{id: 'section', title: 'Section', items}]),
  );
  vi.stubEnv('OFFLINE_LEARNING_ENABLED', 'true');
  vi.stubEnv('OFFLINE_LEARNING_TTL_SECONDS', '1800');
  vi.stubEnv('OFFLINE_LEARNING_COURSE_IDS', courseId);
  function learner(enrolled = true, session = true) {
    const id = randomUUID();
    const email = id + '@test.invalid';
    db.prepare("INSERT INTO users(id, name, email, password_hash, role) VALUES (?, 'Learner', ?, 'hash', 'student')").run(id, email);
    if (enrolled) db.prepare('INSERT INTO user_course_codes(user_id, course_code) VALUES (?,?)').run(id, courseCode);
    const token = makeToken({userId: id, email, role: 'student'});
    const sessionExpiry = Math.floor(Date.now() / 1000) * 1000 + 600_000;
    if (session) db.prepare('INSERT INTO active_sessions(id, user_id, token_hash, expires_at) VALUES (?,?,?,?)')
      .run(randomUUID(), id, hashToken(token), new Date(sessionExpiry).toISOString());
    return {id, token, sessionExpiry};
  }
  const path = '/api/v1/courses/' + courseId;
  return {
    courseId, courseCode, path, learner,
    lease: (token: string) => request(app).post(path + '/offline-lease').set('Authorization', 'Bearer ' + token),
    sync: (token: string, operation: object) => request(app).put(path + '/offline-progress')
      .set('Authorization', 'Bearer ' + token).send(operation),
    inspect: (token: string, leaseId: string) => request(app).get(path + '/offline-lease/' + leaseId)
      .set('Authorization', 'Bearer ' + token),
  };
}

const complete = (lease: {leaseId: string; contentVersion: string}, itemId = 'lesson-text') => ({
  leaseId: lease.leaseId, contentVersion: lease.contentVersion, itemId, kind: 'complete', idempotencyKey: randomUUID(),
});

describe('offline learning API', () => {
  it('requires an enabled policy, issues a text-only package, and bounds it to the active session', async () => {
    const f = fixture();
    const a = f.learner();
    vi.stubEnv('OFFLINE_LEARNING_ENABLED', 'false');
    expect((await f.lease(a.token)).body.error.code).toBe('OFFLINE_UNAVAILABLE');
    vi.stubEnv('OFFLINE_LEARNING_ENABLED', 'true');
    vi.stubEnv('OFFLINE_LEARNING_COURSE_IDS', 'different-course');
    expect((await f.lease(a.token)).body.error.code).toBe('OFFLINE_NOT_APPROVED');
    vi.stubEnv('OFFLINE_LEARNING_COURSE_IDS', f.courseId);
    const result = await f.lease(a.token);
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    const {course, leaseId, expiresAt, serverTime, contentVersion} = result.body.data;
    expect(course.sections[0].items).toEqual([
      {id: 'lesson-text', type: 'text', title: 'Text lesson', information: 'Read this offline.'},
    ]);
    expect(contentVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt).toBe(a.sessionExpiry);
    expect(expiresAt).toBeGreaterThan(serverTime);
    expect((await f.lease(a.token)).body.data.leaseId).toBe(leaseId);
    const status = await f.inspect(a.token, leaseId);
    expect(status.status).toBe(200);
    expect(status.body.data).toEqual({leaseId, expiresAt, contentVersion, serverTime: expect.any(Number)});
  });

  it('denies nonmembers, missing durable sessions, and another enrolled account’s lease', async () => {
    const f = fixture();
    const a = f.learner();
    const b = f.learner();
    const noEnrollment = f.learner(false);
    const noSession = f.learner(true, false);
    expect((await f.lease(noEnrollment.token)).status).toBe(403);
    expect((await f.lease(noSession.token)).status).toBe(401);
    const lease = (await f.lease(a.token)).body.data;
    expect((await f.inspect(b.token, lease.leaseId)).status).toBe(403);
    expect((await f.sync(b.token, complete(lease))).body.error.code).toBe('OFFLINE_LEASE_INVALID');
    expect(db.prepare('SELECT count(*) AS count FROM lesson_completions').get()).toEqual({count: 0});
  });

  it('reports the shortened active session expiry when rechecking an existing lease', async () => {
    const f = fixture();
    const a = f.learner();
    const lease = (await f.lease(a.token)).body.data;
    const shorterExpiry = a.sessionExpiry - 300_000;
    db.prepare('UPDATE active_sessions SET expires_at = ? WHERE token_hash = ?')
      .run(new Date(shorterExpiry).toISOString(), hashToken(a.token));

    const status = await f.inspect(a.token, lease.leaseId);
    expect(status.status).toBe(200);
    expect(status.body.data).toMatchObject({leaseId: lease.leaseId, expiresAt: shorterExpiry});
    const savedAgain = await f.lease(a.token);
    expect(savedAgain.body.data).toMatchObject({leaseId: lease.leaseId, expiresAt: shorterExpiry});
  });

  it('invalidates expired, revised and revoked leases, even if enrollment is restored', async () => {
    const f = fixture();
    const a = f.learner();
    const lease = (await f.lease(a.token)).body.data;
    db.prepare('UPDATE courses SET title = ? WHERE id = ?').run('Revised', f.courseId);
    expect((await f.inspect(a.token, lease.leaseId)).body.error.code).toBe('OFFLINE_LEASE_INVALID');
    expect((await f.sync(a.token, complete(lease))).body.error.code).toBe('OFFLINE_LEASE_INVALID');
    const newer = (await f.lease(a.token)).body.data;
    expect(newer.leaseId).not.toBe(lease.leaseId);
    db.prepare('UPDATE offline_learning_leases SET issued_at = ?, expires_at = ? WHERE id = ?')
      .run(Date.now() - 2000, Date.now() - 1000, newer.leaseId);
    expect((await f.sync(a.token, complete(newer))).body.error.code).toBe('OFFLINE_LEASE_EXPIRED');
    const current = (await f.lease(a.token)).body.data;
    db.prepare('DELETE FROM user_course_codes WHERE user_id = ? AND course_code = ?').run(a.id, f.courseCode);
    expect((await f.sync(a.token, complete(current))).body.error.code).toBe('OFFLINE_ACCESS_REVOKED');
    db.prepare('INSERT INTO user_course_codes(user_id, course_code) VALUES (?,?)').run(a.id, f.courseCode);
    expect((await f.sync(a.token, complete(current))).body.error.code).toBe('OFFLINE_LEASE_INVALID');
    const restored = (await f.lease(a.token)).body.data;
    db.prepare("UPDATE courses SET approval_status = 'draft' WHERE id = ?").run(f.courseId);
    expect((await f.sync(a.token, complete(restored))).body.error.code).toBe('OFFLINE_ACCESS_REVOKED');
    db.prepare("UPDATE courses SET approval_status = 'published' WHERE id = ?").run(f.courseId);
    expect((await f.sync(a.token, complete(restored))).body.error.code).toBe('OFFLINE_LEASE_INVALID');
    const active = (await f.lease(a.token)).body.data;
    db.prepare("UPDATE active_sessions SET revoked_at = datetime('now') WHERE token_hash = ?").run(hashToken(a.token));
    expect((await f.sync(a.token, complete(active))).status).toBe(401);
    expect(db.prepare('SELECT count(*) AS count FROM lesson_completions').get()).toEqual({count: 0});
  });

  it('requires a fresh lease after edited content is restored to its original version', async () => {
    const f = fixture();
    const a = f.learner();
    const lease = (await f.lease(a.token)).body.data;
    const {sections} = db.prepare('SELECT sections FROM courses WHERE id = ?').get(f.courseId) as {sections: string};
    const update = db.prepare('UPDATE courses SET sections = ? WHERE id = ?');
    const revised = sections.replace('Read this offline.', 'New offline reading.');
    update.run(sections, f.courseId);
    expect((await f.inspect(a.token, lease.leaseId)).status).toBe(200);

    expect(() => db.transaction(() => {
      update.run(revised, f.courseId);
      throw new Error('rollback edit');
    })()).toThrow('rollback edit');
    expect((await f.inspect(a.token, lease.leaseId)).status).toBe(200);

    update.run(revised, f.courseId);
    update.run(sections, f.courseId);
    expect((await f.inspect(a.token, lease.leaseId)).body.error.code).toBe('OFFLINE_LEASE_INVALID');
    expect((await f.sync(a.token, complete(lease))).body.error.code).toBe('OFFLINE_LEASE_INVALID');
    expect(db.prepare('SELECT count(*) AS count FROM lesson_completions WHERE user_id = ?').get(a.id)).toEqual({count: 0});
    const fresh = (await f.lease(a.token)).body.data;
    expect(fresh.contentVersion).toBe(lease.contentVersion);
    expect(fresh.leaseId).not.toBe(lease.leaseId);
    expect((await f.sync(a.token, complete(fresh))).status).toBe(200);
  });

  it('merges delayed progress monotonically and denies key reuse with a different operation', async () => {
    const f = fixture();
    const a = f.learner();
    const lease = (await f.lease(a.token)).body.data;
    const first = {...complete(lease), kind: 'progress', progressPercent: 64, positionSeconds: 75};
    const later = {...complete(lease), kind: 'progress', progressPercent: 20, positionSeconds: 15};
    expect((await f.sync(a.token, first)).body.data).toMatchObject({progressPct: 64, lastPositionS: 75, completedAt: null});
    expect((await f.sync(a.token, later)).body.data).toMatchObject({progressPct: 64, lastPositionS: 75, completedAt: null});
    expect((await f.sync(a.token, first)).status).toBe(200);
    expect((await f.sync(a.token, {...first, positionSeconds: 80})).body.error.code).toBe('OFFLINE_OPERATION_CONFLICT');
    expect((await f.sync(a.token, {...first, contentVersion: 'a'.repeat(64)})).body.error.code).toBe('OFFLINE_CONTENT_CHANGED');
    for (const item of ['lesson-audio', 'lesson-quiz', 'lesson-assignment', 'lesson-url-only']) {
      expect((await f.sync(a.token, complete(lease, item))).body.error.code).toBe('OFFLINE_ITEM_NOT_APPROVED');
    }
    expect(db.prepare('SELECT count(*) AS count FROM offline_progress_receipts').get()).toEqual({count: 2});
  });

  it('acknowledges a completion replay once and preserves completion, reward and notification ownership', async () => {
    const f = fixture(true);
    const a = f.learner();
    const teacher = f.learner(false);
    const groupId = randomUUID();
    db.prepare("INSERT INTO user_groups(id, name, group_type, owner_user_id) VALUES (?, 'Class', 'class', ?)").run(groupId, teacher.id);
    db.prepare('INSERT INTO user_group_members(group_id,user_id) VALUES (?,?)').run(groupId, a.id);
    const lease = (await f.lease(a.token)).body.data;
    const operation = complete(lease);
    const responses = await Promise.all([f.sync(a.token, operation), f.sync(a.token, operation)]);
    expect(responses.map(res => res.status)).toEqual([200, 200]);
    expect(responses[0].body.data).toEqual(responses[1].body.data);
    expect(responses[0].body.data).toMatchObject({itemId: 'lesson-text', progressPct: 100, completedAt: expect.any(String)});
    expect(db.prepare('SELECT student_user_id FROM reward_event_outbox WHERE event_source_id = ?').all(f.courseId))
      .toEqual([{student_user_id: a.id}]);
    expect(db.prepare("SELECT user_id FROM notifications WHERE type='class_completion'").all()).toEqual([{user_id: teacher.id}]);
    expect(db.prepare('SELECT count(*) AS count FROM offline_progress_receipts').get()).toEqual({count: 1});
  });

  it('rolls back completion and its reward event when the receipt cannot be stored', async () => {
    const f = fixture(true);
    const a = f.learner();
    const lease = (await f.lease(a.token)).body.data;
    const operation = complete(lease);
    db.exec(`CREATE TEMP TRIGGER reject_offline_receipt BEFORE INSERT ON offline_progress_receipts
      BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END;`);
    try {
      expect((await f.sync(a.token, operation)).status).toBe(500);
      expect(db.prepare('SELECT count(*) AS count FROM lesson_completions').get()).toEqual({count: 0});
      expect(db.prepare('SELECT count(*) AS count FROM reward_event_outbox').get()).toEqual({count: 0});
    } finally {
      db.exec('DROP TRIGGER reject_offline_receipt');
    }
    expect((await f.sync(a.token, operation)).status).toBe(200);
  });
});
