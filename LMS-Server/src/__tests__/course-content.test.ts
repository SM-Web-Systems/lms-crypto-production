import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../app.js';
import { db } from '../config/database.js';
import { parseGitHubFileUrl, resolveApprovedRawUrl, setContentFetcher } from '../services/courseContentService.js';
import { makeToken } from './helpers/auth.js';

const PIN = 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472';
afterEach(() => setContentFetcher(null));

function user(role: 'student' | 'admin', courseCode?: string) {
  const id = randomUUID();
  const email = `${id}@test.invalid`;
  db.prepare("INSERT INTO users(id, name, email, password_hash, role) VALUES (?, 'User', ?, 'hash', ?)").run(id, email, role);
  if (courseCode) db.prepare('INSERT INTO user_course_codes(user_id, course_code) VALUES (?,?)').run(id, courseCode);
  return { id, token: makeToken({ userId: id, email, role }) };
}

function course() {
  const id = randomUUID();
  const code = 'CC-' + id;
  const items = [
    { id: 'gh-lesson', type: 'text', title: 'GitHub lesson', url: 'https://github.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/blob/main/module-1-intro/content/lesson.md' },
    { id: 'imported', type: 'text', title: 'Imported', information: '<h2>Imported</h2><p>Body</p>' },
    { id: 'other-repo', type: 'text', title: 'Other repo', url: 'https://github.com/sm-web-systems/stellar-vibe-coding/blob/main/week-1/lesson.md' },
    { id: 'evil', type: 'text', title: 'Evil', url: 'https://github.com/evil-org/blockchain-foundations-for-vibe-coding/blob/main/lesson.md' },
    { id: 'video', type: 'video', title: 'Video', url: 'https://www.youtube.com/watch?v=SyK8hJVq3_Q', downloadUrl: `https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/${PIN}/module-1-intro/content/explainer-video.mp4` },
    { id: 'audio', type: 'audio', title: 'Audio', url: 'https://old.example/audio.mp3', youtubeUrl: 'https://youtu.be/WIDvvPM3DfE' },
  ];
  db.prepare('INSERT INTO courses(id, title, course_code, sections) VALUES (?,?,?,?)').run(id, 'Content course', code,
    JSON.stringify([{ id: 'week-1', title: 'Week 1', sections: [{ id: 'sec', title: 'Section', items }] }]));
  return { id, code };
}

const fetchReturning = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

describe('approved GitHub sources', () => {
  it('compares org and repo names case-insensitively and pins the platform default', () => {
    const { id } = course();
    expect(resolveApprovedRawUrl(id, 'https://github.com/sm-web-systems/Blockchain-Foundations-For-Vibe-Coding/blob/main/a/lesson.md'))
      .toBe(`https://raw.githubusercontent.com/sm-web-systems/blockchain-foundations-for-vibe-coding/${PIN}/a/lesson.md`);
    expect(resolveApprovedRawUrl(id, 'https://github.com/SM-Web-Systems/vibe-coding-blockchain/blob/main/a.md')).toContain('/blockchain-foundations-for-vibe-coding/');
    expect(resolveApprovedRawUrl(id, 'https://github.com/evil-org/blockchain-foundations-for-vibe-coding/blob/main/a.md')).toBeNull();
    expect(parseGitHubFileUrl('https://github.com/o/r/blob/main/../secret')).toBeNull();
    expect(parseGitHubFileUrl('http://raw.githubusercontent.com/o/r/main/a.md')).toBeNull();
  });

  it('lets a course manager approve another repo for one course only', async () => {
    const { id } = course();
    const admin = user('admin');
    const student = user('student');
    const put = await request(app).put(`/api/v1/courses/${id}/content-sources`).set('Authorization', `Bearer ${admin.token}`)
      .send({ sources: [{ owner: 'SM-Web-Systems', repo: 'Stellar-Vibe-Coding.git', ref: 'main' }] });
    expect(put.status).toBe(200);
    expect(put.body.data.sources).toEqual([{ owner: 'sm-web-systems', repo: 'stellar-vibe-coding', ref: 'main' }]);
    expect(resolveApprovedRawUrl(id, 'https://github.com/sm-web-systems/stellar-vibe-coding/blob/main/week-1/lesson.md'))
      .toBe('https://raw.githubusercontent.com/sm-web-systems/stellar-vibe-coding/main/week-1/lesson.md');
    expect(resolveApprovedRawUrl(course().id, 'https://github.com/sm-web-systems/stellar-vibe-coding/blob/main/week-1/lesson.md')).toBeNull();
    const denied = await request(app).put(`/api/v1/courses/${id}/content-sources`).set('Authorization', `Bearer ${student.token}`).send({ sources: [] });
    expect(denied.status).toBe(403);
    const bad = await request(app).put(`/api/v1/courses/${id}/content-sources`).set('Authorization', `Bearer ${admin.token}`)
      .send({ sources: [{ owner: 'a b', repo: 'r', ref: 'main' }] });
    expect(bad.status).toBe(400);
  });
});

