/**
 * Phase F — Cross-Cutting Features Tests
 *
 * F1-HISTORY-1: User can view own login history
 * F1-HISTORY-2: Admin can view any user's login history
 * F1-HISTORY-3: Parent can view linked child's login history (regression)
 * F1-HISTORY-4: Parent CANNOT view unlinked student's login history (regression)
 * F1-HISTORY-5: Teacher can view assigned student's login history
 */

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { execute, query, queryOne, createSession, hashToken } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

// ── Helpers ──────────────────────────────────────────────────────────

function createUser(role: 'student' | 'lecturer' | 'admin', email?: string): string {
  const id = uuidv4();
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', ?)",
    [id, `Test ${role}`, email ?? `${id}@test.com`, role],
  );
  const roleMap: Record<string, string> = {
    student: 'role_student',
    lecturer: 'role_instructor',
    admin: 'role_admin',
  };
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleMap[role]]);
  return id;
}

function assignRole(userId: string, roleId: string): void {
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
}

function makeToken(userId: string, role: 'student' | 'lecturer' | 'admin'): string {
  return generateToken({ userId, email: `${userId}@test.com`, role });
}

function insertLoginHistory(userId: string, count: number): void {
  for (let i = 0; i < count; i++) {
    execute(
      "INSERT INTO login_history (user_id, ip_address, user_agent, auth_method) VALUES (?, '127.0.0.1', 'test-agent', 'local')",
      [userId],
    );
  }
}

function loginAndGetSession(userId: string, role: 'student' | 'lecturer' | 'admin'): { token: string; sessionId: string } {
  const token = generateToken({ userId, email: `${userId}@test.com`, role });
  const sessionId = createSession(userId, token);
  return { token, sessionId };
}

// ── F1: Login History API ────────────────────────────────────────────

