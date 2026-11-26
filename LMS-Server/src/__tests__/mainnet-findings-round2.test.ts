import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import type { LegacyRole } from '../types/index.js';
import * as mintModule from '../services/mintService.js';

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

describe('F22 - rejecting an application closes its unpaid manual payment', () => {
  it('marks the pending manual placeholder failed but leaves card attempts alone', async () => {
    const courseId = course();
    const learner = actor(), lecturer = actor('role_instructor');
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)', [courseId, lecturer.id]);
    const appId = randomUUID(), manualId = randomUUID(), cardId = randomUUID();
    execute("INSERT INTO course_nft_applications (id,user_id,course_id,wallet_address,status) VALUES (?,?,?,'GTESTWALLET','pending')", [appId, learner.id, courseId]);
    execute("INSERT INTO payments (id,user_id,course_id,application_id,amount_cents,payment_method,status) VALUES (?,?,?,?,100,'manual','pending')", [manualId, learner.id, courseId, appId]);
    execute("INSERT INTO payments (id,user_id,course_id,application_id,amount_cents,payment_method,status) VALUES (?,?,?,?,100,'paystack','pending')", [cardId, learner.id, courseId, appId]);
    const res = await request(app)
      .patch(`/api/v1/courses/${courseId}/completions/applications/${appId}/reject`)
      .auth(lecturer.token, { type: 'bearer' }).send({ reason: 'Not ready' });
    expect(res.status).toBe(200);
    expect(queryOne<{ status: string }>('SELECT status FROM payments WHERE id = ?', [manualId])?.status).toBe('failed');
    expect(queryOne<{ status: string }>('SELECT status FROM payments WHERE id = ?', [cardId])?.status).toBe('pending');
  });
});

describe('F20 - a Free cohort member can apply after the course becomes Paid only', () => {
  function seed() {
    const courseId = course();
    const learner = actor(), sponsor = actor('role_sponsor');
    execute("UPDATE users SET walletAddress = 'GLEARNERWALLETF20', wallet_linking_status = 'linked' WHERE id = ?", [learner.id]);
    execute('INSERT INTO user_course_codes (user_id,course_code) SELECT ?, course_code FROM courses WHERE id = ?', [learner.id, courseId]);
    execute("INSERT INTO course_pricing (id,course_id,price_cents,currency,is_active,tiers_enabled) VALUES (?,?,100,'USD',1,'paid_only')", [randomUUID(), courseId]);
    const cohortId = randomUUID();
    execute("INSERT INTO sponsor_cohorts (id,name,sponsor_user_id,course_id,selected_tier,status) VALUES (?,'Old free cohort',?,?,'free','active')", [cohortId, sponsor.id, courseId]);
    execute('INSERT INTO cohort_members (cohort_id,user_id) VALUES (?,?)', [cohortId, learner.id]);
    return { courseId, learner };
  }

  it('tiers no longer offer the cohort tier as sponsored', async () => {
    const { courseId, learner } = seed();
    const res = await request(app).get(`/api/v1/courses/${courseId}/tiers`).auth(learner.token, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body.data.tiersEnabled).toBe('paid_only');
    expect(res.body.data.sponsoredTier).toBeNull();
  });

  it('apply without a tier uses the course tier and the learner payment', async () => {
    const { courseId, learner } = seed();
    const res = await request(app).post(`/api/v1/courses/${courseId}/completions/apply`).auth(learner.token, { type: 'bearer' }).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.selectedTier).toBe('paid');
    expect(res.body.data.sponsoredByCohort).toBeUndefined();
    expect(res.body.data.payment.amountCents).toBe(100);
  });
});

describe('F30 - Teacher dashboard counts each student once', () => {
  it('a learner in two of the teacher classes counts once', async () => {
    const teacher = actor('role_teacher', 'lecturer');
    const learners = [actor(), actor(), actor()];
    for (const name of ['Class 1', 'Class 2']) {
      const groupId = randomUUID();
      execute("INSERT INTO user_groups (id,name,group_type,owner_user_id) VALUES (?,?,'class',?)", [groupId, name, teacher.id]);
      for (const l of learners) execute('INSERT INTO user_group_members (group_id,user_id) VALUES (?,?)', [groupId, l.id]);
    }
    const res = await request(app).get('/api/v1/teacher/dashboard').auth(teacher.token, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body.data.totalClasses).toBe(2);
    expect(res.body.data.totalStudents).toBe(3);
  });
});

describe('F30 (employer) - Employer dashboard counts each member once', () => {
  it('a learner in two of the employer teams counts once', async () => {
    const employer = actor('role_employer', 'lecturer');
    const learner = actor();
    for (const name of ['Team 1', 'Team 2']) {
      const groupId = randomUUID();
      execute("INSERT INTO user_groups (id,name,group_type,owner_user_id) VALUES (?,?,'team',?)", [groupId, name, employer.id]);
      execute('INSERT INTO user_group_members (group_id,user_id) VALUES (?,?)', [groupId, learner.id]);
    }
    const res = await request(app).get('/api/v1/employer/dashboard').auth(employer.token, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body.data.totalTeams).toBe(2);
    expect(res.body.data.totalMembers).toBe(1);
  });
});