describe('lesson reading and manifest', () => {
  it('renders approved GitHub markdown on the server, sanitized, and caches a pinned commit', async () => {
    const { id, code } = course();
    const learner = user('student', code);
    const fetcher = fetchReturning('# Module 1\n\n<script>alert(1)</script><img src=x onerror=alert(1)>\n\nText');
    setContentFetcher(fetcher);
    const first = await request(app).get(`/api/v1/courses/${id}/lessons/gh-lesson/reading`).set('Authorization', `Bearer ${learner.token}`);
    expect(first.status).toBe(200);
    expect(first.body.data.source).toBe('github');
    expect(first.body.data.html).toContain('<h1>Module 1</h1>');
    expect(first.body.data.html).not.toMatch(/script|onerror/);
    expect(fetcher).toHaveBeenCalledWith(`https://raw.githubusercontent.com/sm-web-systems/blockchain-foundations-for-vibe-coding/${PIN}/module-1-intro/content/lesson.md`, expect.anything());
    await request(app).get(`/api/v1/courses/${id}/lessons/gh-lesson/reading`).set('Authorization', `Bearer ${learner.token}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns imported inline lessons, refuses unapproved repos, and hides courses from non-members', async () => {
    const { id, code } = course();
    const learner = user('student', code);
    const auth = { Authorization: `Bearer ${learner.token}` };
    const imported = await request(app).get(`/api/v1/courses/${id}/lessons/imported/reading`).set(auth);
    expect(imported.body.data).toMatchObject({ source: 'inline', html: '<h2>Imported</h2><p>Body</p>' });
    expect((await request(app).get(`/api/v1/courses/${id}/lessons/evil/reading`).set(auth)).status).toBe(404);
    expect((await request(app).get(`/api/v1/courses/${id}/lessons/other-repo/reading`).set(auth)).status).toBe(404);
    const outsider = user('student');
    expect((await request(app).get(`/api/v1/courses/${id}/lessons/imported/reading`).set('Authorization', `Bearer ${outsider.token}`)).status).toBe(403);
  });

  it('says plainly when GitHub fails and there is no cached copy', async () => {
    const { id, code } = course();
    const learner = user('student', code);
    db.prepare('DELETE FROM course_content_cache').run();
    setContentFetcher(fetchReturning('nope', 404));
    const res = await request(app).get(`/api/v1/courses/${id}/lessons/gh-lesson/reading`).set('Authorization', `Bearer ${learner.token}`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('CONTENT_UNAVAILABLE');
  });

  it('lists every lesson with YouTube, download and reading fields and a content version', async () => {
    const { id, code } = course();
    const learner = user('student', code);
    const res = await request(app).get(`/api/v1/courses/${id}/content-manifest`).set('Authorization', `Bearer ${learner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.contentVersion).toMatch(/^[a-f0-9]{64}$/);
    const byId = Object.fromEntries(res.body.data.lessons.map((l: { id: string }) => [l.id, l]));
    expect(byId.video).toMatchObject({ youtubeId: 'SyK8hJVq3_Q', youtubeWatchUrl: 'https://www.youtube.com/watch?v=SyK8hJVq3_Q' });
    expect(byId.video.downloadUrl).toContain('explainer-video.mp4');
    expect(byId.audio.youtubeId).toBe('WIDvvPM3DfE');
    expect(byId['gh-lesson'].readingPath).toBe(`/courses/${id}/lessons/gh-lesson/reading`);
    expect(byId.imported.readingPath).not.toBeNull();
    expect(byId.evil.readingPath).toBeNull();
  });
});

describe('media play events and analytics', () => {
  it('records milestones once per window, rejects bad events, and reports per-lesson totals and CSV', async () => {
    const { id, code } = course();
    const a = user('student', code);
    const b = user('student', code);
    const post = (token: string, item: string, body: object) => request(app)
      .post(`/api/v1/courses/${id}/lessons/${item}/play-events`).set('Authorization', `Bearer ${token}`).send(body);
    expect((await post(a.token, 'video', { source: 'youtube_embed', event: 'start', platform: 'android' })).body.data.recorded).toBe(true);
    expect((await post(a.token, 'video', { source: 'youtube_embed', event: 'start', platform: 'android' })).body.data.recorded).toBe(false);
    await post(a.token, 'video', { source: 'youtube_embed', event: 'progress', percent: 62, platform: 'android' });
    await post(a.token, 'video', { source: 'youtube_embed', event: 'complete', platform: 'android' });
    await post(b.token, 'video', { source: 'youtube_embed', event: 'start', platform: 'web' });
    await post(b.token, 'video', { source: 'youtube_embed', event: 'progress', percent: 30, platform: 'web' });
    await post(b.token, 'video', { source: 'youtube_app', event: 'open_external', platform: 'web' });
    expect((await post(a.token, 'video', { source: 'youtube_embed', event: 'progress', percent: 10, platform: 'web' })).status).toBe(400);
    expect((await post(a.token, 'video', { source: 'tiktok', event: 'start', platform: 'web' })).status).toBe(400);
    expect((await post(a.token, 'imported', { source: 'youtube_embed', event: 'start', platform: 'web' })).status).toBe(404);
    expect((await post(user('student').token, 'video', { source: 'youtube_embed', event: 'start', platform: 'web' })).status).toBe(403);

    const admin = user('admin');
    const stats = await request(app).get(`/api/v1/analytics/media?courseId=${id}`).set('Authorization', `Bearer ${admin.token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.data.lessons).toEqual([expect.objectContaining({
      itemId: 'video', itemTitle: 'Video', plays: 2, learners: 2, completions: 1, averagePercentWatched: 63,
      youtubeEmbedPlays: 2, youtubeAppOpens: 1, directFilePlays: 0, offlineFilePlays: 0,
    })]);
    const csv = await request(app).get(`/api/v1/analytics/media?courseId=${id}&format=csv`).set('Authorization', `Bearer ${admin.token}`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[1]).toBe('"Content course","Video","video","2","2","1","63","2","1","0","0"');
    expect((await request(app).get('/api/v1/analytics/media').set('Authorization', `Bearer ${a.token}`)).status).toBe(403);
  });
});