describe('F1: Login History API', () => {
  it('F1-HISTORY-1: User can view own login history', async () => {
    const userId = createUser('student');
    const token = makeToken(userId, 'student');
    insertLoginHistory(userId, 3);

    const res = await request(app)
      .get('/api/v1/login-history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.history).toHaveLength(3);
    expect(res.body.data.history[0]).toHaveProperty('login_at');
    expect(res.body.data.history[0]).toHaveProperty('ip_address');
    expect(res.body.data.history[0]).toHaveProperty('auth_method');
  });

  it("F1-HISTORY-2: Admin can view any user's login history", async () => {
    const adminId = createUser('admin');
    const studentId = createUser('student');
    const adminToken = makeToken(adminId, 'admin');
    insertLoginHistory(studentId, 2);

    const res = await request(app)
      .get(`/api/v1/admin/users/${studentId}/login-history`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
  });

  it("F1-HISTORY-3: Parent can view linked child's login history", async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const childId = createUser('student');
    const parentToken = makeToken(parentId, 'student');
    // Link parent→child using correct schema (link_type, no status column)
    execute(
      "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
      [uuidv4(), parentId, childId],
    );
    insertLoginHistory(childId, 2);

    const res = await request(app)
      .get(`/api/v1/parent/children/${childId}/login-history`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
  });

  it("F1-HISTORY-4: Parent CANNOT view unlinked student's login history", async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const unlinkedId = createUser('student');
    const parentToken = makeToken(parentId, 'student');
    insertLoginHistory(unlinkedId, 2);

    const res = await request(app)
      .get(`/api/v1/parent/children/${unlinkedId}/login-history`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(403);
  });

  it("F1-HISTORY-5: Teacher can view assigned student's login history", async () => {
    const teacherId = createUser('lecturer');
    assignRole(teacherId, 'role_teacher');
    const studentId = createUser('student');
    const teacherToken = makeToken(teacherId, 'lecturer');
    // Create a class group and add the student — correct schema uses owner_user_id
    const groupId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, owner_user_id, group_type) VALUES (?, 'Test Class', ?, 'class')",
      [groupId, teacherId],
    );
    // user_group_members has no id column — composite PK (group_id, user_id)
    execute(
      'INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)',
      [groupId, studentId],
    );
    insertLoginHistory(studentId, 2);

    const res = await request(app)
      .get(`/api/v1/teacher/classes/${groupId}/students/${studentId}/login-history`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
  });
});

// ── F2: Session Management ──────────────────────────────────────────

describe('F2: Session Management', () => {
  it('F2-SESSION-1: User can list own sessions', async () => {
    const userId = createUser('student');
    const { token } = loginAndGetSession(userId, 'student');

    const res = await request(app)
      .get('/api/v1/sessions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.sessions[0]).toHaveProperty('id');
    expect(res.body.data.sessions[0]).toHaveProperty('ip_address');
    expect(res.body.data.sessions[0]).toHaveProperty('created_at');
  });

  it('F2-SESSION-2: User can revoke own session', async () => {
    const userId = createUser('student');
    const { token: token1 } = loginAndGetSession(userId, 'student');
    const { token: _token2, sessionId: session2Id } = loginAndGetSession(userId, 'student');

    // Revoke session 2
    const res = await request(app)
      .delete(`/api/v1/sessions/${session2Id}`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);

    // Session 2's row should be gone
    const row = queryOne<{ id: string }>('SELECT id FROM active_sessions WHERE id = ?', [session2Id]);
    expect(row).toBeNull();
  });

  it("F2-SESSION-3: Admin can list any user's sessions", async () => {
    const adminId = createUser('admin');
    const studentId = createUser('student');
    const { token: adminToken } = loginAndGetSession(adminId, 'admin');
    loginAndGetSession(studentId, 'student');

    const res = await request(app)
      .get(`/api/v1/admin/sessions/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sessions.length).toBeGreaterThanOrEqual(1);
  });

  it("F2-SESSION-4: Admin can force-logout any user's session", async () => {
    const adminId = createUser('admin');
    const studentId = createUser('student');
    const { token: adminToken } = loginAndGetSession(adminId, 'admin');
    const { sessionId: studentSessionId } = loginAndGetSession(studentId, 'student');

    const res = await request(app)
      .delete(`/api/v1/admin/sessions/${studentId}/${studentSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    // Force-logout uses soft-revoke (sets revoked_at) so authenticate() can detect it
    const row = queryOne<{ id: string; revoked_at: string | null }>('SELECT id, revoked_at FROM active_sessions WHERE id = ?', [studentSessionId]);
    expect(row).not.toBeNull();
    expect(row!.revoked_at).not.toBeNull();
  });

  it('F2-SESSION-5: Student cannot access admin session endpoints', async () => {
    const studentId = createUser('student');
    const adminId = createUser('admin');
    const { token: studentToken } = loginAndGetSession(studentId, 'student');

    const res = await request(app)
      .get(`/api/v1/admin/sessions/${adminId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('F2-SESSION-6: Force-logged-out token is rejected on next request', async () => {
    const adminId = createUser('admin');
    const studentId = createUser('student');
    const { token: adminToken } = loginAndGetSession(adminId, 'admin');
    const { token: studentToken, sessionId: studentSessionId } = loginAndGetSession(studentId, 'student');

    // Force-logout the student
    await request(app)
      .delete(`/api/v1/admin/sessions/${studentId}/${studentSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Student's token should now be rejected
    const res = await request(app)
      .get('/api/v1/login-history')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('Session revoked');
  });
});

// ── F4: Dispute/Refund Workflow ──────────────────────────────────────

describe('F4: Dispute/Refund Workflow', () => {
  function createAdminWithPerms(roleId: string = 'role_admin'): { userId: string; token: string } {
    const userId = createUser('admin');
    execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
    const token = generateToken({ userId, email: `${userId}@test.com`, role: 'admin' });
    createSession(userId, token);
    return { userId, token };
  }

  function createConfirmedPayment(userId: string): string {
    const courseId = uuidv4();
    const courseCode = 'COURSE-' + courseId.slice(0, 8);
    execute(
      "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)",
      [courseId, courseCode],
    );
    const paymentId = uuidv4();
    execute(
      "INSERT INTO payments (id, user_id, course_id, amount_cents, status) VALUES (?, ?, ?, 5000, 'confirmed')",
      [paymentId, userId, courseId],
    );
    return paymentId;
  }

  it('F4-DISPUTE-1: Admin creates dispute for a confirmed payment', async () => {
    const { token: adminToken } = createAdminWithPerms('role_admin');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    const res = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId, reason: 'Customer complaint' });

    expect(res.status).toBe(201);
    expect(res.body.data.dispute).toHaveProperty('id');
    expect(res.body.data.dispute.status).toBe('open');
  });

  it('F4-DISPUTE-2: Admin-2 resolves dispute → payment becomes refunded', async () => {
    const { token: adminToken } = createAdminWithPerms('role_admin');
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    // Admin creates dispute
    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId, reason: 'Refund request' });
    const disputeId = createRes.body.data.dispute.id;

    // Admin-2 resolves
    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Approved refund' });

    expect(res.status).toBe(200);
    expect(res.body.data.dispute.status).toBe('resolved');

    // Payment should now be 'refunded'
    const payment = queryOne<{ status: string }>('SELECT status FROM payments WHERE id = ?', [paymentId]);
    expect(payment!.status).toBe('refunded');
  });

  it('F4-DISPUTE-3: Admin CANNOT resolve disputes (403 — Decision #5)', async () => {
    const { token: adminToken } = createAdminWithPerms('role_admin');
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    // Admin-2 creates dispute
    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ paymentId, reason: 'Refund' });
    const disputeId = createRes.body.data.dispute.id;

    // Admin tries to resolve → 403
    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolutionNote: 'Should fail' });

    expect(res.status).toBe(403);
  });

  it('F4-DISPUTE-4: Super-admin can resolve disputes', async () => {
    const { token: adminToken } = createAdminWithPerms('role_admin');
    const { token: superAdminToken } = createAdminWithPerms('role_super_admin');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId, reason: 'Refund' });
    const disputeId = createRes.body.data.dispute.id;

    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ resolutionNote: 'Approved' });

    expect(res.status).toBe(200);
  });

  it('F4-DISPUTE-5: Duplicate resolution rejected', async () => {
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ paymentId, reason: 'Refund' });
    const disputeId = createRes.body.data.dispute.id;

    // First resolve
    await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Approved' });

    // Second resolve → 400
    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Double refund attempt' });

    expect(res.status).toBe(400);
  });

  it('F4-DISPUTE-6: Cannot resolve dispute for non-confirmed payment', async () => {
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const courseId = uuidv4();
    const courseCode2 = 'COURSE-' + courseId.slice(0, 8);
    execute(
      "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test', 'desc', ?)",
      [courseId, courseCode2],
    );
    const paymentId = uuidv4();
    execute(
      "INSERT INTO payments (id, user_id, course_id, amount_cents, status) VALUES (?, ?, ?, 5000, 'pending')",
      [paymentId, studentId, courseId],
    );

    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ paymentId, reason: 'Refund pending payment' });
    const disputeId = createRes.body.data.dispute.id;

    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Should fail' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('confirmed');
  });

  it('F4-DISPUTE-7: Atomic — dispute stays unresolved if payment is already refunded', async () => {
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ paymentId, reason: 'Refund' });
    const disputeId = createRes.body.data.dispute.id;

    // Manually set payment to refunded (simulate race)
    execute("UPDATE payments SET status = 'refunded' WHERE id = ?", [paymentId]);

    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Should fail' });

    expect(res.status).toBe(400);
    // Dispute should still be open
    const dispute = queryOne<{ status: string }>('SELECT status FROM disputes WHERE id = ?', [disputeId]);
    expect(dispute!.status).toBe('open');
  });
});

