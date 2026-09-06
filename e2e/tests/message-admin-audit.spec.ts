/**
 * E2E: Admin Message Audit — API-based tests for admin audit endpoints.
 *
 * E2E-ADMIN-01: Admin views deleted message content and metadata
 * E2E-ADMIN-02: Non-admin cannot access audit view
 */

import { test, expect } from '@playwright/test';
import { apiURL } from '../playwright.config';

const API = `${apiURL}/api/v1`;

async function registerAndLogin(request: any, suffix: string) {
  const email = `e2e-audit-${suffix}-${Date.now()}@test.com`;
  const password = 'TestPass123!';
  const name = `E2E Audit ${suffix}`;

  const regRes = await request.post(`${API}/auth/register`, {
    data: { name, email, password },
  });
  expect([200, 201]).toContain(regRes.status());

  const loginRes = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = await loginRes.json();
  const token = body.data?.token ?? body.token;
  expect(token).toBeTruthy();

  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  const userId = payload.userId ?? payload.sub ?? payload.id;

  return { token, userId, name, email };
}

async function loginAsAdmin(request: any) {
  const email = 'admin@test.com';
  const password = 'admin123';

  const loginRes = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });

  if (!loginRes.ok()) {
    // Register — ADMIN_EMAILS env var auto-promotes to admin role
    const regRes = await request.post(`${API}/auth/register`, {
      data: { name: 'Test Admin', email, password },
    });
    expect([200, 201]).toContain(regRes.status());

    const retryLogin = await request.post(`${API}/auth/login`, {
      data: { email, password },
    });
    expect(retryLogin.ok()).toBeTruthy();
    const body = await retryLogin.json();
    const token = body.data?.token ?? body.token;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return { token, userId: payload.userId ?? payload.sub ?? payload.id };
  }

  const body = await loginRes.json();
  const token = body.data?.token ?? body.token;
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  return { token, userId: payload.userId ?? payload.sub ?? payload.id };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('Admin Message Audit', () => {
  test('E2E-ADMIN-01: admin views deleted message content and metadata', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice');
    const bob = await registerAndLogin(request, 'bob');

    // Alice creates conversation with Bob
    const convRes = await request.post(`${API}/messages/conversations`, {
      headers: auth(alice.token),
      data: { otherUserId: bob.userId },
    });
    expect(convRes.ok()).toBeTruthy();
    const conv = (await convRes.json()).data;

    // Alice sends a message
    const sendRes = await request.post(`${API}/messages/conversations/${conv.id}/messages`, {
      headers: auth(alice.token),
      data: { body: 'Secret message for audit test' },
    });
    expect(sendRes.ok()).toBeTruthy();
    const msg = (await sendRes.json()).data;

    // Alice deletes her message
    const delRes = await request.delete(`${API}/messages/messages/${msg.id}`, {
      headers: auth(alice.token),
    });
    expect(delRes.ok()).toBeTruthy();

    // Admin views the conversation audit endpoint
    const admin = await loginAsAdmin(request);

    // Admin conversation list includes the conversation with deleted count
    const listRes = await request.get(`${API}/messages/admin/conversations`, {
      headers: auth(admin.token),
    });
    expect(listRes.ok()).toBeTruthy();
    const convs = (await listRes.json()).data.conversations;
    const target = convs.find((c: any) => c.id === conv.id);
    expect(target).toBeTruthy();
    expect(target.deletedMessageCount).toBeGreaterThanOrEqual(1);

    // Admin sees full content of deleted message
    const auditRes = await request.get(
      `${API}/messages/admin/conversations/${conv.id}/messages`,
      { headers: auth(admin.token) }
    );
    expect(auditRes.ok()).toBeTruthy();
    const auditMsgs = (await auditRes.json()).data.messages;
    const deletedMsg = auditMsgs.find((m: any) => m.id === msg.id);
    expect(deletedMsg).toBeTruthy();
    expect(deletedMsg.isDeleted).toBe(true);
    expect(deletedMsg.body).toBe('Secret message for audit test');
    expect(deletedMsg.deletionType).toBe('self_delete');
    expect(deletedMsg.deletedAt).toBeTruthy();
    expect(deletedMsg.deletedBy).toBe(alice.userId);
    expect(deletedMsg.senderName).toBeTruthy();

    // Admin can also get single message
    const singleRes = await request.get(
      `${API}/messages/admin/messages/${msg.id}`,
      { headers: auth(admin.token) }
    );
    expect(singleRes.ok()).toBeTruthy();
    const singleBody = await singleRes.json();
    expect(singleBody.data.message.body).toBe('Secret message for audit test');
  });

  test('E2E-ADMIN-02: non-admin cannot access audit endpoints', async ({ request }) => {
    const student = await registerAndLogin(request, 'nonadmin');

    // Regular user tries admin conversations endpoint
    const listRes = await request.get(`${API}/messages/admin/conversations`, {
      headers: auth(student.token),
    });
    expect(listRes.status()).toBe(403);

    // Regular user tries admin conversation messages endpoint
    const msgsRes = await request.get(`${API}/messages/admin/conversations/fake-id/messages`, {
      headers: auth(student.token),
    });
    expect(msgsRes.status()).toBe(403);

    // Regular user tries admin single message endpoint
    const msgRes = await request.get(`${API}/messages/admin/messages/fake-id`, {
      headers: auth(student.token),
    });
    expect(msgRes.status()).toBe(403);
  });
});
