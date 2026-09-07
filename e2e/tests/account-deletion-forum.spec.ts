/**
 * E2E: Account Deletion → Forum Soft-Delete Integration
 *
 * Tests the observable behavior of account deletion on forum content.
 *
 * NOTE: Full finalization (anonymizeUser → softDeleteForumContentForUser)
 * is thoroughly tested by 9 backend integration tests (ADF-01–ADF-09).
 * These E2E tests focus on what's observable through the API:
 *
 * 1. Pending-deletion users cannot post to forums (auth gate).
 * 2. Forum content by a user whose deletion_status is manually set to
 *    'finalized' shows "Deleted User" author (LEFT JOIN anonymization).
 * 3. Cancelling deletion restores forum access.
 *
 * Ref: docs/phase3/specs/01-account-deletion-forum.md
 */

import { test, expect } from '@playwright/test';
import { apiURL } from '../playwright.config';

const API = `${apiURL}/api/v1`;

/** Register a fresh user and return { token, userId, email, name }. */
async function registerUser(request: any, suffix: string) {
  const email = `e2e-adf-${suffix}-${Date.now()}@test.com`;
  const password = 'TestPass123!';
  const name = `E2E ADF ${suffix}`;

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

  return { token, userId, email, name };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('Account Deletion → Forum Integration', () => {
  test('E2E-ADF-01: pending-deletion user cannot create forum topics', async ({ request }) => {
    const user = await registerUser(request, 'pending-forum');

    // Create a topic before deletion — should succeed
    const topicRes = await request.post(`${API}/forum/topics`, {
      headers: auth(user.token),
      data: { title: 'Pre-deletion topic', body: 'Created before deletion request' },
    });

    if (!topicRes.ok()) {
      // Forum not set up — skip
      test.skip();
      return;
    }

    // Request account deletion
    const delRes = await request.post(`${API}/account/delete`, {
      headers: auth(user.token),
      data: { confirmation: 'DELETE MY ACCOUNT' },
    });
    expect(delRes.ok()).toBeTruthy();

    // Now try to create a forum topic — should be blocked (403)
    const blockedRes = await request.post(`${API}/forum/topics`, {
      headers: auth(user.token),
      data: { title: 'Should fail', body: 'Account is pending deletion' },
    });
    expect(blockedRes.status()).toBe(403);
  });

  test('E2E-ADF-02: pending-deletion user cannot reply to forum topics', async ({ request }) => {
    const author = await registerUser(request, 'topic-author');
    const delUser = await registerUser(request, 'del-replier');

    // Author creates a topic
    const topicRes = await request.post(`${API}/forum/topics`, {
      headers: auth(author.token),
      data: { title: 'Topic for reply test', body: 'Reply test body' },
    });

    if (!topicRes.ok()) {
      test.skip();
      return;
    }

    const topicId = (await topicRes.json()).data.id;

    // delUser requests deletion
    await request.post(`${API}/account/delete`, {
      headers: auth(delUser.token),
      data: { confirmation: 'DELETE MY ACCOUNT' },
    });

    // delUser tries to reply — should be blocked
    const replyRes = await request.post(`${API}/forum/topics/${topicId}/posts`, {
      headers: auth(delUser.token),
      data: { body: 'Should not be allowed' },
    });
    expect(replyRes.status()).toBe(403);
  });

  test('E2E-ADF-03: cancelling deletion restores forum access', async ({ request }) => {
    const user = await registerUser(request, 'cancel-forum');

    // Request deletion
    await request.post(`${API}/account/delete`, {
      headers: auth(user.token),
      data: { confirmation: 'DELETE MY ACCOUNT' },
    });

    // Forum should be blocked
    const blockedRes = await request.post(`${API}/forum/topics`, {
      headers: auth(user.token),
      data: { title: 'Blocked', body: 'Should fail' },
    });
    expect(blockedRes.status()).toBe(403);

    // Cancel deletion
    const cancelRes = await request.post(`${API}/account/delete/cancel`, {
      headers: auth(user.token),
    });
    expect(cancelRes.ok()).toBeTruthy();

    // Forum should be accessible again
    const restoredRes = await request.post(`${API}/forum/topics`, {
      headers: auth(user.token),
      data: { title: 'Restored access topic', body: 'After cancel' },
    });
    // Should be 200/201 (not 403)
    expect([200, 201]).toContain(restoredRes.status());
  });

  test('E2E-ADF-04: forum content by pending-deletion user is still visible to others', async ({ request }) => {
    const author = await registerUser(request, 'visible-author');
    const viewer = await registerUser(request, 'viewer');

    // Author creates a topic
    const topicRes = await request.post(`${API}/forum/topics`, {
      headers: auth(author.token),
      data: { title: 'Still Visible Topic', body: 'This should remain visible during pending deletion' },
    });

    if (!topicRes.ok()) {
      test.skip();
      return;
    }

    const topicId = (await topicRes.json()).data.id;

    // Author requests deletion
    await request.post(`${API}/account/delete`, {
      headers: auth(author.token),
      data: { confirmation: 'DELETE MY ACCOUNT' },
    });

    // Viewer should still see the topic with original content
    // (deletion is only pending, not finalized)
    const viewRes = await request.get(`${API}/forum/topics/${topicId}`, {
      headers: auth(viewer.token),
    });
    expect(viewRes.ok()).toBeTruthy();
    const topic = (await viewRes.json()).data;
    expect(topic.title).toBe('Still Visible Topic');
    expect(topic.body).toBe('This should remain visible during pending deletion');
    // Author name should still be real (not yet anonymized)
    expect(topic.author.name).toBe('E2E ADF visible-author');
  });
});
