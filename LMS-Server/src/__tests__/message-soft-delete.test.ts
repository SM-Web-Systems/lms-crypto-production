/**
 * DM Soft-Delete — comprehensive TDD test suite.
 *
 * Phase 1: Schema & migration verification (soft-delete columns exist)
 * Phase 2: User self-delete (DEL-01 through DEL-06)
 * Phase 3: Admin delete (DEL-07 through DEL-10)
 * Phase 4: User-facing query with tombstones (DEL-11 through DEL-14)
 * Phase 5: Admin audit view (DEL-15 through DEL-18)
 * Phase 6: Integration / edge cases (INT-01 through INT-06)
 * Phase 7: Admin conversation list (ADM-LIST-01 through ADM-LIST-03)
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

function createConversation(user1Id: string, user2Id: string): string {
  const id = uuidv4();
  const [u1, u2] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
  db.prepare(
    `INSERT INTO conversations (id, user1_id, user2_id, updated_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(id, u1, u2);
  return id;
}

function createMessage(conversationId: string, senderId: string, body = 'Hello'): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO conversation_messages (id, conversation_id, sender_id, body, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(id, conversationId, senderId, body);
  return id;
}

function grantPermission(userId: string, permissionName: string) {
  // Find or create a custom role with the permission
  const perm = db.prepare('SELECT id FROM permissions WHERE name = ?').get(permissionName) as { id: string } | undefined;
  if (!perm) return;

  // Ensure user has a role that includes this permission
  const existingRole = db.prepare(
    `SELECT ur.role_id FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = ? AND p.name = ?`
  ).get(userId, permissionName) as { role_id: string } | undefined;

  if (!existingRole) {
    // Grant via admin role which has these permissions
    const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'super-admin'").get() as { id: string } | undefined;
    if (adminRole) {
      db.prepare(
        `INSERT OR IGNORE INTO user_roles (id, user_id, role_id) VALUES (?, ?, ?)`
      ).run(uuidv4(), userId, adminRole.id);
    }
  }
}

function makeAdminWithMessagePerms() {
  const admin = createUser({ role: 'admin', name: 'Admin User' });
  const token = makeToken({ userId: admin.id, email: admin.email, role: 'admin' as any });
  grantPermission(admin.id, 'message.delete_any');
  grantPermission(admin.id, 'message.view_deleted');
  return { ...admin, token };
}

// ─────────────────────────────────────────────────────────────────
// Phase 1: Schema & Migration
// ─────────────────────────────────────────────────────────────────

describe('Phase 1: Schema & Migration', () => {
  it('SCH-01: conversation_messages has is_deleted column', () => {
    const cols = db.prepare('PRAGMA table_info(conversation_messages)').all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('is_deleted');
  });

  it('SCH-02: conversation_messages has deleted_at column', () => {
    const cols = db.prepare('PRAGMA table_info(conversation_messages)').all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('deleted_at');
  });

  it('SCH-03: conversation_messages has deleted_by column', () => {
    const cols = db.prepare('PRAGMA table_info(conversation_messages)').all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('deleted_by');
  });

  it('SCH-04: conversation_messages has deletion_type column', () => {
    const cols = db.prepare('PRAGMA table_info(conversation_messages)').all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('deletion_type');
  });

  it('SCH-05: is_deleted defaults to 0 for new messages', () => {
    const u1 = createUser();
    const u2 = createUser();
    const convId = createConversation(u1.id, u2.id);
    const msgId = createMessage(convId, u1.id, 'default check');
    const row = db.prepare('SELECT is_deleted FROM conversation_messages WHERE id = ?').get(msgId) as { is_deleted: number };
    expect(row.is_deleted).toBe(0);
  });

  it('SCH-06: RBAC permissions for messaging exist', () => {
    const perms = db.prepare(
      `SELECT name FROM permissions WHERE name IN ('message.delete_own', 'message.delete_any', 'message.view_deleted')`
    ).all() as { name: string }[];
    const names = perms.map(p => p.name);
    expect(names).toContain('message.delete_own');
    expect(names).toContain('message.delete_any');
    expect(names).toContain('message.view_deleted');
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 2: User Self-Delete
// ─────────────────────────────────────────────────────────────────

describe('Phase 2: User Self-Delete', () => {
  let sender: ReturnType<typeof createUser>;
  let recipient: ReturnType<typeof createUser>;
  let senderToken: string;
  let recipientToken: string;
  let convId: string;

  beforeEach(() => {
    sender = createUser({ name: 'Sender' });
    recipient = createUser({ name: 'Recipient' });
    senderToken = makeToken({ userId: sender.id, email: sender.email, role: sender.role as any });
    recipientToken = makeToken({ userId: recipient.id, email: recipient.email, role: recipient.role as any });
    convId = createConversation(sender.id, recipient.id);
  });

  it('DEL-01: sender can delete their own message', async () => {
    const msgId = createMessage(convId, sender.id, 'secret message');

    const res = await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);

    // Verify DB state
    const row = db.prepare('SELECT is_deleted, deleted_at, deleted_by, deletion_type FROM conversation_messages WHERE id = ?').get(msgId) as any;
    expect(row.is_deleted).toBe(1);
    expect(row.deleted_at).toBeTruthy();
    expect(row.deleted_by).toBe(sender.id);
    expect(row.deletion_type).toBe('self_delete');
  });

  it('DEL-02: original body is preserved in DB after soft-delete', async () => {
    const msgId = createMessage(convId, sender.id, 'preserve me');

    await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    const row = db.prepare('SELECT body FROM conversation_messages WHERE id = ?').get(msgId) as { body: string };
    expect(row.body).toBe('preserve me');
  });

  it('DEL-03: recipient cannot delete sender\'s message', async () => {
    const msgId = createMessage(convId, sender.id, 'not yours');

    const res = await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${recipientToken}`);

    expect(res.status).toBe(403);
  });

  it('DEL-04: deleting non-existent message returns 404', async () => {
    const res = await request(app)
      .delete(`/api/v1/messages/messages/${uuidv4()}`)
      .set('Authorization', `Bearer ${senderToken}`);

    expect(res.status).toBe(404);
  });

  it('DEL-05: deleting already-deleted message returns 409', async () => {
    const msgId = createMessage(convId, sender.id, 'delete twice');

    await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    const res = await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    expect(res.status).toBe(409);
  });

  it('DEL-06: audit log entry created on self-delete', async () => {
    const msgId = createMessage(convId, sender.id, 'audit me');

    await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    const audit = db.prepare(
      `SELECT action, actor_id, target_id, details FROM audit_log
       WHERE action = 'message.deleted' AND target_id = ?`
    ).get(msgId) as any;

    expect(audit).toBeTruthy();
    expect(audit.actor_id).toBe(sender.id);
    expect(audit.target_id).toBe(msgId);
    const details = JSON.parse(audit.details);
    expect(details.conversation_id).toBe(convId);
    expect(details.deletion_type).toBe('self_delete');
  });

  it('DEL-06b: non-participant cannot delete a message', async () => {
    const outsider = createUser({ name: 'Outsider' });
    const outsiderToken = makeToken({ userId: outsider.id, email: outsider.email, role: outsider.role as any });
    const msgId = createMessage(convId, sender.id, 'no access');

    const res = await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });

  it('DEL-06c: unauthenticated request returns 401', async () => {
    const msgId = createMessage(convId, sender.id, 'no auth');

    const res = await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`);

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 3: Admin Delete
// ─────────────────────────────────────────────────────────────────

describe('Phase 3: Admin Delete', () => {
  let sender: ReturnType<typeof createUser>;
  let recipient: ReturnType<typeof createUser>;
  let convId: string;

  beforeEach(() => {
    sender = createUser({ name: 'Sender' });
    recipient = createUser({ name: 'Recipient' });
    convId = createConversation(sender.id, recipient.id);
  });

  it('DEL-07: admin with message.delete_any can delete any message', async () => {
    const admin = makeAdminWithMessagePerms();
    const msgId = createMessage(convId, sender.id, 'admin will delete');

    const res = await request(app)
      .delete(`/api/v1/messages/admin/messages/${msgId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const row = db.prepare('SELECT is_deleted, deleted_by, deletion_type FROM conversation_messages WHERE id = ?').get(msgId) as any;
    expect(row.is_deleted).toBe(1);
    expect(row.deleted_by).toBe(admin.id);
    expect(row.deletion_type).toBe('admin_delete');
  });

  it('DEL-08: non-admin cannot use admin delete endpoint', async () => {
    const student = createUser({ name: 'Student' });
    const studentToken = makeToken({ userId: student.id, email: student.email, role: 'student' as any });
    const msgId = createMessage(convId, sender.id, 'stay safe');

    const res = await request(app)
      .delete(`/api/v1/messages/admin/messages/${msgId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('DEL-09: admin delete creates audit log entry', async () => {
    const admin = makeAdminWithMessagePerms();
    const msgId = createMessage(convId, sender.id, 'audit admin delete');

    await request(app)
      .delete(`/api/v1/messages/admin/messages/${msgId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    const audit = db.prepare(
      `SELECT action, actor_id, target_id, details FROM audit_log
       WHERE action = 'message.admin_deleted' AND target_id = ?`
    ).get(msgId) as any;

    expect(audit).toBeTruthy();
    expect(audit.actor_id).toBe(admin.id);
    const details = JSON.parse(audit.details);
    expect(details.deletion_type).toBe('admin_delete');
    expect(details.sender_id).toBe(sender.id);
    expect(details.body_preview).toBeTruthy();
  });

  it('DEL-10: admin deleting already-deleted message returns 409', async () => {
    const admin = makeAdminWithMessagePerms();
    const msgId = createMessage(convId, sender.id, 'already gone');

    // First delete
    await request(app)
      .delete(`/api/v1/messages/admin/messages/${msgId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    // Second delete
    const res = await request(app)
      .delete(`/api/v1/messages/admin/messages/${msgId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 4: User-Facing Query with Tombstones
// ─────────────────────────────────────────────────────────────────

describe('Phase 4: User-Facing Query — Tombstones', () => {
  let sender: ReturnType<typeof createUser>;
  let recipient: ReturnType<typeof createUser>;
  let senderToken: string;
  let recipientToken: string;
  let convId: string;

  beforeEach(() => {
    sender = createUser({ name: 'Sender' });
    recipient = createUser({ name: 'Recipient' });
    senderToken = makeToken({ userId: sender.id, email: sender.email, role: sender.role as any });
    recipientToken = makeToken({ userId: recipient.id, email: recipient.email, role: recipient.role as any });
    convId = createConversation(sender.id, recipient.id);
  });

  it('DEL-11: deleted message shows null body in conversation view', async () => {
    const msg1Id = createMessage(convId, sender.id, 'visible message');
    const msg2Id = createMessage(convId, sender.id, 'secret to delete');

    // Delete msg2
    await request(app)
      .delete(`/api/v1/messages/messages/${msg2Id}`)
      .set('Authorization', `Bearer ${senderToken}`);

    // Fetch conversation messages as sender
    const res = await request(app)
      .get(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${senderToken}`);

    expect(res.status).toBe(200);
    const messages = res.body.data.messages;
    expect(messages).toHaveLength(2);

    const visible = messages.find((m: any) => m.id === msg1Id);
    const deleted = messages.find((m: any) => m.id === msg2Id);

    expect(visible.body).toBe('visible message');
    expect(visible.isDeleted).toBe(false);

    expect(deleted.body).toBeNull();
    expect(deleted.isDeleted).toBe(true);
  });

  it('DEL-12: recipient also sees tombstone (null body)', async () => {
    const msgId = createMessage(convId, sender.id, 'hidden from recipient');

    await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    const res = await request(app)
      .get(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${recipientToken}`);

    const msg = res.body.data.messages.find((m: any) => m.id === msgId);
    expect(msg.body).toBeNull();
    expect(msg.isDeleted).toBe(true);
  });

  it('DEL-13: deleted messages do NOT expose deletion metadata to normal users', async () => {
    const msgId = createMessage(convId, sender.id, 'no metadata leak');

    await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    const res = await request(app)
      .get(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${senderToken}`);

    const msg = res.body.data.messages.find((m: any) => m.id === msgId);
    expect(msg.deletedAt).toBeUndefined();
    expect(msg.deletedBy).toBeUndefined();
    expect(msg.deletionType).toBeUndefined();
  });

  it('DEL-14: non-deleted messages are unchanged', async () => {
    const msgId = createMessage(convId, sender.id, 'I am normal');

    const res = await request(app)
      .get(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${senderToken}`);

    const msg = res.body.data.messages.find((m: any) => m.id === msgId);
    expect(msg.body).toBe('I am normal');
    expect(msg.isDeleted).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 5: Admin Audit View
// ─────────────────────────────────────────────────────────────────

describe('Phase 5: Admin Audit View', () => {
  let sender: ReturnType<typeof createUser>;
  let recipient: ReturnType<typeof createUser>;
  let senderToken: string;
  let convId: string;

  beforeEach(() => {
    sender = createUser({ name: 'Sender' });
    recipient = createUser({ name: 'Recipient' });
    senderToken = makeToken({ userId: sender.id, email: sender.email, role: sender.role as any });
    convId = createConversation(sender.id, recipient.id);
  });

  it('DEL-15: admin can view full content of deleted messages', async () => {
    const admin = makeAdminWithMessagePerms();
    const msgId = createMessage(convId, sender.id, 'original secret text');

    // Delete the message
    await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    // Admin fetches conversation
    const res = await request(app)
      .get(`/api/v1/messages/admin/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    const msg = res.body.data.messages.find((m: any) => m.id === msgId);
    expect(msg.body).toBe('original secret text');
    expect(msg.isDeleted).toBe(true);
    expect(msg.deletedAt).toBeTruthy();
    expect(msg.deletedBy).toBe(sender.id);
    expect(msg.deletionType).toBe('self_delete');
  });

  it('DEL-16: admin view includes sender identity', async () => {
    const admin = makeAdminWithMessagePerms();
    const msgId = createMessage(convId, sender.id, 'who sent this');

    const res = await request(app)
      .get(`/api/v1/messages/admin/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${admin.token}`);

    const msg = res.body.data.messages.find((m: any) => m.id === msgId);
    expect(msg.senderName).toBe('Sender');
    expect(msg.senderEmail).toBe(sender.email);
  });

  it('DEL-17: non-admin cannot access admin audit view', async () => {
    const student = createUser({ name: 'Student' });
    const studentToken = makeToken({ userId: student.id, email: student.email, role: 'student' as any });

    const res = await request(app)
      .get(`/api/v1/messages/admin/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('DEL-18: admin view recovers identity for anonymized users', async () => {
    const admin = makeAdminWithMessagePerms();
    const msgId = createMessage(convId, sender.id, 'before anonymization');

    // Snapshot identity then anonymize
    db.prepare(
      `INSERT INTO deleted_user_identities (user_id, original_name, original_email, snapshot_at, retention_expires_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now', '+7 years'))`
    ).run(sender.id, sender.name, sender.email);

    db.prepare(`UPDATE users SET name = 'Deleted User', email = 'deleted@deleted.local' WHERE id = ?`)
      .run(sender.id);

    // Delete the message
    db.prepare(
      `UPDATE conversation_messages SET is_deleted = 1, deleted_at = datetime('now'),
       deleted_by = ?, deletion_type = 'account_deletion' WHERE id = ?`
    ).run(sender.id, msgId);

    const res = await request(app)
      .get(`/api/v1/messages/admin/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${admin.token}`);

    const msg = res.body.data.messages.find((m: any) => m.id === msgId);
    expect(msg.body).toBe('before anonymization');
    expect(msg.senderName).toBe('Deleted User'); // Current name
    expect(msg.originalSenderName).toBe(sender.name); // Recovered identity
    expect(msg.originalSenderEmail).toBe(sender.email);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 6: Integration / Edge Cases
// ─────────────────────────────────────────────────────────────────

describe('Phase 6: Integration & Edge Cases', () => {
  let sender: ReturnType<typeof createUser>;
  let recipient: ReturnType<typeof createUser>;
  let senderToken: string;
  let recipientToken: string;
  let convId: string;

  beforeEach(() => {
    sender = createUser({ name: 'Sender' });
    recipient = createUser({ name: 'Recipient' });
    senderToken = makeToken({ userId: sender.id, email: sender.email, role: sender.role as any });
    recipientToken = makeToken({ userId: recipient.id, email: recipient.email, role: recipient.role as any });
    convId = createConversation(sender.id, recipient.id);
  });

  it('INT-01: delete → re-fetch shows tombstone in correct position', async () => {
    const msg1Id = createMessage(convId, sender.id, 'first');
    const msg2Id = createMessage(convId, recipient.id, 'second');
    const msg3Id = createMessage(convId, sender.id, 'third');

    // Delete middle message (recipient's)
    await request(app)
      .delete(`/api/v1/messages/messages/${msg2Id}`)
      .set('Authorization', `Bearer ${recipientToken}`);

    const res = await request(app)
      .get(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${senderToken}`);

    const messages = res.body.data.messages;
    expect(messages).toHaveLength(3);
    expect(messages[0].body).toBe('first');
    expect(messages[1].body).toBeNull();
    expect(messages[1].isDeleted).toBe(true);
    expect(messages[2].body).toBe('third');
  });

  it('INT-02: deleting all messages leaves conversation with all tombstones', async () => {
    const msg1Id = createMessage(convId, sender.id, 'a');
    const msg2Id = createMessage(convId, sender.id, 'b');

    await request(app)
      .delete(`/api/v1/messages/messages/${msg1Id}`)
      .set('Authorization', `Bearer ${senderToken}`);
    await request(app)
      .delete(`/api/v1/messages/messages/${msg2Id}`)
      .set('Authorization', `Bearer ${senderToken}`);

    const res = await request(app)
      .get(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${senderToken}`);

    const messages = res.body.data.messages;
    expect(messages).toHaveLength(2);
    expect(messages.every((m: any) => m.isDeleted === true && m.body === null)).toBe(true);
  });

  it('INT-03: soft-deleted messages preserve original body in DB', async () => {
    const msgId = createMessage(convId, sender.id, 'preserved body');

    await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    // Verify body still exists in raw DB row
    const row = db.prepare('SELECT body, is_deleted FROM conversation_messages WHERE id = ?').get(msgId) as any;
    expect(row.body).toBe('preserved body');
    expect(row.is_deleted).toBe(1);

    // Verify API hides it
    const res = await request(app)
      .get(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${recipientToken}`);

    const msg = res.body.data.messages.find((m: any) => m.id === msgId);
    expect(msg.body).toBeNull();
    expect(msg.isDeleted).toBe(true);
  });

  it('INT-04: concurrent delete (second request) returns 409', async () => {
    const msgId = createMessage(convId, sender.id, 'race condition');

    // Both requests from sender
    const [res1, res2] = await Promise.all([
      request(app)
        .delete(`/api/v1/messages/messages/${msgId}`)
        .set('Authorization', `Bearer ${senderToken}`),
      request(app)
        .delete(`/api/v1/messages/messages/${msgId}`)
        .set('Authorization', `Bearer ${senderToken}`),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('INT-05: message ordering is preserved after deletions', async () => {
    // Create messages with slight time gaps
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(createMessage(convId, sender.id, `msg-${i}`));
    }

    // Delete messages 1 and 3
    await request(app)
      .delete(`/api/v1/messages/messages/${ids[1]}`)
      .set('Authorization', `Bearer ${senderToken}`);
    await request(app)
      .delete(`/api/v1/messages/messages/${ids[3]}`)
      .set('Authorization', `Bearer ${senderToken}`);

    const res = await request(app)
      .get(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${senderToken}`);

    const messages = res.body.data.messages;
    expect(messages).toHaveLength(5);
    expect(messages[0].body).toBe('msg-0');
    expect(messages[1].isDeleted).toBe(true);
    expect(messages[2].body).toBe('msg-2');
    expect(messages[3].isDeleted).toBe(true);
    expect(messages[4].body).toBe('msg-4');
  });

  it('INT-06: admin single-message audit endpoint returns full details', async () => {
    const admin = makeAdminWithMessagePerms();
    const msgId = createMessage(convId, sender.id, 'audit single');

    await request(app)
      .delete(`/api/v1/messages/messages/${msgId}`)
      .set('Authorization', `Bearer ${senderToken}`);

    const res = await request(app)
      .get(`/api/v1/messages/admin/messages/${msgId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message.body).toBe('audit single');
    expect(res.body.data.message.isDeleted).toBe(true);
    expect(res.body.data.message.deletedBy).toBe(sender.id);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 7: Admin Conversation List
// ─────────────────────────────────────────────────────────────────

describe('Phase 7: Admin conversation list', () => {
  let adminToken: string;
  let aliceToken: string;
  let convId: string;

  beforeEach(() => {
    const admin = makeAdminWithMessagePerms();
    adminToken = admin.token;

    const alice = createUser({ name: 'Alice' });
    aliceToken = makeToken({ userId: alice.id, email: alice.email, role: alice.role as any });

    const bob = createUser({ name: 'Bob' });
    convId = createConversation(alice.id, bob.id);
    createMessage(convId, alice.id, 'hello');
    createMessage(convId, bob.id, 'world');
  });

  it('ADM-LIST-01: admin can list all conversations with counts', async () => {
    const res = await request(app)
      .get('/api/v1/messages/admin/conversations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.conversations).toBeInstanceOf(Array);
    // Should include the conversation from earlier tests
    const conv = res.body.data.conversations.find((c: any) => c.id === convId);
    expect(conv).toBeTruthy();
    expect(conv.participantIds).toHaveLength(2);
    expect(conv.participantNames).toHaveLength(2);
    expect(typeof conv.messageCount).toBe('number');
    expect(typeof conv.deletedMessageCount).toBe('number');
  });

  it('ADM-LIST-02: non-admin cannot list conversations (403)', async () => {
    const res = await request(app)
      .get('/api/v1/messages/admin/conversations')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(403);
  });

  it('ADM-LIST-03: unauthenticated request returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/messages/admin/conversations');
    expect(res.status).toBe(401);
  });
});
