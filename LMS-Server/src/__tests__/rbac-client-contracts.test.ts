import { seedTestAccount } from './helpers/rbacFixtures.js';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../app.js';
import { db } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { getAuthorizationContext } from '../services/authorizationService.js';
import { roleSummariesForUsers } from '../services/roleSummaryService.js';

beforeEach(() => {
  // The reset omits runtime-created profile tables, as in avatar-serving tests.
  db.exec(`CREATE TABLE user_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avatar_path TEXT, whatsapp TEXT, telegram TEXT, linkedin_url TEXT,
    github_url TEXT, twitter_url TEXT, website_url TEXT,
    custom_links TEXT DEFAULT '[]', updated_at TEXT DEFAULT (datetime('now'))
  )`);
});
function account(grants: string[], legacy = 'admin') {
  const id = randomUUID(), email = id + '@client-rbac.invalid';
  seedTestAccount(db, `INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)`, [id,'Contract ' + id,email,'unused'], []);
  for (const role of grants) db.prepare('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)').run(id, role);
  return { id, token: generateToken({ userId: id, email, role: 'student' }) };
}
function customRole() {
  const id = randomUUID();
  db.prepare('INSERT INTO roles(id,name,label) VALUES(?,?,?)').run(id, 'curriculum-' + id, 'Curriculum editor');
  return id;
}
function course() {
  const id = randomUUID();
  db.prepare("INSERT INTO courses(id,title,course_code,sections) VALUES(?,'Contracts',?,'[]')").run(id, id);
  return id;
}
const get = (path: string, token: string) => request(app).get('/api/v1' + path).auth(token, { type: 'bearer' });
function assertPublicSummary(value: Record<string, unknown>) {
  expect(value).not.toHaveProperty('role');
  expect(value).not.toHaveProperty('permissions');
  expect(value).not.toHaveProperty('workspaces');
  expect(value).not.toHaveProperty('adminTier');
  for (const role of value.roleSummaries as object[]) expect(Object.keys(role).sort()).toEqual(['id', 'label', 'name']);
}

describe('RBAC Step 3 scoped client contracts', () => {
  it('returns current RBAC context without the removed single role field', async () => {
    const user = account(['role_admin', 'role_student'], 'lecturer');
    const response = await get('/auth/me', user.token);
    expect(response.status).toBe(200);
    expect(response.body.data).not.toHaveProperty('role');
    expect(response.body.data).toMatchObject({
      id:user.id, rbacRoles:expect.arrayContaining(['admin','student']),
      workspaces:expect.arrayContaining(['admin','student']),
      permissions:expect.arrayContaining(['user.view_all','course.view']),
    });
  });
  it('returns exact multiple/custom assignment labels and no manufactured role for a zero-grant account', () => {
    const custom = customRole(), user = account(['role_student', custom]), denied = account([]);
    const context = getAuthorizationContext(user.id);
    expect(context.roleSummaries.map(role => role.label)).toContain('Curriculum editor');
    expect(context.roleSummaries).toHaveLength(2);
    const summaries = roleSummariesForUsers([user.id, denied.id, user.id]);
    expect(summaries.size).toBe(2);
    expect(summaries.get(denied.id)).toEqual([]);
    expect(getAuthorizationContext(denied.id).workspaces).toEqual([]);
  });
  it('directory and global search carry assignments without private authorization context', async () => {
    const admin = account(['role_admin']), custom = customRole(), target = account(['role_student', custom], 'lecturer');
    const directory = await get('/users', admin.token);
    expect(directory.status).toBe(200);
    const user = directory.body.data.users.find((row: { id: string }) => row.id === target.id);
    expect(user.roleSummaries).toHaveLength(2);
    assertPublicSummary(user);
    const search = await get('/search?q=Contract&types=users', admin.token);
    expect(search.status).toBe(200);
    const match = search.body.data.results.users.find((row: { id: string }) => row.id === target.id);
    expect(match.roleSummaries).toEqual(user.roleSummaries);
    assertPublicSummary(match);
    expect((await get('/users', target.token)).status).toBe(403);
  });
  it('scoped rosters identify learner profiles independently of legacy and current role labels', async () => {
    const instructor = account(['role_instructor']), learner = account(['role_instructor', 'role_student']), revoked = account([]), id = course();
    db.prepare('INSERT INTO course_lecturers(course_id,user_id) VALUES(?,?)').run(id, instructor.id);
    for (const user of [learner, revoked]) {
      db.prepare("INSERT INTO students(id,user_id,name,email,enrollment_number,department,semester) VALUES(?,?,'Learner',?,?,'Test',1)")
        .run('profile-' + user.id, user.id, user.id + '@invalid.test', user.id);
      db.prepare('INSERT INTO user_course_codes(user_id,course_code) VALUES(?,?)').run(user.id, id);
    }
    const response = await get('/courses/' + id + '/members', instructor.token);
    expect(response.status).toBe(200);
    const members = response.body.data.members;
    expect(members.find((row: { id: string }) => row.id === learner.id).studentId).toBe('profile-' + learner.id);
    expect(members.find((row: { id: string }) => row.id === revoked.id)).toMatchObject({ studentId: 'profile-' + revoked.id, roleSummaries: [] });
    members.forEach(assertPublicSummary);
    const outsider = account(['role_instructor']);
    expect((await get('/courses/' + id + '/members', outsider.token)).status).toBe(403);
    expect(getAuthorizationContext(revoked.id).permissions).toEqual([]);
  });
  it('forum and profile summaries show current multiple/custom grants without permissions', async () => {
    const user = account(['role_student', customRole()], 'lecturer');
    const created = await request(app).post('/api/v1/forum/topics').auth(user.token, { type: 'bearer' })
      .send({ title: 'Role contract', body: 'Synthetic role summary' });
    expect(created.status).toBe(201);
    const author = created.body.data.author ?? created.body.data.topic?.author;
    expect(author.roleSummaries).toHaveLength(2);
    assertPublicSummary(author);
    const topics = await get('/forum/topics', user.token);
    expect(topics.status).toBe(200);
    const topic = topics.body.data.topics.find((row: { author: { id: string } }) => row.author.id === user.id);
    expect(topic.author.roleSummaries).toEqual(author.roleSummaries);
    const posted = await request(app).post('/api/v1/forum/topics/' + created.body.data.id + '/posts')
      .auth(user.token, {type:'bearer'}).send({body:'Reply with current assignments'});
    expect(posted.status).toBe(201);
    expect(posted.body.data.author.roleSummaries).toEqual(author.roleSummaries);
    const replies = await get('/forum/topics/' + created.body.data.id + '/posts', user.token);
    expect(replies.status).toBe(200);
    expect(replies.body.data.posts[0].author.roleSummaries).toEqual(author.roleSummaries);
    assertPublicSummary(replies.body.data.posts[0].author);
    const profile = await get('/profile/' + user.id, user.token);
    expect(profile.status).toBe(200);
    expect(profile.body.data.roleSummaries).toEqual(author.roleSummaries);
    assertPublicSummary(profile.body.data);
    db.prepare("UPDATE users SET deletion_status='finalized' WHERE id=?").run(user.id);
    const viewer = account(['role_student']);
    const deleted = await get('/forum/topics', viewer.token);
    const removed = deleted.body.data.topics.find((row: { author: { id: string } }) => row.author.id === user.id);
    expect(removed.author).toMatchObject({ name: 'Deleted User', email: null, roleSummaries: [], rbacRoles: [] });
  });
});
