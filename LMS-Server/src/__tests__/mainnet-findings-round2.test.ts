import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import type { LegacyRole } from '../types/index.js';

const hash = bcrypt.hashSync('mainnet-round2', 4);
function actor(roleId = 'role_student', legacy: LegacyRole = 'student') {
  const id = randomUUID(), email = `${id}@mainnet2.invalid`;
  execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (?,'Person',?,?,?)", [id, email, hash, legacy]);
  execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
  execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [id, roleId]);
  return { id, token: generateToken({ userId: id, email, role: legacy }) };
}
function course() {
  const id = randomUUID();
  execute("INSERT INTO courses (id,title,course_code,sections,approval_status) VALUES (?,'Round 2',?,'[]','published')", [id, `R2-${id.slice(0, 6)}`]);
  return id;
}

describe('F21 - certificate review is limited to courses the reviewer teaches', () => {
  function seed() {
    const courseId = course();
    const learner = actor(), lecturer = actor('role_instructor'), outsider = actor('role_instructor');
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)', [courseId, lecturer.id]);
    const appId = randomUUID();
    execute("INSERT INTO course_nft_applications (id,user_id,course_id,wallet_address,status) VALUES (?,?,?,'GTESTWALLET','pending')", [appId, learner.id, courseId]);
    return { courseId, appId, lecturer, outsider };
  }

  it.each(['approve', 'reject'])('an instructor who does not teach the course cannot %s', async (action) => {
    const { courseId, appId, outsider } = seed();
    const res = await request(app)
      .patch(`/api/v1/courses/${courseId}/completions/applications/${appId}/${action}`)
      .auth(outsider.token, { type: 'bearer' }).send({ notes: 'x' });
    expect(res.status).toBe(403);
    expect(queryOne<{ status: string }>('SELECT status FROM course_nft_applications WHERE id = ?', [appId])?.status).toBe('pending');
  });

  it('the course lecturer can still approve', async () => {
    const { courseId, appId, lecturer } = seed();
    const res = await request(app)
      .patch(`/api/v1/courses/${courseId}/completions/applications/${appId}/approve`)
      .auth(lecturer.token, { type: 'bearer' }).send({});
    expect(res.status).toBe(200);
    expect(queryOne<{ status: string }>('SELECT status FROM course_nft_applications WHERE id = ?', [appId])?.status).toBe('approved');
  });
});
