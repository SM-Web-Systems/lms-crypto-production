/**
 * E2E: DM Soft-Delete — API-based tests for message deletion and tombstone rendering.
 *
 * E2E-01: Delete own message → API returns 200, re-fetch shows tombstone
 * E2E-02: Cannot delete another user's message → 403
 */

import { test, expect } from '@playwright/test';
import { apiURL } from '../playwright.config';

const API = `${apiURL}/api/v1`;

/** Register a fresh user and return { token, userId, name, email }. */
async function registerAndLogin(request: any, suffix: string) {
  const email = `e2e-msgdel-${suffix}-${Date.now()}@test.com`;
  const password = 'TestPass123!';
  const name = `E2E MsgDel ${suffix}`;

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

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('DM Soft-Delete', () => {
  test('E2E-01: sender can delete own message, re-fetch shows tombstone', async ({ request }) => {
    // Set up two users
    const alice = await registerAndLogin(request, 'alice');
    const bob = await registerAndLogin(request, 'bob');

    // Alice creates a conversation with Bob
    const convRes = await request.post(`${API}/messages/conversations`, {
      headers: auth(alice.token),
      data: { otherUserId: bob.userId },
    });
    expect(convRes.ok()).toBeTruthy();
    const conv = (await convRes.json()).data;
    const conversationId = conv.id;

    // Alice sends a message
    const sendRes = await request.post(`${API}/messages/conversations/${conversationId}/messages`, {
      headers: auth(alice.token),
      data: { body: 'Hello from Alice' },
    });
    expect(sendRes.ok()).toBeTruthy();
    const sentMsg = (await sendRes.json()).data;
    const messageId = sentMsg.id;

    // Alice deletes the message
    const delRes = await request.delete(`${API}/messages/messages/${messageId}`, {
      headers: auth(alice.token),
    });
    expect(delRes.ok()).toBeTruthy();

    // Re-fetch messages — deleted message should be tombstoned
    const fetchRes = await request.get(`${API}/messages/conversations/${conversationId}/messages`, {
      headers: auth(alice.token),
    });
    expect(fetchRes.ok()).toBeTruthy();
    const msgs = (await fetchRes.json()).data.messages;
    const deleted = msgs.find((m: any) => m.id === messageId);
    expect(deleted).toBeTruthy();
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.body).toBeNull();
  });

  test('E2E-02: cannot delete another user\'s message', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice2');
    const bob = await registerAndLogin(request, 'bob2');

    // Alice creates conversation and sends a message
    const convRes = await request.post(`${API}/messages/conversations`, {
      headers: auth(alice.token),
      data: { otherUserId: bob.userId },
    });
    expect(convRes.ok()).toBeTruthy();
    const conv = (await convRes.json()).data;

    const sendRes = await request.post(`${API}/messages/conversations/${conv.id}/messages`, {
      headers: auth(alice.token),
      data: { body: 'Message from Alice' },
    });
    expect(sendRes.ok()).toBeTruthy();
    const msg = (await sendRes.json()).data;

    // Bob tries to delete Alice's message — should fail
    const delRes = await request.delete(`${API}/messages/messages/${msg.id}`, {
      headers: auth(bob.token),
    });
    expect(delRes.status()).toBe(403);

    // Message should still be intact
    const fetchRes = await request.get(`${API}/messages/conversations/${conv.id}/messages`, {
      headers: auth(bob.token),
    });
    expect(fetchRes.ok()).toBeTruthy();
    const msgs = (await fetchRes.json()).data.messages;
    const intact = msgs.find((m: any) => m.id === msg.id);
    expect(intact.body).toBe('Message from Alice');
    expect(intact.isDeleted).toBeFalsy();
  });
});