describe('F31 - the team owner is notified when a learner leaves', () => {
  it('creates a notification for the employer', async () => {
    const employer = actor('role_employer', 'lecturer');
    const learner = actor();
    const groupId = randomUUID();
    execute("INSERT INTO user_groups (id,name,group_type,owner_user_id) VALUES (?,'Team A','team',?)", [groupId, employer.id]);
    execute('INSERT INTO user_group_members (group_id,user_id) VALUES (?,?)', [groupId, learner.id]);
    const res = await request(app).delete(`/api/v1/students/me/groups/${groupId}`).auth(learner.token, { type: 'bearer' });
    expect(res.status).toBe(200);
    const n = queryOne<{ type: string; link: string }>('SELECT type, link FROM notifications WHERE user_id = ?', [employer.id]);
    expect(n).toMatchObject({ type: 'group_member_left', link: '/employer/teams' });
  });
});

describe('F32 - learners can find their instructor and messages notify', () => {
  it('course members include the instructors by name, without email', async () => {
    const courseId = course();
    const learner = actor(), lecturer = actor('role_instructor');
    execute('INSERT INTO user_course_codes (user_id,course_code) SELECT ?, course_code FROM courses WHERE id = ?', [learner.id, courseId]);
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)', [courseId, lecturer.id]);
    const res = await request(app).get(`/api/v1/courses/${courseId}/members`).auth(learner.token, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body.data.instructors).toEqual([{ id: lecturer.id, name: 'Person' }]);
  });

  it('a new message creates one notification per unread run', async () => {
    const a = actor(), b = actor();
    const conv = await request(app).post('/api/v1/messages/conversations').auth(a.token, { type: 'bearer' }).send({ otherUserId: b.id });
    expect([200, 201]).toContain(conv.status);
    for (const body of ['hello', 'again']) {
      const sent = await request(app).post(`/api/v1/messages/conversations/${conv.body.data.id}/messages`).auth(a.token, { type: 'bearer' }).send({ body });
      expect(sent.status).toBe(201);
    }
    const rows = queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'new_message'", [b.id]);
    expect(rows?.n).toBe(1);
  });
});

describe('F27/F29 - mint retry and token id', () => {
  const WALLET = 'GBVRLTX5AKI6TS5TAENKN3CMRM2EWORUD6CKDVV4K5E54DGJD3W7LP4I';
  afterEach(() => { delete process.env.NFT_CONTRACT_ID; vi.restoreAllMocks(); });

  it('a successful retry replaces the failed record instead of adding a second row', async () => {
    process.env.NFT_CONTRACT_ID = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';
    const courseId = course();
    const admin = actor('role_admin', 'admin');
    const learner = actor();
    execute("UPDATE users SET walletAddress = ?, wallet_linking_status = 'linked' WHERE id = ?", [WALLET, learner.id]);
    execute('INSERT INTO user_course_codes (user_id,course_code) SELECT ?, course_code FROM courses WHERE id = ?', [learner.id, courseId]);
    const appId = randomUUID();
    execute("INSERT INTO course_nft_applications (id,user_id,course_id,wallet_address,status,selected_tier) VALUES (?,?,?,?,'approved','paid')", [appId, learner.id, courseId, WALLET]);

    const spy = vi.spyOn(mintModule, 'mintCredential')
      .mockRejectedValueOnce(new Error('Transaction expired before it was included'))
      .mockResolvedValueOnce({ txHash: 'f'.repeat(64), sorobanTokenId: 41 });
    const url = `/api/v1/courses/${courseId}/completions/applications/${appId}/mint`;
    const first = await request(app).post(url).auth(admin.token, { type: 'bearer' });
    expect(first.status).toBe(502);
    const second = await request(app).post(url).auth(admin.token, { type: 'bearer' });
    expect(second.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);

    const rows = db.prepare('SELECT mint_status, soroban_token_id, error FROM nft_credentials WHERE application_id = ?').all(appId);
    expect(rows).toEqual([{ mint_status: 'minted', soroban_token_id: 41, error: null }]);

    const list = await request(app).get('/api/v1/admin/issued-credentials').auth(admin.token, { type: 'bearer' });
    const mine = list.body.data.credentials.filter((c: { applicationId: string }) => c.applicationId === appId);
    expect(mine).toHaveLength(1);
    expect(mine[0].sorobanTokenId).toBe(41);
  });

  it('reads token ids returned as bigint (u64) as well as number (u32)', () => {
    expect(mintModule.tokenIdFromNative(7)).toBe(7);
    expect(mintModule.tokenIdFromNative(36n)).toBe(36);
    expect(mintModule.tokenIdFromNative('x')).toBeNull();
    expect(mintModule.tokenIdFromNative(-1n)).toBeNull();
  });
});
