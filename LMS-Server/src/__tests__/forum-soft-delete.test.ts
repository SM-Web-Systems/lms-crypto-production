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
