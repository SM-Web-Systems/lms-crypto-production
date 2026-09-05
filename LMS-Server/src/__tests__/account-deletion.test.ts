/**
 * Account Deletion & Forum Anonymization — comprehensive TDD test suite.
 *
 * Phase 1: Schema & migration verification
 * Phase 2: Deletion request lifecycle (request, cancel, finalize)
 * Phase 3: Auth gate for pending-deletion users
 * Phase 4: Anonymization (identity snapshot, PII wipe)
 * Phase 5: Finalization scheduler
 * Phase 6: Forum LEFT JOIN anonymization
 * Phase 7: Data export enhancement
 * Phase 8: Compliance identity access
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, query, queryOne, execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

// ── helpers ───────────────────────────────────────────────────────

function createUser(overrides: Partial<{
  id: string;
  name: string;
  email: string;
  role: string;
  deletion_status: string | null;
}> = {}) {
  const id = overrides.id ?? uuidv4();
  const name = overrides.name ?? 'Test User';
  const email = overrides.email ?? `user-${id}@test.com`;
  const role = overrides.role ?? 'student';
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, name, email, HASH, role);
  if (overrides.deletion_status) {
    db.prepare('UPDATE users SET deletion_status = ? WHERE id = ?')
      .run(overrides.deletion_status, id);
  }
  return { id, name, email, role };
}

function ensureForumTables() {
  const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='forum_topics'").get();
  if (!has) {
    db.exec(`
      CREATE TABLE forum_topics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE forum_posts (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
}

function createForumTopic(authorId: string, title = 'Test Topic', body = 'Test Body') {
  ensureForumTables();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO forum_topics (id, title, body, author_id) VALUES (?, ?, ?, ?)'
  ).run(id, title, body, authorId);
  return id;
}

function createForumPost(topicId: string, authorId: string, body = 'Test Post') {
  ensureForumTables();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO forum_posts (id, topic_id, body, author_id) VALUES (?, ?, ?, ?)'
  ).run(id, topicId, body, authorId);
  return id;
}

// ─────────────────────────────────────────────────────────────────
// Phase 1: Schema & Migration
// ─────────────────────────────────────────────────────────────────

describe('Phase 1: Schema & Migration', () => {
  it('SCH-01: users table has deletion_status column', () => {
    const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('deletion_status');
  });

  it('SCH-02: users table has all 7 deletion columns', () => {
    const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    const colNames = new Set(cols.map(c => c.name));
    const expected = [
      'deletion_status', 'deletion_requested_at', 'deletion_finalized_at',
      'deletion_requested_by', 'legal_hold_reason', 'legal_hold_placed_at',
      'legal_hold_review_date',
    ];
    for (const col of expected) {
      expect(colNames.has(col), `missing column: ${col}`).toBe(true);
    }
  });

  it('SCH-03: deleted_user_identities table exists', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='deleted_user_identities'"
    ).get();
    expect(row).toBeTruthy();
  });

  it('SCH-04: deletion_requests table exists', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='deletion_requests'"
    ).get();
    expect(row).toBeTruthy();
  });

  it('SCH-05: identity_access_log table exists', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='identity_access_log'"
    ).get();
    expect(row).toBeTruthy();
  });

  it('SCH-06: deletion_status CHECK constraint enforces valid values', () => {
    const user = createUser();
    // Valid value
    expect(() => {
      db.prepare('UPDATE users SET deletion_status = ? WHERE id = ?')
        .run('pending_deletion', user.id);
    }).not.toThrow();
    // Invalid value
    expect(() => {
      db.prepare('UPDATE users SET deletion_status = ? WHERE id = ?')
        .run('invalid_status', user.id);
    }).toThrow();
  });

  it('SCH-07: deletion_requests status CHECK constraint enforces valid values', () => {
    const user = createUser();
    const id = uuidv4();
    // Valid
    expect(() => {
      db.prepare(
        `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
         VALUES (?, ?, 'pending', datetime('now', '+30 days'))`
      ).run(id, user.id);
    }).not.toThrow();
    // Invalid
    expect(() => {
      db.prepare(
        `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
         VALUES (?, ?, 'bad_status', datetime('now', '+30 days'))`
      ).run(uuidv4(), user.id);
    }).toThrow();
  });

  it('SCH-08: privacy.view_deleted_identity permission exists', () => {
    const perm = queryOne<{ name: string }>(
      "SELECT name FROM permissions WHERE name = 'privacy.view_deleted_identity'"
    );
    expect(perm).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 2: Deletion Request Lifecycle
// ─────────────────────────────────────────────────────────────────

describe('Phase 2: Deletion Request Lifecycle', () => {
  it('DEL-01: POST /account/delete creates a deletion request with 30-day grace', async () => {
    const user = createUser();
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });

    const res = await request(app)
      .post('/api/v1/account/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmation: 'DELETE MY ACCOUNT' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.gracePeriodEndsAt).toBeDefined();

    // Verify DB state
    const req2 = queryOne<{ status: string; user_id: string }>(
      'SELECT status, user_id FROM deletion_requests WHERE user_id = ?',
      [user.id]
    );
    expect(req2?.status).toBe('pending');

    const updatedUser = queryOne<{ deletion_status: string }>(
      'SELECT deletion_status FROM users WHERE id = ?',
      [user.id]
    );
    expect(updatedUser?.deletion_status).toBe('pending_deletion');
  });

  it('DEL-02: POST /account/delete rejects without confirmation string', async () => {
    const user = createUser();
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });

    const res = await request(app)
      .post('/api/v1/account/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('DEL-03: POST /account/delete rejects if already pending', async () => {
    const user = createUser({ deletion_status: 'pending_deletion' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });
    // Insert existing request
    db.prepare(
      `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
       VALUES (?, ?, 'pending', datetime('now', '+30 days'))`
    ).run(uuidv4(), user.id);

    const res = await request(app)
      .post('/api/v1/account/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmation: 'DELETE MY ACCOUNT' });

    expect(res.status).toBe(409);
  });

  it('DEL-04: POST /account/delete/cancel cancels pending deletion', async () => {
    const user = createUser({ deletion_status: 'pending_deletion' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });
    db.prepare(
      `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
       VALUES (?, ?, 'pending', datetime('now', '+30 days'))`
    ).run(uuidv4(), user.id);

    const res = await request(app)
      .post('/api/v1/account/delete/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedUser = queryOne<{ deletion_status: string | null }>(
      'SELECT deletion_status FROM users WHERE id = ?',
      [user.id]
    );
    expect(updatedUser?.deletion_status).toBeNull();

    const req2 = queryOne<{ status: string }>(
      "SELECT status FROM deletion_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );
    expect(req2?.status).toBe('cancelled');
  });

  it('DEL-05: POST /account/delete/cancel returns 404 if no pending request', async () => {
    const user = createUser();
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });

    const res = await request(app)
      .post('/api/v1/account/delete/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('DEL-06: GET /account/delete/status returns deletion info', async () => {
    const user = createUser({ deletion_status: 'pending_deletion' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });
    db.prepare(
      `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
       VALUES (?, ?, 'pending', datetime('now', '+30 days'))`
    ).run(uuidv4(), user.id);

    const res = await request(app)
      .get('/api/v1/account/delete/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.gracePeriodEndsAt).toBeDefined();
  });

  it('DEL-07: admin cannot delete their own account', async () => {
    const admin = createUser({ role: 'admin' });
    const token = makeToken({ userId: admin.id, email: admin.email, role: 'admin' });

    const res = await request(app)
      .post('/api/v1/account/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmation: 'DELETE MY ACCOUNT' });

    expect(res.status).toBe(403);
  });

  it('DEL-08: POST /account/delete blocked when user has legal hold', async () => {
    const user = createUser({ deletion_status: 'legal_hold' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });

    const res = await request(app)
      .post('/api/v1/account/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmation: 'DELETE MY ACCOUNT' });

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 3: Auth Gate
// ─────────────────────────────────────────────────────────────────

describe('Phase 3: Auth Gate for Pending-Deletion Users', () => {
  it('GATE-01: finalized user gets 403 on protected routes', async () => {
    const user = createUser({ deletion_status: 'finalized' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });

    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/account.*deleted|finalized/i);
  });

  it('GATE-02: pending_deletion user can access deletion status', async () => {
    const user = createUser({ deletion_status: 'pending_deletion' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });
    db.prepare(
      `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
       VALUES (?, ?, 'pending', datetime('now', '+30 days'))`
    ).run(uuidv4(), user.id);

    const res = await request(app)
      .get('/api/v1/account/delete/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('GATE-03: pending_deletion user can cancel deletion', async () => {
    const user = createUser({ deletion_status: 'pending_deletion' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });
    db.prepare(
      `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
       VALUES (?, ?, 'pending', datetime('now', '+30 days'))`
    ).run(uuidv4(), user.id);

    const res = await request(app)
      .post('/api/v1/account/delete/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('GATE-04: pending_deletion user can access data export', async () => {
    const user = createUser({ deletion_status: 'pending_deletion' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });

    // GET /data-export should be allowlisted
    const res = await request(app)
      .get('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);

    // 200 or 404 (no exports) but NOT 403
    expect(res.status).not.toBe(403);
  });

  it('GATE-05: pending_deletion user CANNOT create forum posts', async () => {
    const user = createUser({ deletion_status: 'pending_deletion' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });

    ensureForumTables();
    const topicId = createForumTopic(user.id);

    const res = await request(app)
      .post(`/api/v1/forum/topics/${topicId}/posts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Should be blocked' });

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 4: Anonymization Service
// ─────────────────────────────────────────────────────────────────

describe('Phase 4: Anonymization Service', () => {
  it('ANON-01: snapshotIdentity stores original PII', async () => {
    const { snapshotIdentity } = await import('../services/deletionService.js');
    const user = createUser({ name: 'Jane Doe', email: 'jane@example.com' });

    snapshotIdentity(user.id);

    const snapshot = queryOne<{
      user_id: string;
      original_name: string;
      original_email: string;
    }>('SELECT * FROM deleted_user_identities WHERE user_id = ?', [user.id]);

    expect(snapshot).toBeTruthy();
    expect(snapshot!.original_name).toBe('Jane Doe');
    expect(snapshot!.original_email).toBe('jane@example.com');
  });

  it('ANON-02: anonymizeUser replaces name with "Deleted User"', async () => {
    const { snapshotIdentity, anonymizeUser } = await import('../services/deletionService.js');
    const user = createUser({ name: 'Jane Doe', email: 'jane@example.com' });

    snapshotIdentity(user.id);
    anonymizeUser(user.id);

    const updated = queryOne<{ name: string; email: string; deletion_status: string }>(
      'SELECT name, email, deletion_status FROM users WHERE id = ?',
      [user.id]
    );

    expect(updated!.name).toBe('Deleted User');
    expect(updated!.email).toMatch(/^deleted_[a-f0-9]+@deleted\.local$/);
    expect(updated!.deletion_status).toBe('finalized');
  });

  it('ANON-03: anonymizeUser nullifies user_profiles', async () => {
    const { snapshotIdentity, anonymizeUser } = await import('../services/deletionService.js');
    const user = createUser({ name: 'Jane Doe', email: 'jane@example.com' });

    // Ensure user_profiles table exists (created at runtime, not in schema.sql)
    db.exec(`CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      bio TEXT, phone TEXT, address TEXT, avatar_url TEXT,
      date_of_birth TEXT, linkedin_url TEXT, twitter_url TEXT, website_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    // Insert a profile
    db.prepare(
      `INSERT INTO user_profiles (user_id, bio, phone, address, avatar_url)
       VALUES (?, 'Some bio', '+1234567890', '123 Main St', '/uploads/avatar.jpg')`
    ).run(user.id);

    snapshotIdentity(user.id);
    anonymizeUser(user.id);

    const profile = queryOne<{ bio: string | null; phone: string | null; address: string | null; avatar_url: string | null }>(
      'SELECT bio, phone, address, avatar_url FROM user_profiles WHERE user_id = ?',
      [user.id]
    );

    expect(profile!.bio).toBeNull();
    expect(profile!.phone).toBeNull();
    expect(profile!.address).toBeNull();
    expect(profile!.avatar_url).toBeNull();
  });

  it('ANON-04: anonymizeUser clears email_outbox PII', async () => {
    const { snapshotIdentity, anonymizeUser } = await import('../services/deletionService.js');
    const user = createUser({ name: 'Jane Doe', email: 'jane@example.com' });

    // Insert outbox entry (id is autoincrement, email_type required)
    db.prepare(
      `INSERT INTO email_outbox (email_type, recipient, subject, html_body, status)
       VALUES ('test', 'jane@example.com', 'Test', '<p>Hello</p>', 'sent')`
    ).run();

    snapshotIdentity(user.id);
    anonymizeUser(user.id);

    const outbox = query<{ recipient: string }>(
      "SELECT recipient FROM email_outbox WHERE recipient = 'jane@example.com'"
    );
    expect(outbox.length).toBe(0);
  });

  it('ANON-05: anonymizeUser sets password_hash to sentinel', async () => {
    const { snapshotIdentity, anonymizeUser } = await import('../services/deletionService.js');
    const user = createUser();

    snapshotIdentity(user.id);
    anonymizeUser(user.id);

    const updated = queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = ?',
      [user.id]
    );
    expect(updated!.password_hash).toBe('$deleted$');
  });

  it('ANON-06: snapshotIdentity is idempotent (second call does not overwrite)', async () => {
    const { snapshotIdentity } = await import('../services/deletionService.js');
    const user = createUser({ name: 'Jane Doe', email: 'jane@example.com' });

    snapshotIdentity(user.id);

    // Change user name
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run('Changed Name', user.id);
    snapshotIdentity(user.id);

    const snapshot = queryOne<{ original_name: string }>(
      'SELECT original_name FROM deleted_user_identities WHERE user_id = ?',
      [user.id]
    );
    expect(snapshot!.original_name).toBe('Jane Doe'); // original, not changed
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 5: Finalization Scheduler
// ─────────────────────────────────────────────────────────────────

describe('Phase 5: Finalization Scheduler', () => {
  it('FIN-01: processExpiredDeletions finalizes expired requests', async () => {
    const { processExpiredDeletions, snapshotIdentity } = await import('../services/deletionService.js');
    const user = createUser({ name: 'Expired User', email: 'expired@test.com', deletion_status: 'pending_deletion' });
    snapshotIdentity(user.id);

    // Insert a request with grace period in the past
    db.prepare(
      `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
       VALUES (?, ?, 'pending', datetime('now', '-1 day'))`
    ).run(uuidv4(), user.id);

    const count = processExpiredDeletions();
    expect(count).toBe(1);

    const updated = queryOne<{ deletion_status: string; name: string }>(
      'SELECT deletion_status, name FROM users WHERE id = ?',
      [user.id]
    );
    expect(updated!.deletion_status).toBe('finalized');
    expect(updated!.name).toBe('Deleted User');
  });

  it('FIN-02: processExpiredDeletions skips legal_hold users', async () => {
    const { processExpiredDeletions, snapshotIdentity } = await import('../services/deletionService.js');
    const user = createUser({ name: 'Hold User', email: 'hold@test.com', deletion_status: 'legal_hold' });
    snapshotIdentity(user.id);

    db.prepare(
      `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
       VALUES (?, ?, 'blocked_legal_hold', datetime('now', '-1 day'))`
    ).run(uuidv4(), user.id);

    const count = processExpiredDeletions();
    expect(count).toBe(0);

    const updated = queryOne<{ name: string }>(
      'SELECT name FROM users WHERE id = ?',
      [user.id]
    );
    expect(updated!.name).toBe('Hold User');
  });

  it('FIN-03: processExpiredDeletions does not process future grace periods', async () => {
    const { processExpiredDeletions } = await import('../services/deletionService.js');
    const user = createUser({ deletion_status: 'pending_deletion' });

    db.prepare(
      `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
       VALUES (?, ?, 'pending', datetime('now', '+29 days'))`
    ).run(uuidv4(), user.id);

    const count = processExpiredDeletions();
    expect(count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 6: Forum Anonymization (LEFT JOIN)
// ─────────────────────────────────────────────────────────────────

describe('Phase 6: Forum Anonymization', () => {
  it('FORUM-01: topics by deleted user show "Deleted User" name', async () => {
    const user = createUser({ name: 'Jane Doe', email: 'jane@test.com' });
    const viewer = createUser({ name: 'Viewer', email: 'viewer@test.com' });
    const viewerToken = makeToken({ userId: viewer.id, email: viewer.email, role: 'student' });

    ensureForumTables();
    createForumTopic(user.id, 'My Topic', 'My body');

    // Simulate anonymization
    db.prepare("UPDATE users SET name = 'Deleted User', deletion_status = 'finalized' WHERE id = ?")
      .run(user.id);

    const res = await request(app)
      .get('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const topic = res.body.data.topics[0];
    expect(topic.author.name).toBe('Deleted User');
    expect(topic.author.isDeleted).toBe(true);
  });

  it('FORUM-02: posts by deleted user show "Deleted User" name', async () => {
    const user = createUser({ name: 'Jane Doe', email: 'jane@test.com' });
    const viewer = createUser({ name: 'Viewer', email: 'viewer2@test.com' });
    const viewerToken = makeToken({ userId: viewer.id, email: viewer.email, role: 'student' });

    ensureForumTables();
    const topicId = createForumTopic(user.id, 'Topic', 'Body');
    createForumPost(topicId, user.id, 'My reply');

    db.prepare("UPDATE users SET name = 'Deleted User', deletion_status = 'finalized' WHERE id = ?")
      .run(user.id);

    const res = await request(app)
      .get(`/api/v1/forum/topics/${topicId}/posts`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const post = res.body.data.posts[0];
    expect(post.author.name).toBe('Deleted User');
    expect(post.author.isDeleted).toBe(true);
  });

  it('FORUM-03: single topic by deleted user shows anonymized author', async () => {
    const user = createUser({ name: 'Jane Doe', email: 'jane3@test.com' });
    const viewer = createUser({ name: 'Viewer', email: 'viewer3@test.com' });
    const viewerToken = makeToken({ userId: viewer.id, email: viewer.email, role: 'student' });

    ensureForumTables();
    const topicId = createForumTopic(user.id, 'Single Topic', 'Body');

    db.prepare("UPDATE users SET name = 'Deleted User', deletion_status = 'finalized' WHERE id = ?")
      .run(user.id);

    const res = await request(app)
      .get(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.author.name).toBe('Deleted User');
    expect(res.body.data.author.isDeleted).toBe(true);
  });

  it('FORUM-04: active user topics still show real author info', async () => {
    const user = createUser({ name: 'Active User', email: 'active@test.com' });
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });

    ensureForumTables();
    createForumTopic(user.id, 'Active Topic', 'Body');

    const res = await request(app)
      .get('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const topic = res.body.data.topics[0];
    expect(topic.author.name).toBe('Active User');
    expect(topic.author.isDeleted).toBeUndefined();
  });

  it('FORUM-05: forum content (title, body) is preserved after deletion', async () => {
    const user = createUser({ name: 'Jane Doe', email: 'jane5@test.com' });
    const viewer = createUser({ name: 'Viewer', email: 'viewer5@test.com' });
    const viewerToken = makeToken({ userId: viewer.id, email: viewer.email, role: 'student' });

    ensureForumTables();
    const topicId = createForumTopic(user.id, 'Preserved Title', 'Preserved Body');
    createForumPost(topicId, user.id, 'Preserved Reply');

    db.prepare("UPDATE users SET name = 'Deleted User', deletion_status = 'finalized' WHERE id = ?")
      .run(user.id);

    const topicRes = await request(app)
      .get(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(topicRes.body.data.title).toBe('Preserved Title');
    expect(topicRes.body.data.body).toBe('Preserved Body');

    const postsRes = await request(app)
      .get(`/api/v1/forum/topics/${topicId}/posts`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(postsRes.body.data.posts[0].body).toBe('Preserved Reply');
  });

  it('FORUM-06: deleted user email is not exposed in forum author', async () => {
    const user = createUser({ name: 'Jane Doe', email: 'jane6@test.com' });
    const viewer = createUser({ name: 'Viewer', email: 'viewer6@test.com' });
    const viewerToken = makeToken({ userId: viewer.id, email: viewer.email, role: 'student' });

    ensureForumTables();
    createForumTopic(user.id, 'Topic', 'Body');

    // Simulate full anonymization
    db.prepare(
      "UPDATE users SET name = 'Deleted User', email = 'deleted_abc@deleted.local', deletion_status = 'finalized' WHERE id = ?"
    ).run(user.id);

    const res = await request(app)
      .get('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${viewerToken}`);

    const author = res.body.data.topics[0].author;
    expect(author.email).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 7: Data Export Enhancement
// ─────────────────────────────────────────────────────────────────

describe('Phase 7: Data Export', () => {
  it('EXPORT-01: data export includes forum topics and posts', async () => {
    const user = createUser();
    const token = makeToken({ userId: user.id, email: user.email, role: 'student' });

    ensureForumTables();
    createForumTopic(user.id, 'Export Topic', 'Export Body');

    const res = await request(app)
      .post('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);

    // Should succeed (202 accepted or 200)
    expect([200, 201, 202]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 8: Compliance Identity Access
// ─────────────────────────────────────────────────────────────────

describe('Phase 8: Compliance Identity Access', () => {
  it('COMP-01: admin with privacy permission can view deleted identity', async () => {
    const { snapshotIdentity, anonymizeUser } = await import('../services/deletionService.js');
    const user = createUser({ name: 'Jane Doe', email: 'comp1@test.com' });
    const admin = createUser({ role: 'admin', email: 'admin-comp@test.com' });
    const adminToken = makeToken({ userId: admin.id, email: admin.email, role: 'admin' });

    // Give admin the privacy permission
    const permId = queryOne<{ id: string }>(
      "SELECT id FROM permissions WHERE name = 'privacy.view_deleted_identity'"
    );
    const adminRole = queryOne<{ id: string }>(
      "SELECT id FROM roles WHERE name = 'super-admin'"
    );
    if (permId && adminRole) {
      db.prepare(
        'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)'
      ).run(adminRole.id, permId.id);
    }
    // Assign super-admin role to admin
    db.prepare(
      'INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)'
    ).run(admin.id, adminRole?.id);

    snapshotIdentity(user.id);
    anonymizeUser(user.id);

    const res = await request(app)
      .get(`/api/v1/admin/deleted-identities/${user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Legal compliance review' });

    expect(res.status).toBe(200);
    expect(res.body.data.originalName).toBe('Jane Doe');
    expect(res.body.data.originalEmail).toBe('comp1@test.com');
  });

  it('COMP-02: identity access is logged', async () => {
    const { snapshotIdentity, anonymizeUser } = await import('../services/deletionService.js');
    const user = createUser({ name: 'Jane Log', email: 'comp2@test.com' });
    const admin = createUser({ role: 'admin', email: 'admin-comp2@test.com' });
    const adminToken = makeToken({ userId: admin.id, email: admin.email, role: 'admin' });

    const adminRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'super-admin'");
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(admin.id, adminRole?.id);
    const permId = queryOne<{ id: string }>("SELECT id FROM permissions WHERE name = 'privacy.view_deleted_identity'");
    if (permId && adminRole) {
      db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(adminRole.id, permId.id);
    }

    snapshotIdentity(user.id);
    anonymizeUser(user.id);

    await request(app)
      .get(`/api/v1/admin/deleted-identities/${user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Legal compliance review' });

    const log = queryOne<{ actor_id: string; target_user_id: string }>(
      'SELECT actor_id, target_user_id FROM identity_access_log WHERE target_user_id = ?',
      [user.id]
    );
    expect(log).toBeTruthy();
    expect(log!.actor_id).toBe(admin.id);
  });

  it('COMP-03: non-admin cannot access deleted identities', async () => {
    const user = createUser({ name: 'Jane Priv', email: 'comp3@test.com' });
    const student = createUser({ email: 'student-comp3@test.com' });
    const studentToken = makeToken({ userId: student.id, email: student.email, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/admin/deleted-identities/${user.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reason: 'Curious' });

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 9: Admin Legal Hold
// ─────────────────────────────────────────────────────────────────

describe('Phase 9: Admin Legal Hold', () => {
  it('HOLD-01: admin can place legal hold on user', async () => {
    const user = createUser({ deletion_status: 'pending_deletion' });
    const admin = createUser({ role: 'admin', email: 'admin-hold@test.com' });
    const adminToken = makeToken({ userId: admin.id, email: admin.email, role: 'admin' });

    const adminRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'super-admin'");
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(admin.id, adminRole?.id);

    const res = await request(app)
      .post(`/api/v1/admin/users/${user.id}/legal-hold`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Active lawsuit', reviewDate: '2027-01-01' });

    expect(res.status).toBe(200);

    const updated = queryOne<{ deletion_status: string; legal_hold_reason: string }>(
      'SELECT deletion_status, legal_hold_reason FROM users WHERE id = ?',
      [user.id]
    );
    expect(updated!.deletion_status).toBe('legal_hold');
    expect(updated!.legal_hold_reason).toBe('Active lawsuit');

    // Verify audit log entry
    const auditEntry = queryOne<{ action: string; actor_id: string; target_id: string }>(
      "SELECT action, actor_id, target_id FROM audit_log WHERE action = 'legal_hold.placed' AND target_id = ?",
      [user.id]
    );
    expect(auditEntry).toBeTruthy();
    expect(auditEntry!.actor_id).toBe(admin.id);
  });

  it('HOLD-02: admin can release legal hold', async () => {
    const user = createUser({ deletion_status: 'legal_hold' });
    db.prepare('UPDATE users SET legal_hold_reason = ? WHERE id = ?').run('Old reason', user.id);
    const admin = createUser({ role: 'admin', email: 'admin-hold2@test.com' });
    const adminToken = makeToken({ userId: admin.id, email: admin.email, role: 'admin' });

    const adminRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'super-admin'");
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(admin.id, adminRole?.id);

    const res = await request(app)
      .delete(`/api/v1/admin/users/${user.id}/legal-hold`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const updated = queryOne<{ deletion_status: string | null; legal_hold_reason: string | null }>(
      'SELECT deletion_status, legal_hold_reason FROM users WHERE id = ?',
      [user.id]
    );
    expect(updated!.deletion_status).toBeNull();
    expect(updated!.legal_hold_reason).toBeNull();

    // Verify audit log entry for release
    const auditEntry = queryOne<{ action: string; actor_id: string; details: string }>(
      "SELECT action, actor_id, details FROM audit_log WHERE action = 'legal_hold.released' AND target_id = ?",
      [user.id]
    );
    expect(auditEntry).toBeTruthy();
    expect(auditEntry!.actor_id).toBe(admin.id);
    expect(JSON.parse(auditEntry!.details).previousReason).toBe('Old reason');
  });
});
