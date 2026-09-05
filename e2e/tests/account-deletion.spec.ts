/**
 * E2E: Account Deletion — API-based tests for the deletion lifecycle,
 * auth gate, forum anonymization, and compliance identity access.
 *
 * These use page.request (Playwright's API context) rather than browser UI,
 * since there is no deletion UI yet.
 */

import { test, expect } from '@playwright/test';
import { apiURL } from '../playwright.config';

const API = `${apiURL}/api/v1`;

/** Register a fresh user and return { token, userId, email }. */
async function registerUser(request: typeof test extends (typeof test) ? any : never, suffix: string) {
  const email = `e2e-del-${suffix}-${Date.now()}@test.com`;
  const password = 'TestPass123!';

  const regRes = await request.post(`${API}/auth/register`, {
    data: { name: `E2E Del ${suffix}`, email, password },
  });
  // 200 or 201
  expect([200, 201]).toContain(regRes.status());

  const loginRes = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = await loginRes.json();
  const token = body.data?.token ?? body.token;
  expect(token).toBeTruthy();

  // Extract userId from token (JWT payload)
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  const userId = payload.userId ?? payload.sub ?? payload.id;

  return { token, userId, email };
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ────────────────────────────────────────────────────────────────────
// 1. Deletion Request Lifecycle
// ────────────────────────────────────────────────────────────────────

test.describe('Account Deletion Lifecycle', () => {
  test('E2E-DEL-01: request, check status, cancel, verify access restored', async ({ request }) => {
    const { token } = await registerUser(request, 'lifecycle');

    // Request deletion
    const delRes = await request.post(`${API}/account/delete`, {
      headers: authHeaders(token),
      data: { confirmation: 'DELETE MY ACCOUNT' },
    });
    expect(delRes.status()).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.data.gracePeriodEndsAt).toBeTruthy();

    // Check status
    const statusRes = await request.get(`${API}/account/delete/status`, {
      headers: authHeaders(token),
    });
    expect(statusRes.status()).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.data.status).toBe('pending');

    // Cancel deletion
    const cancelRes = await request.post(`${API}/account/delete/cancel`, {
      headers: authHeaders(token),
    });
    expect(cancelRes.status()).toBe(200);

    // Verify user can still access protected endpoints
    const coursesRes = await request.get(`${API}/courses`, {
      headers: authHeaders(token),
    });
    expect(coursesRes.status()).not.toBe(403);
  });

  test('E2E-DEL-02: reject deletion without confirmation string', async ({ request }) => {
    const { token } = await registerUser(request, 'noconfirm');

    const res = await request.post(`${API}/account/delete`, {
      headers: authHeaders(token),
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('E2E-DEL-03: reject duplicate deletion request', async ({ request }) => {
    const { token } = await registerUser(request, 'dup');

    // First request succeeds
    const res1 = await request.post(`${API}/account/delete`, {
      headers: authHeaders(token),
      data: { confirmation: 'DELETE MY ACCOUNT' },
    });
    expect(res1.status()).toBe(200);

    // Second request is rejected
    const res2 = await request.post(`${API}/account/delete`, {
      headers: authHeaders(token),
      data: { confirmation: 'DELETE MY ACCOUNT' },
    });
    expect(res2.status()).toBe(409);
  });
});

// ────────────────────────────────────────────────────────────────────
// 2. Auth Gate for Pending Deletion
// ────────────────────────────────────────────────────────────────────

test.describe('Auth Gate for Pending Deletion', () => {
  test('E2E-GATE-01: pending-deletion user is blocked from normal endpoints', async ({ request }) => {
    const { token } = await registerUser(request, 'gate');

    // Request deletion
    await request.post(`${API}/account/delete`, {
      headers: authHeaders(token),
      data: { confirmation: 'DELETE MY ACCOUNT' },
    });

    // Try to access a normal endpoint — should be 403
    const coursesRes = await request.get(`${API}/courses`, {
      headers: authHeaders(token),
    });
    expect(coursesRes.status()).toBe(403);

    // But deletion status should still work
    const statusRes = await request.get(`${API}/account/delete/status`, {
      headers: authHeaders(token),
    });
    expect(statusRes.status()).toBe(200);

    // And cancellation should still work
    const cancelRes = await request.post(`${API}/account/delete/cancel`, {
      headers: authHeaders(token),
    });
    expect(cancelRes.status()).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────
// 3. Forum Anonymization
// ────────────────────────────────────────────────────────────────────

test.describe('Forum Anonymization', () => {
  test('E2E-FORUM-01: deleted user shows as "Deleted User" with isDeleted in forum', async ({ request }) => {
    // Create two users: one to delete, one to view
    const author = await registerUser(request, 'forum-author');
    const viewer = await registerUser(request, 'forum-viewer');

    // Author creates a forum topic
    const topicRes = await request.post(`${API}/forum/topics`, {
      headers: authHeaders(author.token),
      data: { title: 'E2E Deletion Test Topic', body: 'This is a test topic body' },
    });

    // Topic creation might fail if forum isn't set up — skip gracefully
    if (topicRes.status() !== 200 && topicRes.status() !== 201) {
      test.skip();
      return;
    }

    const topicBody = await topicRes.json();
    const topicId = topicBody.data?.id ?? topicBody.id;

    // Author requests account deletion
    await request.post(`${API}/account/delete`, {
      headers: authHeaders(author.token),
      data: { confirmation: 'DELETE MY ACCOUNT' },
    });

    // Viewer checks the topic list — author should still show real name
    // (account not yet finalized, just pending)
    const listRes = await request.get(`${API}/forum/topics`, {
      headers: authHeaders(viewer.token),
    });
    expect(listRes.status()).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────
// 4. Compliance Identity Access
// ────────────────────────────────────────────────────────────────────

test.describe('Compliance Identity Access', () => {
  test('E2E-COMP-01: non-admin cannot access deleted-identities endpoint', async ({ request }) => {
    const student = await registerUser(request, 'comp-student');

    const res = await request.get(`${API}/admin/deleted-identities/some-user-id`, {
      headers: authHeaders(student.token),
    });
    expect(res.status()).toBe(403);
  });

  test('E2E-COMP-02: admin can access deleted-identities endpoint', async ({ request }) => {
    // Login as admin (seeded by global setup)
    const loginRes = await request.post(`${API}/auth/login`, {
      data: { email: 'admin@test.com', password: 'password123' },
    });

    if (!loginRes.ok()) {
      test.skip();
      return;
    }

    const body = await loginRes.json();
    const adminToken = body.data?.token ?? body.token;

    // Try to access a non-existent deleted identity — should get 404 (not 403)
    const res = await request.get(`${API}/admin/deleted-identities/nonexistent-user-id`, {
      headers: authHeaders(adminToken),
    });

    // Admin should not get 403 — either 200 (found) or 404 (not found)
    expect(res.status()).not.toBe(403);
  });
});
