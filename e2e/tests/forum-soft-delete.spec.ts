/**
 * E2E: Forum Soft-Delete — API-based tests for topic/post deletion and tombstone rendering.
 *
 * E2E-F01: Author deletes own topic → re-fetch shows tombstone
 * E2E-F02: Cannot delete another user's topic → 403
 * E2E-F03: Author deletes own reply → re-fetch shows tombstone
 * E2E-F04: Reply to deleted topic fails → 403
 */

import { test, expect } from '@playwright/test';
import { apiURL } from '../playwright.config';

const API = `${apiURL}/api/v1`;

/** Register a fresh user and return { token, userId, name, email }. */
async function registerAndLogin(request: any, suffix: string) {
  const email = `e2e-forumdel-${suffix}-${Date.now()}@test.com`;
  const password = 'TestPass123!';
  const name = `E2E ForumDel ${suffix}`;

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

test.describe('Forum Soft-Delete', () => {
  test('E2E-F01: author can delete own topic, re-fetch shows tombstone', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice');

    // Create a topic
    const createRes = await request.post(`${API}/forum/topics`, {
      headers: auth(alice.token),
      data: { title: 'E2E Delete Topic', body: 'This topic will be deleted', courseId: null },
    });
    expect(createRes.ok()).toBeTruthy();
    const topic = (await createRes.json()).data;
    const topicId = topic.id;

    // Delete the topic
    const delRes = await request.delete(`${API}/forum/topics/${topicId}`, {
      headers: auth(alice.token),
    });
    expect(delRes.ok()).toBeTruthy();
    const delBody = await delRes.json();
    expect(delBody.data.deleted).toBe(true);

    // Re-fetch topic list — should include tombstone
    const listRes = await request.get(`${API}/forum/topics?courseId=general`, {
      headers: auth(alice.token),
    });
    expect(listRes.ok()).toBeTruthy();
    const topics = (await listRes.json()).data.topics;
    const deleted = topics.find((t: any) => t.id === topicId);
    expect(deleted).toBeTruthy();
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.title).toBeNull();
    expect(deleted.body).toBeNull();

    // Fetching the topic directly should return 404
    const getRes = await request.get(`${API}/forum/topics/${topicId}`, {
      headers: auth(alice.token),
    });
    expect(getRes.status()).toBe(404);
  });

  test('E2E-F02: cannot delete another user\'s topic', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice2');
    const bob = await registerAndLogin(request, 'bob2');

    // Alice creates a topic
    const createRes = await request.post(`${API}/forum/topics`, {
      headers: auth(alice.token),
      data: { title: 'Alice Only Topic', body: 'Bob cannot delete this' },
    });
    expect(createRes.ok()).toBeTruthy();
    const topic = (await createRes.json()).data;

    // Bob tries to delete Alice's topic — should fail
    const delRes = await request.delete(`${API}/forum/topics/${topic.id}`, {
      headers: auth(bob.token),
    });
    expect(delRes.status()).toBe(403);

    // Topic should still be intact
    const getRes = await request.get(`${API}/forum/topics/${topic.id}`, {
      headers: auth(alice.token),
    });
    expect(getRes.ok()).toBeTruthy();
    const intact = (await getRes.json()).data;
    expect(intact.title).toBe('Alice Only Topic');
  });

  test('E2E-F03: author can delete own reply, re-fetch shows tombstone', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice3');

    // Create a topic
    const topicRes = await request.post(`${API}/forum/topics`, {
      headers: auth(alice.token),
      data: { title: 'Topic for Reply Delete', body: 'Testing reply deletion' },
    });
    expect(topicRes.ok()).toBeTruthy();
    const topic = (await topicRes.json()).data;

    // Create a reply
    const replyRes = await request.post(`${API}/forum/topics/${topic.id}/posts`, {
      headers: auth(alice.token),
      data: { body: 'This reply will be deleted' },
    });
    expect(replyRes.ok()).toBeTruthy();
    const post = (await replyRes.json()).data;

    // Delete the reply
    const delRes = await request.delete(`${API}/forum/posts/${post.id}`, {
      headers: auth(alice.token),
    });
    expect(delRes.ok()).toBeTruthy();

    // Re-fetch posts — should include tombstone
    const postsRes = await request.get(`${API}/forum/topics/${topic.id}/posts`, {
      headers: auth(alice.token),
    });
    expect(postsRes.ok()).toBeTruthy();
    const posts = (await postsRes.json()).data.posts;
    const deleted = posts.find((p: any) => p.id === post.id);
    expect(deleted).toBeTruthy();
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.body).toBeNull();
  });

  test('E2E-F04: reply to deleted topic fails with 403', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice4');
    const bob = await registerAndLogin(request, 'bob4');

    // Alice creates a topic
    const topicRes = await request.post(`${API}/forum/topics`, {
      headers: auth(alice.token),
      data: { title: 'Topic to be deleted', body: 'Will be deleted before reply' },
    });
    expect(topicRes.ok()).toBeTruthy();
    const topic = (await topicRes.json()).data;

    // Alice deletes the topic
    const delRes = await request.delete(`${API}/forum/topics/${topic.id}`, {
      headers: auth(alice.token),
    });
    expect(delRes.ok()).toBeTruthy();

    // Bob tries to reply — should fail with 403
    const replyRes = await request.post(`${API}/forum/topics/${topic.id}/posts`, {
      headers: auth(bob.token),
      data: { body: 'Trying to reply to deleted topic' },
    });
    expect(replyRes.status()).toBe(403);
  });
});
