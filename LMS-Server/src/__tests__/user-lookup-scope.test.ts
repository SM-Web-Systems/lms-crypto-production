/**
 * WI-11 — GET /users/:id RBAC Scope Enforcement
 *
 * Approved policy:
 * - Admins may view any user profile (full details including email)
 * - Instructors may view only users enrolled in courses they teach (limited fields)
 * - Learners may view only their own profile
 * - Sponsors may view only users in their sponsored cohorts (limited fields)
 * - No role may access another user's sensitive profile data without authorization
 *
 * USR-01 — Self-access returns full profile with email
 * USR-02 — Admin access to any user returns full profile with email
 * USR-03 — Instructor access to student in own course returns limited profile (no email)
 * USR-04 — Instructor access to student NOT in own course returns 403
 * USR-05 — Sponsor access to user in own cohort returns limited profile (no email)
 * USR-06 — Sponsor access to user NOT in own cohort returns 403
 * USR-07 — Student (learner) access to another user returns 403
 * USR-08 — TA access to another user returns 403 (no user.view_all)
 * USR-09 — Invalid/nonexistent user ID returns 404 (admin)
 * USR-10 — Unauthenticated access returns 401
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUserLookupData() {
  const adminId = uuidv4();
  const instructorId = uuidv4();
  const studentUserId = uuidv4();
  const studentId = uuidv4();
  const otherStudentUserId = uuidv4();
  const otherStudentId = uuidv4();
  const sponsorId = uuidv4();
  const taId = uuidv4();
  const courseId = uuidv4();
  const course2Id = uuidv4();
  const code = `USR-${uuidv4().slice(0, 6)}`;
  const code2 = `USR2-${uuidv4().slice(0, 6)}`;
  const cohortId = uuidv4();

  db.exec(`
    INSERT INTO users (id,name,email,password_hash)
    VALUES
      ('${adminId}','Admin User','admin-usr-${adminId.slice(0, 6)}@test.com','${HASH}'),
      ('${instructorId}','Instructor User','inst-usr-${instructorId.slice(0, 6)}@test.com','${HASH}'),
      ('${studentUserId}','Student A','stud-a-${studentUserId.slice(0, 6)}@test.com','${HASH}'),
      ('${otherStudentUserId}','Student B','stud-b-${otherStudentUserId.slice(0, 6)}@test.com','${HASH}'),
      ('${sponsorId}','Sponsor User','sponsor-${sponsorId.slice(0, 6)}@test.com','${HASH}'),
      ('${taId}','TA User','ta-${taId.slice(0, 6)}@test.com','${HASH}');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${adminId}','role_admin');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${instructorId}','role_instructor');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${studentUserId}','role_student');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${otherStudentUserId}','role_student');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${sponsorId}','role_student');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${taId}','role_student');


    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES
      ('${studentId}', '${studentUserId}', 'Student A', 'stud-a-${studentUserId.slice(0, 6)}@test.com', 'USR-001', 'CS', 1),
      ('${otherStudentId}', '${otherStudentUserId}', 'Student B', 'stud-b-${otherStudentUserId.slice(0, 6)}@test.com', 'USR-002', 'CS', 1);

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES
      ('${courseId}', 'Course 1', 'Test course 1', '${code}', '[]'),
      ('${course2Id}', 'Course 2', 'Test course 2', '${code2}', '[]');

    -- Student A is enrolled in Course 1
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentUserId}', '${code}');
    -- Student B is enrolled in Course 2 (different course)
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${otherStudentUserId}', '${code2}');

    -- Instructor teaches Course 1
    INSERT INTO course_lecturers (course_id, user_id, assigned_by)
    VALUES ('${courseId}', '${instructorId}', '${adminId}');

    -- Sponsor owns a cohort, Student A is a member
    INSERT INTO sponsor_cohorts (id, name, course_id, sponsor_user_id, status)
    VALUES ('${cohortId}', 'Test Cohort', '${courseId}', '${sponsorId}', 'active');
    INSERT INTO cohort_members (cohort_id, user_id)
    VALUES ('${cohortId}', '${studentUserId}');
  `);

  // Assign RBAC roles
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminId, 'role_admin']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [instructorId, 'role_instructor']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [studentUserId, 'role_student']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [otherStudentUserId, 'role_student']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [sponsorId, 'role_sponsor']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [taId, 'role_ta']);

  return {
    adminId, instructorId, studentUserId, studentId,
    otherStudentUserId, otherStudentId, sponsorId, taId,
    courseId, course2Id, cohortId, code, code2,
  };
}

describe('WI-11 — GET /users/:id scope enforcement', () => {
  it('USR-01 — self-access returns full profile with email', async () => {
    const { studentUserId } = seedUserLookupData();
    const token = makeToken({ userId: studentUserId, email: `stud-a-${studentUserId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/users/${studentUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(studentUserId);
    expect(res.body.data.email).toBeDefined();
    expect(res.body.data.displayName).toBeDefined();
  });

  it('USR-02 — admin access to any user returns full profile with email', async () => {
    const { adminId, otherStudentUserId } = seedUserLookupData();
    const token = makeToken({ userId: adminId, email: `admin-usr-${adminId.slice(0, 6)}@test.com`, role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/users/${otherStudentUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(otherStudentUserId);
    expect(res.body.data.email).toBeDefined();
    expect(res.body.data.displayName).toBeDefined();
  });

  it('USR-03 — instructor access to student in own course returns limited profile (no email)', async () => {
    const { instructorId, studentUserId } = seedUserLookupData();
    const token = makeToken({ userId: instructorId, email: `inst-usr-${instructorId.slice(0, 6)}@test.com`, role: 'lecturer' });

    const res = await request(app)
      .get(`/api/v1/users/${studentUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(studentUserId);
    expect(res.body.data.displayName).toBeDefined();
    // Instructor should NOT see email of other users
    expect(res.body.data.email).toBeUndefined();
  });

  it('USR-04 — instructor access to student NOT in own course returns 403', async () => {
    const { instructorId, otherStudentUserId } = seedUserLookupData();
    const token = makeToken({ userId: instructorId, email: `inst-usr-${instructorId.slice(0, 6)}@test.com`, role: 'lecturer' });

    const res = await request(app)
      .get(`/api/v1/users/${otherStudentUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('USR-05 — sponsor access to user in own cohort returns limited profile (no email)', async () => {
    const { sponsorId, studentUserId } = seedUserLookupData();
    const token = makeToken({ userId: sponsorId, email: `sponsor-${sponsorId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/users/${studentUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(studentUserId);
    expect(res.body.data.displayName).toBeDefined();
    // Sponsor should NOT see email
    expect(res.body.data.email).toBeUndefined();
  });

  it('USR-06 — sponsor access to user NOT in own cohort returns 403', async () => {
    const { sponsorId, otherStudentUserId } = seedUserLookupData();
    const token = makeToken({ userId: sponsorId, email: `sponsor-${sponsorId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/users/${otherStudentUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('USR-07 — student access to another user returns 403', async () => {
    const { studentUserId, otherStudentUserId } = seedUserLookupData();
    const token = makeToken({ userId: studentUserId, email: `stud-a-${studentUserId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/users/${otherStudentUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('USR-08 — TA access to another user returns 403', async () => {
    const { taId, studentUserId } = seedUserLookupData();
    const token = makeToken({ userId: taId, email: `ta-${taId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/users/${studentUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('USR-09 — invalid user ID returns 404 for admin', async () => {
    const { adminId } = seedUserLookupData();
    const token = makeToken({ userId: adminId, email: `admin-usr-${adminId.slice(0, 6)}@test.com`, role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/users/${uuidv4()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('USR-10 — unauthenticated access returns 401', async () => {
    seedUserLookupData();

    const res = await request(app)
      .get(`/api/v1/users/${uuidv4()}`);

    expect(res.status).toBe(401);
  });
});