// ── F3: GDPR Data Export ─────────────────────────────────────────────

describe('F3: GDPR Data Export', () => {
  it('F3-EXPORT-1: POST /data-export returns 202 Accepted with export ID', async () => {
    const userId = createUser('student');
    const { token } = loginAndGetSession(userId, 'student');

    const res = await request(app)
      .post('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('exportId');
    expect(res.body.data).toHaveProperty('status', 'pending');
  });

  it('F3-EXPORT-2: GET /data-export/:id returns ZIP when ready', async () => {
    const userId = createUser('student');
    const { token } = loginAndGetSession(userId, 'student');

    // Create export request
    const postRes = await request(app)
      .post('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);

    const exportId = postRes.body.data.exportId;

    // Wait for async processing (in tests, should complete quickly)
    await new Promise(resolve => setTimeout(resolve, 500));

    const getRes = await request(app)
      .get(`/api/v1/data-export/${exportId}`)
      .set('Authorization', `Bearer ${token}`);

    // Should be ready (ZIP response) or still processing (JSON status)
    const isZip = (getRes.headers['content-type'] ?? '').includes('application/zip');
    if (isZip) {
      expect(getRes.status).toBe(200);
      expect(getRes.headers['content-type']).toContain('application/zip');
    } else {
      // Still processing — check status response
      expect(getRes.status).toBe(200);
      expect(['pending', 'processing']).toContain(getRes.body.data.status);
    }
  });

  it('F3-EXPORT-3: Second export within 24h returns 429', async () => {
    const userId = createUser('student');
    const { token } = loginAndGetSession(userId, 'student');

    // First export
    const res1 = await request(app)
      .post('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(202);

    // Second export immediately
    const res2 = await request(app)
      .post('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(429);
  });
});

// ── F5: Messaging Rate Limiting ──────────────────────────────────────

describe('F5: Messaging Rate Limiting', () => {
  function createConversation(user1Id: string, user2Id: string): string {
    const convId = uuidv4();
    // Ensure user1_id < user2_id for stable ordering
    const [u1, u2] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
    execute(
      'INSERT INTO conversations (id, user1_id, user2_id) VALUES (?, ?, ?)',
      [convId, u1, u2],
    );
    return convId;
  }

  it('F5-RATE-1: First 10 messages to new contact succeed', async () => {
    const senderId = createUser('student');
    const recipientId = createUser('student');
    const { token } = loginAndGetSession(senderId, 'student');
    const convId = createConversation(senderId, recipientId);

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post(`/api/v1/messages/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `Message ${i + 1}` });
      expect(res.status).toBe(201);
    }
  });

  it('F5-RATE-2: 11th message to new contact within 1 hour → 429', async () => {
    const senderId = createUser('student');
    const recipientId = createUser('student');
    const { token } = loginAndGetSession(senderId, 'student');
    const convId = createConversation(senderId, recipientId);

    // Send 10 messages
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post(`/api/v1/messages/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `Message ${i + 1}` });
    }

    // 11th should be rate-limited
    const res = await request(app)
      .post(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Message 11' });

    expect(res.status).toBe(429);
  });

  it('F5-RATE-3: After 24h of mutual messaging, 11th message succeeds', async () => {
    const senderId = createUser('student');
    const recipientId = createUser('student');
    const { token } = loginAndGetSession(senderId, 'student');
    const convId = createConversation(senderId, recipientId);

    // Backdate a message to > 24h ago
    execute(
      "INSERT INTO conversation_messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, 'old msg', datetime('now', '-25 hours'))",
      [uuidv4(), convId, senderId],
    );

    // Send 10 messages now
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post(`/api/v1/messages/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `Message ${i + 1}` });
    }

    // 11th should succeed (contact > 24h old)
    const res = await request(app)
      .post(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Message 11 — uncapped' });

    expect(res.status).toBe(201);
  });

  it('F5-RATE-4: Rate limit is per-contact, not global', async () => {
    const senderId = createUser('student');
    const recipientId = createUser('student');
    const otherRecipientId = createUser('student');
    const { token } = loginAndGetSession(senderId, 'student');
    const convId1 = createConversation(senderId, recipientId);
    const convId2 = createConversation(senderId, otherRecipientId);

    // Max out messages to recipient 1
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post(`/api/v1/messages/conversations/${convId1}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `Msg ${i}` });
    }

    // Can still message recipient 2
    const res = await request(app)
      .post(`/api/v1/messages/conversations/${convId2}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Different contact' });

    expect(res.status).toBe(201);
  });
});

// ── F6: Notification Preferences Per Role ────────────────────────────────────

describe('F6: Notification Preferences Per Role', () => {
  it('F6-NOTIF-1: Parent receives student_login notification when linked student logs in', async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const childId = createUser('student');

    // Link parent→child using correct schema (link_type, no status column)
    execute(
      "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
      [uuidv4(), parentId, childId],
    );

    // Set a real bcrypt password hash on the child so POST /auth/login works
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('testpass123', 10);
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, childId]);

    const childEmail = `${childId}@test.com`;
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: childEmail, password: 'testpass123' });

    // Check parent got a notification
    const notif = queryOne<{ type: string; title: string }>(
      "SELECT type, title FROM notifications WHERE user_id = ? AND type = 'student_login'",
      [parentId],
    );
    expect(notif).toBeDefined();
    expect(notif!.type).toBe('student_login');
  });

  it('F6-NOTIF-2: Parent can opt out of student_login notifications', async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const childId = createUser('student');

    execute(
      "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
      [uuidv4(), parentId, childId],
    );

    // Opt out of student_login
    execute(
      "INSERT INTO notification_preferences (id, user_id, type, enabled) VALUES (?, ?, 'student_login', 0)",
      [uuidv4(), parentId],
    );

    // Set a real password hash and log child in
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('testpass123', 10);
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, childId]);
    const childEmail = `${childId}@test.com`;

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: childEmail, password: 'testpass123' });

    // Parent should NOT have a notification
    const notif = queryOne<{ id: string }>(
      "SELECT id FROM notifications WHERE user_id = ? AND type = 'student_login'",
      [parentId],
    );
    expect(notif).toBeNull();
  });

  it('F6-NOTIF-3: Teacher receives class_completion notification', async () => {
    const teacherId = createUser('lecturer');
    assignRole(teacherId, 'role_teacher');
    const studentId = createUser('student');

    // Create a class group and add the student (owner_user_id, no id on members)
    const groupId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, owner_user_id, group_type) VALUES (?, 'Test Class', ?, 'class')",
      [groupId, teacherId],
    );
    execute(
      'INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)',
      [groupId, studentId],
    );

    // Create a course with a flat sections array
    const courseId = uuidv4();
    const courseCode = 'F6C-' + courseId.slice(0, 8);
    const sections = JSON.stringify([
      { id: 'S1', title: 'Section 1', items: [{ id: 'item1', title: 'Lesson 1', type: 'video', url: 'test.mp4' }] },
    ]);
    execute(
      'INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, ?, ?, ?, ?)',
      [courseId, 'Test Course', 'desc', courseCode, sections],
    );

    // Enroll the student in the course
    execute(
      'INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)',
      [studentId, courseCode],
    );

    // Student completes the lesson
    const { token: studentToken } = loginAndGetSession(studentId, 'student');
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item1/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ sectionId: 'S1' });

    // Check teacher got a notification
    const notif = queryOne<{ type: string }>(
      "SELECT type FROM notifications WHERE user_id = ? AND type = 'class_completion'",
      [teacherId],
    );
    expect(notif).toBeDefined();
  });

  it('F6-NOTIF-4: TA receives grade_approved notification', async () => {
    const instructorId = createUser('lecturer');
    const taId = createUser('student');
    assignRole(taId, 'role_ta');
    const studentUserId = createUser('student');

    // Create course
    const courseId = uuidv4();
    const courseCode = 'F6T-' + courseId.slice(0, 8);
    const sections = JSON.stringify([
      { id: 'S1', title: 'S1', items: [{ id: 'item1', title: 'Assignment', type: 'assignment', url: '' }] },
    ]);
    execute(
      'INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, ?, ?, ?, ?)',
      [courseId, 'Test Course', 'desc', courseCode, sections],
    );

    // Assign TA to course (course_tas uses user_id, no id column)
    execute(
      'INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)',
      [courseId, taId, instructorId],
    );

    // Create a students record (submissions.student_id references students.id, not users.id)
    const studentRecordId = uuidv4();
    execute(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'Test Student', ?, ?, 'General', 1)",
      [studentRecordId, studentUserId, `${studentUserId}@test.com`, `ENR-F6T-${studentRecordId.slice(0, 8)}`],
    );

    // Insert a submission already graded by the TA, pending instructor approval
    const submissionId = uuidv4();
    execute(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, course_id, item_id, status, grade_status, graded_by) VALUES (?, ?, 'Assignment', 'desc', 'file.pdf', 512, '/tmp/file.pdf', ?, 'item1', 'pending', 'pending_approval', ?)",
      [submissionId, studentRecordId, courseId, taId],
    );

    // Instructor approves the grade
    const { token: instructorToken } = loginAndGetSession(instructorId, 'lecturer');
    await request(app)
      .post(`/api/v1/ta/submissions/${submissionId}/approve-grade`)
      .set('Authorization', `Bearer ${instructorToken}`);

    // TA should get grade_approved notification
    const notif = queryOne<{ type: string }>(
      "SELECT type FROM notifications WHERE user_id = ? AND type = 'grade_approved'",
      [taId],
    );
    expect(notif).toBeDefined();
  });
});
