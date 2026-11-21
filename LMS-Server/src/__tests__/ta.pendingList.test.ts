/**
 * UX-002: TA grades reach the lecturer, and the learner gets the result.
 * TA feedback (ta_feedback) and the lecturer's send-back note (review_note)
 * are separate fields; neither overwrites the other or the learner-facing feedback.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import './setup.js';
import app from '../app.js';
import { execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

function user(roleId: string, name: string) {
  const userId = uuidv4();
  const email = `${name}-${userId.slice(0, 8)}@test.com`;
  execute("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')", [userId, name, email]);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
  return { userId, token: generateToken({ userId, email, role: 'student' as any }) };
}

function course(lecturerId: string, taId: string) {
  const id = uuidv4();
  execute("INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Course', 'desc', ?, '[]')", [id, `C-${id.slice(0, 6)}`]);
  execute('INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [id, lecturerId, lecturerId]);
  execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [id, taId, lecturerId]);
  return id;
}

function submission(studentRecordId: string, courseId: string, title = 'Essay') {
  const id = uuidv4();
  execute(
    "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, course_id, status) VALUES (?, ?, ?, 'desc', 'essay.pdf', 10, '/tmp/essay.pdf', ?, 'pending')",
    [id, studentRecordId, title, courseId],
  );
  return id;
}

describe('UX-002: TA grade review loop', () => {
  let lecturer: ReturnType<typeof user>;
  let otherLecturer: ReturnType<typeof user>;
  let admin: ReturnType<typeof user>;
  let ta: ReturnType<typeof user>;
  let student: ReturnType<typeof user>;
  let studentRecordId: string;
  let courseId: string;
  let otherCourseId: string;
  let subId: string;
  let otherSubId: string;

  const grade = (id: string, body: object) =>
    request(app).post(`/api/v1/ta/submissions/${id}/grade`).set('Authorization', `Bearer ${ta.token}`).send(body);

  beforeEach(() => {
    lecturer = user('role_instructor', 'Lena Lecturer');
    otherLecturer = user('role_instructor', 'Otto Other');
    admin = user('role_admin', 'Ada Admin');
    ta = user('role_ta', 'Tom Assistant');
    student = user('role_student', 'Sam Learner');
    studentRecordId = uuidv4();
    execute("INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'Sam Learner', ?, 'ENR-UX2', 'CS', 1)",
      [studentRecordId, student.userId, `sam-${studentRecordId.slice(0, 6)}@test.com`]);
    courseId = course(lecturer.userId, ta.userId);
    otherCourseId = course(otherLecturer.userId, ta.userId);
    subId = submission(studentRecordId, courseId);
    otherSubId = submission(studentRecordId, otherCourseId, 'Other essay');
  });

  it('TA grade stores proposed_status and ta_feedback without touching learner feedback', async () => {
    expect((await grade(subId, { status: 'rejected', feedback: 'Needs sources' })).status).toBe(200);
    expect(queryOne('SELECT grade_status, proposed_status, ta_feedback, feedback FROM submissions WHERE id = ?', [subId]))
      .toEqual({ grade_status: 'pending_approval', proposed_status: 'rejected', ta_feedback: 'Needs sources', feedback: null });
  });

  it('GET /submissions?gradeStatus=pending_approval is scoped to the lecturer\'s courses with staff fields', async () => {
    await grade(subId, { status: 'approved', feedback: 'Great' });
    await grade(otherSubId, { status: 'approved', feedback: 'Fine' });
    const res = await request(app).get('/api/v1/submissions?gradeStatus=pending_approval')
      .set('Authorization', `Bearer ${lecturer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.submissions.map((s: any) => s.id)).toEqual([subId]);
    expect(res.body.data.pagination.total).toBe(1);
    expect(res.body.data.submissions[0]).toMatchObject({
      studentName: 'Sam Learner', gradeStatus: 'pending_approval', gradedByName: 'Tom Assistant',
      proposedStatus: 'approved', taFeedback: 'Great',
    });
  });

  it('AC7: the learner response leaves out TA proposal fields while pending', async () => {
    await grade(subId, { status: 'approved', feedback: 'Great' });
    const res = await request(app).get('/api/v1/submissions').set('Authorization', `Bearer ${student.token}`);
    const mine = res.body.data.submissions.find((s: any) => s.id === subId);
    expect(mine.status).toBe('pending');
    for (const key of ['gradeStatus', 'proposedStatus', 'taFeedback', 'gradedByName', 'reviewNote', 'grade_status']) {
      expect(mine).not.toHaveProperty(key);
    }
    expect(mine.feedback).toBeUndefined();
  });

  it('approve defaults to the TA proposal, notifies the learner, and the learner then sees the TA feedback', async () => {
    await grade(subId, { status: 'rejected', feedback: 'Needs sources' });
    const res = await request(app).post(`/api/v1/ta/submissions/${subId}/approve-grade`)
      .set('Authorization', `Bearer ${lecturer.token}`).send({});
    expect(res.status).toBe(200);
    expect(queryOne('SELECT status, grade_status, ta_feedback FROM submissions WHERE id = ?', [subId]))
      .toEqual({ status: 'rejected', grade_status: 'approved', ta_feedback: 'Needs sources' });
    expect(queryOne('SELECT type FROM notifications WHERE user_id = ?', [student.userId])).not.toBeNull();
    const mine = (await request(app).get('/api/v1/submissions').set('Authorization', `Bearer ${student.token}`))
      .body.data.submissions.find((s: any) => s.id === subId);
    expect(mine).toMatchObject({ status: 'rejected', feedback: 'Needs sources' });
  });

  it('approve refuses a status outside approved|rejected', async () => {
    await grade(subId, { status: 'approved' });
    const res = await request(app).post(`/api/v1/ta/submissions/${subId}/approve-grade`)
      .set('Authorization', `Bearer ${lecturer.token}`).send({ status: 'pending' });
    expect(res.status).toBe(400);
  });

  it('send back requires a note, stores it as review_note and keeps both feedback fields', async () => {
    execute("UPDATE submissions SET feedback = 'Earlier lecturer feedback' WHERE id = ?", [subId]);
    await grade(subId, { status: 'approved', feedback: 'Great' });
    const send = (body: object) => request(app).post(`/api/v1/ta/submissions/${subId}/reject-grade`)
      .set('Authorization', `Bearer ${lecturer.token}`).send(body);
    expect((await send({ note: '  ' })).status).toBe(400);
    const res = await send({ note: 'Too lenient' });
    expect(res.status).toBe(200);
    expect(res.body.data.gradeStatus).toBe('sent_back');
    expect(queryOne('SELECT review_note, ta_feedback, feedback, status FROM submissions WHERE id = ?', [subId]))
      .toEqual({ review_note: 'Too lenient', ta_feedback: 'Great', feedback: 'Earlier lecturer feedback', status: 'pending' });

    const list = await request(app).get(`/api/v1/ta/courses/${courseId}/submissions`).set('Authorization', `Bearer ${ta.token}`);
    expect(list.body.data.submissions.find((s: any) => s.id === subId)).toMatchObject({
      grade_status: 'sent_back', review_note: 'Too lenient', student_name: 'Sam Learner', ta_feedback: 'Great',
    });

    // Regrading returns it to the lecturer's queue.
    await grade(subId, { status: 'approved', feedback: 'Regraded' });
    expect(queryOne('SELECT grade_status, ta_feedback FROM submissions WHERE id = ?', [subId]))
      .toEqual({ grade_status: 'pending_approval', ta_feedback: 'Regraded' });
  });

  it('AC8: a lecturer of another course cannot approve or send back; an admin can', async () => {
    await grade(subId, { status: 'approved' });
    const approve = (token: string) => request(app).post(`/api/v1/ta/submissions/${subId}/approve-grade`)
      .set('Authorization', `Bearer ${token}`).send({});
    const reject = await request(app).post(`/api/v1/ta/submissions/${subId}/reject-grade`)
      .set('Authorization', `Bearer ${otherLecturer.token}`).send({ note: 'no' });
    expect(reject.status).toBe(403);
    expect((await approve(otherLecturer.token)).status).toBe(403);
    expect(queryOne<{ grade_status: string }>('SELECT grade_status FROM submissions WHERE id = ?', [subId])!.grade_status)
      .toBe('pending_approval');
    expect((await approve(admin.token)).status).toBe(200);
  });

  it('a direct lecturer review settles a pending TA grade, so it leaves the queue and cannot be decided again', async () => {
    await grade(subId, { status: 'rejected', feedback: 'Weak' });
    const review = await request(app).post(`/api/v1/submissions/${subId}/review`)
      .set('Authorization', `Bearer ${lecturer.token}`).send({ status: 'approved', feedback: 'Good after all' });
    expect(review.status).toBe(200);
    expect(queryOne<{ grade_status: string }>('SELECT grade_status FROM submissions WHERE id = ?', [subId])!.grade_status).toBe('direct');
    const queue = await request(app).get('/api/v1/submissions?gradeStatus=pending_approval').set('Authorization', `Bearer ${lecturer.token}`);
    expect(queue.body.data.pagination.total).toBe(0);
    for (const path of ['approve-grade', 'reject-grade']) {
      const res = await request(app).post(`/api/v1/ta/submissions/${subId}/${path}`)
        .set('Authorization', `Bearer ${lecturer.token}`).send({ note: 'x' });
      expect(res.status).toBe(400);
    }
    expect((await grade(subId, { status: 'rejected' })).status).toBe(400);
    expect(queryOne<{ status: string }>('SELECT status FROM submissions WHERE id = ?', [subId])!.status).toBe('approved');
  });

  it('the TA list includes the learner name', async () => {
    const res = await request(app).get(`/api/v1/ta/courses/${courseId}/submissions`).set('Authorization', `Bearer ${ta.token}`);
    expect(res.body.data.submissions[0]).toMatchObject({ id: subId, student_name: 'Sam Learner', file_name: 'essay.pdf' });
  });
});
