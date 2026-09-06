/**
 * Forum Soft-Delete — comprehensive TDD test suite.
 *
 * Phase 1: Schema & migration verification
 * Phase 2: User self-delete (DEL-F01 through DEL-F08)
 * Phase 3: Moderator delete (MOD-F01 through MOD-F06)
 * Phase 4: Tombstone rendering (TOMB-F01 through TOMB-F05)
 * Phase 5: Reply blocking (BLOCK-F01)
 * Phase 6: Admin audit view (AUDIT-F01 through AUDIT-F04)
 * Phase 7: Regression (REG-F01 through REG-F03)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, queryOne, execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

// ── helpers ───────────────────────────────────────────────────────

function createUser(overrides: Partial<{
  id: string;
  name: string;
  email: string;
  role: string;
}> = {}) {
  const id = overrides.id ?? uuidv4();
  const name = overrides.name ?? 'Test User';
  const email = overrides.email ?? `user-${id}@test.com`;
  const role = overrides.role ?? 'student';
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, name, email, HASH, role);
  return { id, name, email, role };
}

function createTopic(authorId: string, overrides: Partial<{
  id: string;
  title: string;
  body: string;
  courseId: string | null;
}> = {}): string {
  const id = overrides.id ?? uuidv4();
  const title = overrides.title ?? 'Test Topic';
  const body = overrides.body ?? 'Test body content';
  const courseId = overrides.courseId ?? null;
  db.prepare(
    `INSERT INTO forum_topics (id, title, body, author_id, course_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, title, body, authorId, courseId);
  return id;
}

function createPost(topicId: string, authorId: string, overrides: Partial<{
  id: string;
  body: string;
}> = {}): string {
  const id = overrides.id ?? uuidv4();
  const body = overrides.body ?? 'Test reply';
  db.prepare(
    `INSERT INTO forum_posts (id, topic_id, body, author_id)
     VALUES (?, ?, ?, ?)`
  ).run(id, topicId, body, authorId);
  return id;
}

function grantPermission(userId: string, permissionName: string) {
  const perm = db.prepare('SELECT id FROM permissions WHERE name = ?').get(permissionName) as { id: string } | undefined;
  if (!perm) return;
  const existingRole = db.prepare(
    `SELECT ur.role_id FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = ? AND p.name = ?`
  ).get(userId, permissionName) as { role_id: string } | undefined;
  if (!existingRole) {
    const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'super-admin'").get() as { id: string } | undefined;
    if (adminRole) {
      db.prepare(
        `INSERT OR IGNORE INTO user_roles (id, user_id, role_id) VALUES (?, ?, ?)`
      ).run(uuidv4(), userId, adminRole.id);
    }
  }
}

function makeModeratorWithPerms() {
  const mod = createUser({ role: 'admin', name: 'Moderator User' });
  const token = makeToken({ userId: mod.id, email: mod.email, role: 'admin' as any });
  grantPermission(mod.id, 'forum.moderate');
  grantPermission(mod.id, 'forum.view_deleted');
  return { ...mod, token };
}

// ─────────────────────────────────────────────────────────────────
// Phase 1: Schema & Migration
// ─────────────────────────────────────────────────────────────────

describe('Phase 1: Schema & Migration', () => {
  it('SCH-F01: forum_topics has soft-delete columns', () => {
    const cols = db.prepare('PRAGMA table_info(forum_topics)').all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('is_deleted');
    expect(colNames).toContain('deleted_at');
    expect(colNames).toContain('deleted_by');
    expect(colNames).toContain('deletion_type');
  });

  it('SCH-F02: forum_posts has soft-delete columns', () => {
    const cols = db.prepare('PRAGMA table_info(forum_posts)').all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('is_deleted');
    expect(colNames).toContain('deleted_at');
    expect(colNames).toContain('deleted_by');
    expect(colNames).toContain('deletion_type');
  });

  it('SCH-F03: is_deleted defaults to 0 for new topics and posts', () => {
    const user = createUser();
    const topicId = createTopic(user.id);
    const postId = createPost(topicId, user.id);

    const topic = db.prepare('SELECT is_deleted FROM forum_topics WHERE id = ?').get(topicId) as { is_deleted: number };
    const post = db.prepare('SELECT is_deleted FROM forum_posts WHERE id = ?').get(postId) as { is_deleted: number };
    expect(topic.is_deleted).toBe(0);
    expect(post.is_deleted).toBe(0);
  });

  it('SCH-F04: forum.view_deleted RBAC permission exists', () => {
    const perm = db.prepare(
      `SELECT name FROM permissions WHERE name = 'forum.view_deleted'`
    ).get() as { name: string } | undefined;
    expect(perm).toBeTruthy();
    expect(perm!.name).toBe('forum.view_deleted');
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 2: User Self-Delete
// ─────────────────────────────────────────────────────────────────

describe('Phase 2: User Self-Delete', () => {
  let author: ReturnType<typeof createUser>;
  let other: ReturnType<typeof createUser>;
  let authorToken: string;
  let otherToken: string;

  beforeEach(() => {
    author = createUser({ name: 'Author' });
    other = createUser({ name: 'Other' });
    authorToken = makeToken({ userId: author.id, email: author.email, role: author.role as any });
    otherToken = makeToken({ userId: other.id, email: other.email, role: other.role as any });
  });

  it('DEL-F01: author can delete their own topic', async () => {
    const topicId = createTopic(author.id, { title: 'My Topic', body: 'My body' });

    const res = await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);

    const row = db.prepare('SELECT is_deleted, deleted_at, deleted_by, deletion_type FROM forum_topics WHERE id = ?').get(topicId) as any;
    expect(row.is_deleted).toBe(1);
    expect(row.deleted_at).toBeTruthy();
    expect(row.deleted_by).toBe(author.id);
    expect(row.deletion_type).toBe('self_delete');
  });

  it('DEL-F02: author can delete their own post', async () => {
    const topicId = createTopic(other.id);
    const postId = createPost(topicId, author.id, { body: 'My reply' });

    const res = await request(app)
      .delete(`/api/v1/forum/posts/${postId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);

    const row = db.prepare('SELECT is_deleted, deleted_at, deleted_by, deletion_type FROM forum_posts WHERE id = ?').get(postId) as any;
    expect(row.is_deleted).toBe(1);
    expect(row.deleted_at).toBeTruthy();
    expect(row.deleted_by).toBe(author.id);
    expect(row.deletion_type).toBe('self_delete');
  });

  it('DEL-F03: non-author cannot delete another user\'s topic', async () => {
    const topicId = createTopic(author.id);

    const res = await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });

  it('DEL-F04: non-author cannot delete another user\'s post', async () => {
    const topicId = createTopic(author.id);
    const postId = createPost(topicId, author.id);

    const res = await request(app)
      .delete(`/api/v1/forum/posts/${postId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });

  it('DEL-F05: deleting already-deleted topic returns 409', async () => {
    const topicId = createTopic(author.id);

    await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const res = await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    expect(res.status).toBe(409);
  });

  it('DEL-F06: deleting non-existent topic returns 404', async () => {
    const res = await request(app)
      .delete(`/api/v1/forum/topics/${uuidv4()}`)
      .set('Authorization', `Bearer ${authorToken}`);

    expect(res.status).toBe(404);
  });

  it('DEL-F07: unauthenticated delete returns 401', async () => {
    const topicId = createTopic(author.id);

    const res = await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`);

    expect(res.status).toBe(401);
  });

  it('DEL-F08: topic self-delete cascades to all posts', async () => {
    const topicId = createTopic(author.id);
    const post1Id = createPost(topicId, other.id, { body: 'Reply 1' });
    const post2Id = createPost(topicId, other.id, { body: 'Reply 2' });
    const post3Id = createPost(topicId, author.id, { body: 'Reply 3' });

    const res = await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cascadedPosts).toBe(3);

    // Verify all posts are soft-deleted with topic_cascade
    for (const postId of [post1Id, post2Id, post3Id]) {
      const row = db.prepare('SELECT is_deleted, deleted_by, deletion_type FROM forum_posts WHERE id = ?').get(postId) as any;
      expect(row.is_deleted).toBe(1);
      expect(row.deleted_by).toBe(author.id);
      expect(row.deletion_type).toBe('topic_cascade');
    }
  });

  it('DEL-F08b: topic cascade only affects non-deleted posts', async () => {
    const topicId = createTopic(author.id);
    const post1Id = createPost(topicId, author.id, { body: 'Already deleted' });
    const post2Id = createPost(topicId, other.id, { body: 'Still live' });

    // Pre-delete post1
    db.prepare(
      `UPDATE forum_posts SET is_deleted = 1, deleted_at = datetime('now'),
       deleted_by = ?, deletion_type = 'self_delete' WHERE id = ?`
    ).run(author.id, post1Id);

    const res = await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cascadedPosts).toBe(1); // Only post2 cascaded

    // post1 retains its original deletion_type
    const row1 = db.prepare('SELECT deletion_type FROM forum_posts WHERE id = ?').get(post1Id) as any;
    expect(row1.deletion_type).toBe('self_delete');
  });

  it('DEL-F08c: original body is preserved in DB after soft-delete', async () => {
    const topicId = createTopic(author.id, { title: 'Preserve Title', body: 'Preserve Body' });

    await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const row = db.prepare('SELECT title, body FROM forum_topics WHERE id = ?').get(topicId) as any;
    expect(row.title).toBe('Preserve Title');
    expect(row.body).toBe('Preserve Body');
  });

  it('DEL-F08d: audit log entry created on topic self-delete', async () => {
    const topicId = createTopic(author.id, { title: 'Audit Me' });

    await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const audit = db.prepare(
      `SELECT action, actor_id, target_id, details FROM audit_log
       WHERE action = 'forum_topic.deleted' AND target_id = ?`
    ).get(topicId) as any;

    expect(audit).toBeTruthy();
    expect(audit.actor_id).toBe(author.id);
    const details = JSON.parse(audit.details);
    expect(details.deletion_type).toBe('self_delete');
    expect(details.title_length).toBe('Audit Me'.length);
    // Must NOT contain raw title or body
    expect(details.title).toBeUndefined();
    expect(details.body).toBeUndefined();
  });

  it('DEL-F08e: audit log entry created on post self-delete', async () => {
    const topicId = createTopic(other.id);
    const postId = createPost(topicId, author.id, { body: 'Audit post' });

    await request(app)
      .delete(`/api/v1/forum/posts/${postId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const audit = db.prepare(
      `SELECT action, actor_id, target_id, details FROM audit_log
       WHERE action = 'forum_post.deleted' AND target_id = ?`
    ).get(postId) as any;

    expect(audit).toBeTruthy();
    expect(audit.actor_id).toBe(author.id);
    const details = JSON.parse(audit.details);
    expect(details.deletion_type).toBe('self_delete');
    expect(details.topic_id).toBe(topicId);
    expect(details.body_length).toBe('Audit post'.length);
  });

  it('DEL-F08f: deleting a post does not affect parent topic', async () => {
    const topicId = createTopic(author.id);
    const postId = createPost(topicId, author.id);

    await request(app)
      .delete(`/api/v1/forum/posts/${postId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const topic = db.prepare('SELECT is_deleted FROM forum_topics WHERE id = ?').get(topicId) as any;
    expect(topic.is_deleted).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 3: Moderator Delete
// ─────────────────────────────────────────────────────────────────

describe('Phase 3: Moderator Delete', () => {
  let author: ReturnType<typeof createUser>;
  let authorToken: string;

  beforeEach(() => {
    author = createUser({ name: 'Author' });
    authorToken = makeToken({ userId: author.id, email: author.email, role: author.role as any });
  });

  it('MOD-F01: moderator can delete any topic', async () => {
    const mod = makeModeratorWithPerms();
    const topicId = createTopic(author.id, { title: 'Remove Me', body: 'Bad content' });

    const res = await request(app)
      .delete(`/api/v1/forum/admin/topics/${topicId}`)
      .set('Authorization', `Bearer ${mod.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const row = db.prepare('SELECT is_deleted, deleted_by, deletion_type FROM forum_topics WHERE id = ?').get(topicId) as any;
    expect(row.is_deleted).toBe(1);
    expect(row.deleted_by).toBe(mod.id);
    expect(row.deletion_type).toBe('moderator_delete');
  });

  it('MOD-F02: moderator can delete any post', async () => {
    const mod = makeModeratorWithPerms();
    const topicId = createTopic(author.id);
    const postId = createPost(topicId, author.id, { body: 'Offensive reply' });

    const res = await request(app)
      .delete(`/api/v1/forum/admin/posts/${postId}`)
      .set('Authorization', `Bearer ${mod.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const row = db.prepare('SELECT is_deleted, deleted_by, deletion_type FROM forum_posts WHERE id = ?').get(postId) as any;
    expect(row.is_deleted).toBe(1);
    expect(row.deleted_by).toBe(mod.id);
    expect(row.deletion_type).toBe('moderator_delete');
  });

  it('MOD-F03: non-moderator cannot use admin delete endpoints', async () => {
    const student = createUser({ name: 'Student' });
    const studentToken = makeToken({ userId: student.id, email: student.email, role: 'student' as any });
    const topicId = createTopic(author.id);

    const res = await request(app)
      .delete(`/api/v1/forum/admin/topics/${topicId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('MOD-F04: moderator topic delete cascades to all posts', async () => {
    const mod = makeModeratorWithPerms();
    const topicId = createTopic(author.id);
    const post1Id = createPost(topicId, author.id, { body: 'Reply 1' });
    const post2Id = createPost(topicId, author.id, { body: 'Reply 2' });

    const res = await request(app)
      .delete(`/api/v1/forum/admin/topics/${topicId}`)
      .set('Authorization', `Bearer ${mod.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cascadedPosts).toBe(2);

    for (const postId of [post1Id, post2Id]) {
      const row = db.prepare('SELECT is_deleted, deleted_by, deletion_type FROM forum_posts WHERE id = ?').get(postId) as any;
      expect(row.is_deleted).toBe(1);
      expect(row.deleted_by).toBe(mod.id);
      expect(row.deletion_type).toBe('topic_cascade');
    }
  });

  it('MOD-F05: moderator delete creates audit log with body_length', async () => {
    const mod = makeModeratorWithPerms();
    const topicId = createTopic(author.id, { title: 'Audit This', body: 'Bad content here' });

    await request(app)
      .delete(`/api/v1/forum/admin/topics/${topicId}`)
      .set('Authorization', `Bearer ${mod.token}`);

    const audit = db.prepare(
      `SELECT action, actor_id, target_id, details FROM audit_log
       WHERE action = 'forum_topic.moderated' AND target_id = ?`
    ).get(topicId) as any;

    expect(audit).toBeTruthy();
    expect(audit.actor_id).toBe(mod.id);
    const details = JSON.parse(audit.details);
    expect(details.deletion_type).toBe('moderator_delete');
    expect(details.author_id).toBe(author.id);
    expect(details.title_length).toBe('Audit This'.length);
    expect(details.body_length).toBe('Bad content here'.length);
    // Must NOT contain raw content
    expect(details.title).toBeUndefined();
    expect(details.body).toBeUndefined();
  });

  it('MOD-F06: moderator deleting already-deleted topic returns 409', async () => {
    const mod = makeModeratorWithPerms();
    const topicId = createTopic(author.id);

    await request(app)
      .delete(`/api/v1/forum/admin/topics/${topicId}`)
      .set('Authorization', `Bearer ${mod.token}`);

    const res = await request(app)
      .delete(`/api/v1/forum/admin/topics/${topicId}`)
      .set('Authorization', `Bearer ${mod.token}`);

    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 4: Tombstone Rendering
// ─────────────────────────────────────────────────────────────────

describe('Phase 4: Tombstone Rendering', () => {
  let author: ReturnType<typeof createUser>;
  let viewer: ReturnType<typeof createUser>;
  let authorToken: string;
  let viewerToken: string;

  beforeEach(() => {
    author = createUser({ name: 'Author' });
    viewer = createUser({ name: 'Viewer' });
    authorToken = makeToken({ userId: author.id, email: author.email, role: author.role as any });
    viewerToken = makeToken({ userId: viewer.id, email: viewer.email, role: viewer.role as any });
  });

  it('TOMB-F01: deleted topic shows null title/body + isDeleted in topic list', async () => {
    const topicId = createTopic(author.id, { title: 'Secret Title', body: 'Secret Body' });
    const liveTopicId = createTopic(author.id, { title: 'Visible Topic', body: 'Visible Body' });

    // Delete the first topic
    await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const res = await request(app)
      .get('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const topics = res.body.data.topics;
    expect(topics.length).toBeGreaterThanOrEqual(2);

    const deleted = topics.find((t: any) => t.id === topicId);
    expect(deleted).toBeTruthy();
    expect(deleted.title).toBeNull();
    expect(deleted.body).toBeNull();
    expect(deleted.isDeleted).toBe(true);

    const live = topics.find((t: any) => t.id === liveTopicId);
    expect(live.title).toBe('Visible Topic');
    expect(live.body).toBe('Visible Body');
    expect(live.isDeleted).toBeUndefined();
  });

  it('TOMB-F02: deleted post shows null body + isDeleted in post list', async () => {
    const topicId = createTopic(author.id);
    const post1Id = createPost(topicId, author.id, { body: 'Visible reply' });
    const post2Id = createPost(topicId, author.id, { body: 'Secret reply' });

    await request(app)
      .delete(`/api/v1/forum/posts/${post2Id}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const res = await request(app)
      .get(`/api/v1/forum/topics/${topicId}/posts`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const posts = res.body.data.posts;

    const visible = posts.find((p: any) => p.id === post1Id);
    expect(visible.body).toBe('Visible reply');
    expect(visible.isDeleted).toBeUndefined();

    const deleted = posts.find((p: any) => p.id === post2Id);
    expect(deleted.body).toBeNull();
    expect(deleted.isDeleted).toBe(true);
  });

  it('TOMB-F03: normal users do NOT see deletion metadata', async () => {
    const topicId = createTopic(author.id);
    const postId = createPost(topicId, author.id, { body: 'No metadata leak' });

    await request(app)
      .delete(`/api/v1/forum/posts/${postId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const res = await request(app)
      .get(`/api/v1/forum/topics/${topicId}/posts`)
      .set('Authorization', `Bearer ${viewerToken}`);

    const post = res.body.data.posts.find((p: any) => p.id === postId);
    expect(post.deletedAt).toBeUndefined();
    expect(post.deletedBy).toBeUndefined();
  });

  it('TOMB-F04: normal GET for deleted topic returns 404', async () => {
    const topicId = createTopic(author.id);

    await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const res = await request(app)
      .get(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(404);
  });

  it('TOMB-F05: postCount excludes deleted posts', async () => {
    const topicId = createTopic(author.id);
    createPost(topicId, author.id, { body: 'Live post' });
    const deletedPostId = createPost(topicId, author.id, { body: 'Dead post' });

    // Soft-delete one post
    db.prepare(
      `UPDATE forum_posts SET is_deleted = 1, deleted_at = datetime('now'),
       deleted_by = ?, deletion_type = 'self_delete' WHERE id = ?`
    ).run(author.id, deletedPostId);

    const res = await request(app)
      .get('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${viewerToken}`);

    const topic = res.body.data.topics.find((t: any) => t.id === topicId);
    expect(topic.postCount).toBe(1); // Only 1 live post
  });

  it('TOMB-F05b: non-deleted topics retain prior response shape', async () => {
    const topicId = createTopic(author.id, { title: 'Normal Topic', body: 'Normal Body' });

    const res = await request(app)
      .get(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Normal Topic');
    expect(res.body.data.body).toBe('Normal Body');
    expect(res.body.data.isDeleted).toBeUndefined();
    expect(res.body.data.deletionType).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 5: Reply Blocking
// ─────────────────────────────────────────────────────────────────

describe('Phase 5: Reply Blocking', () => {
  let author: ReturnType<typeof createUser>;
  let replier: ReturnType<typeof createUser>;
  let authorToken: string;
  let replierToken: string;

  beforeEach(() => {
    author = createUser({ name: 'Author' });
    replier = createUser({ name: 'Replier' });
    authorToken = makeToken({ userId: author.id, email: author.email, role: author.role as any });
    replierToken = makeToken({ userId: replier.id, email: replier.email, role: replier.role as any });
  });

  it('BLOCK-F01: POST to deleted topic returns 403', async () => {
    const topicId = createTopic(author.id);

    await request(app)
      .delete(`/api/v1/forum/topics/${topicId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    const res = await request(app)
      .post(`/api/v1/forum/topics/${topicId}/posts`)
      .set('Authorization', `Bearer ${replierToken}`)
      .send({ body: 'Trying to reply' });

    expect(res.status).toBe(403);
  });

  it('BLOCK-F01b: POST to non-deleted topic still works', async () => {
    const topicId = createTopic(author.id);

    const res = await request(app)
      .post(`/api/v1/forum/topics/${topicId}/posts`)
      .set('Authorization', `Bearer ${replierToken}`)
      .send({ body: 'Valid reply' });

    expect(res.status).toBe(201);
  });
});
