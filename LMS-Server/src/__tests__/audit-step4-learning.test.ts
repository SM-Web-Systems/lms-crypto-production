import { seedTestAccount } from './helpers/rbacFixtures.js';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
type UntrustedRoleHint = 'student' | 'lecturer' | 'admin';

const hash = bcrypt.hashSync('audit-learning', 4);
function actor(roleId = 'role_student', legacy: UntrustedRoleHint = 'student') {
  const id = randomUUID(), email = `${id}@learning.invalid`;
  seedTestAccount(db, `INSERT INTO users (id,name,email,password_hash) VALUES (?,'Learner',?,?)`, [id,email,hash], [({student:"role_student",lecturer:"role_instructor",admin:"role_admin"}[(legacy) as "student"|"lecturer"|"admin"])]).changes;
  execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
  execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [id,roleId]);
  return { id, token: generateToken({userId:id,email,role:legacy}) };
}
function seed() {
  const student = actor(), instructor = actor('role_instructor'), courseId = randomUUID(), quizId = randomUUID();
  const items = [
    {id:'video',type:'video',title:'Video',url:'https://example.com/lesson.mp4'},
    {id:'audio',type:'audio',title:'Audio',url:'https://example.com/lesson.mp3'},
    {id:'reading',type:'text',title:'Reading',url:'https://example.com/notes.md'},
    {id:'link',type:'link',title:'Link',url:'https://example.com'},
    {id:'pdf',type:'pdf',title:'PDF',fileUrl:'https://example.com/notes.pdf'},
    {id:'download',type:'download',title:'Download',fileUrl:'https://example.com/file.zip',fileName:'file.zip'},
    {id:'quiz',type:'quiz',title:'Quiz',quizId},
    {id:'assignment',type:'assignment',title:'Assignment',allowedMimeTypes:['text/plain'],maxFileSize:100},
  ];
  const weeks = [{id:'week-2',title:'Practice',order:2,sections:[{id:'section-2',title:'Practice',items:items.slice(6)}]},
    {id:'week-1',title:'Foundations',order:1,sections:[{id:'section-1',title:'Learn',items:items.slice(0,6)}]}];
  execute("INSERT INTO courses (id,title,course_code,sections,approval_status) VALUES (?,'Learning parity',?,?,'published')",[courseId,courseId,JSON.stringify(weeks)]);
  execute('INSERT INTO user_course_codes (user_id,course_code) VALUES (?,?)',[student.id,courseId]);
  execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)',[courseId,instructor.id]);
  execute("INSERT INTO students (id,user_id,name,email,enrollment_number,department,semester) VALUES (?,?,'Learner',?,?,'Audit',1)",[student.id,student.id,`${student.id}@learning.invalid`,student.id]);
  execute("INSERT INTO quizzes (id,title,course_id,questions) VALUES (?,'Lesson quiz',?,?)",[quizId,courseId,JSON.stringify([{id:'q',type:'multiple_choice',question:'Choose A',options:['A','B'],correctIndex:0,order:1}])]);
  return {student,instructor,courseId,quizId};
}
const lesson = (courseId: string, itemId: string) => `/api/v1/courses/${courseId}/lessons/${itemId}`;

describe('A10-A12 - native learning uses the web API contract', () => {
  it('course reads preserve authored week names, order values and every lesson type', async () => {
    const {student,courseId}=seed();
    const res=await request(app).get('/api/v1/courses?access=enrolled').auth(student.token,{type:'bearer'});
    expect(res.status).toBe(200);
    const course=res.body.data.courses.find((course:{id:string})=>course.id===courseId);
    expect(course.weeks.map((week:{title:string})=>week.title)).toEqual(['Practice','Foundations']);
    expect(course.weeks.map((week:{order:number})=>week.order)).toEqual([2,1]);
    expect(course.sections.flatMap((section:{items:{type:string}[]})=>section.items).map((item:{type:string})=>item.type)).toEqual(['quiz','assignment','video','audio','text','link','pdf','download']);
  });
  it('saves resume position without completing a lesson and exposes it to the next client', async () => {
    const {student,courseId}=seed();
    const res=await request(app).put(`${lesson(courseId,'audio')}/progress`).auth(student.token,{type:'bearer'}).send({positionSeconds:45,progressPercent:30});
    expect(res.status).toBe(200);
    const rows=await request(app).get(`/api/v1/courses/${courseId}/lessons/completions?view=own`).auth(student.token,{type:'bearer'});
    expect(rows.body.data.completions).toEqual([expect.objectContaining({item_id:'audio',section_id:'section-1',last_position_s:45,progress_pct:30,completed_at:null})]);
    const progress=await request(app).get(`/api/v1/courses/${courseId}/progress`).auth(student.token,{type:'bearer'});
    expect(progress.body.data.completedLessonItems).toBe(0);
  });
  it('keeps completion idempotent and at 100% after a late playback write', async () => {
    const {student,courseId}=seed();
    for(let i=0;i<2;i++) expect((await request(app).post(`${lesson(courseId,'audio')}/complete`).auth(student.token,{type:'bearer'})).status).toBe(200);
    await request(app).put(`${lesson(courseId,'audio')}/progress`).auth(student.token,{type:'bearer'}).send({positionSeconds:10,progressPercent:5});
    expect(queryOne('SELECT progress_pct,last_position_s,completed_at FROM lesson_completions WHERE user_id=? AND item_id=?',[student.id,'audio'])).toMatchObject({progress_pct:100,last_position_s:10,completed_at:expect.any(String)});
    expect(queryOne<{count:number}>('SELECT COUNT(*) as count FROM lesson_completions WHERE user_id=?',[student.id])?.count).toBe(1);
  });
  it('keeps the furthest percentage while allowing the resume cursor to seek backwards', async () => {
    const {student,courseId}=seed();
    for(const [positionSeconds,progressPercent] of [[90,90],[20,20]]) await request(app).put(`${lesson(courseId,'video')}/progress`).auth(student.token,{type:'bearer'}).send({positionSeconds,progressPercent});
    expect(queryOne('SELECT progress_pct,last_position_s FROM lesson_completions WHERE user_id=?',[student.id])).toEqual({progress_pct:90,last_position_s:20});
  });
  it.each(['complete','progress'])('denies %s writes from a stale legacy admin with only sponsor permissions', async (action) => {
    const {courseId}=seed(), sponsor=actor('role_sponsor','admin');
    const req=action==='complete'?request(app).post(`${lesson(courseId,'audio')}/complete`):request(app).put(`${lesson(courseId,'audio')}/progress`).send({positionSeconds:10,progressPercent:5});
    expect((await req.auth(sponsor.token,{type:'bearer'})).status).toBe(403);
  });
  it.each(['quiz','assignment'])('cannot manually complete or write playback progress for %s', async (item) => {
    const {student,courseId}=seed();
    expect((await request(app).post(`${lesson(courseId,item)}/complete`).auth(student.token,{type:'bearer'})).status).toBe(409);
    expect((await request(app).put(`${lesson(courseId,item)}/progress`).auth(student.token,{type:'bearer'}).send({positionSeconds:1,progressPercent:100})).status).toBe(400);
  });
  it('a quiz pass completes an existing progress-only lesson row', async () => {
    const {student,courseId,quizId}=seed();
    execute('INSERT INTO lesson_completions (id,user_id,course_id,item_id,section_id,completed_at,progress_pct) VALUES (?,?,?,\'quiz\',\'section-2\',NULL,20)',[randomUUID(),student.id,courseId]);
    const res=await request(app).post(`/api/v1/quizzes/${quizId}/submit`).auth(student.token,{type:'bearer'}).send({answers:{q:'A'}});
    expect(res.status).toBe(201);
    expect(res.body.data.passed).toBe(true);
    expect(queryOne('SELECT completed_at,progress_pct FROM lesson_completions WHERE user_id=?',[student.id])).toEqual({completed_at:expect.any(String),progress_pct:100});
  });
  it('an assignment keeps its association and completes only on approval, including an existing progress row', async () => {
    const {student,instructor,courseId}=seed();
    const created=await request(app).post('/api/v1/submissions').auth(student.token,{type:'bearer'})
      .field('title','Practice').field('description','Assignment notes').field('courseId',courseId).field('weekId','week-2').field('itemId','assignment')
      .attach('file',Buffer.from('My work'),{filename:'work.txt',contentType:'text/plain'});
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({courseId,weekId:'week-2',itemId:'assignment',status:'pending'});
    expect(queryOne('SELECT id FROM lesson_completions WHERE user_id=?',[student.id])).toBeNull();
    execute('INSERT INTO lesson_completions (id,user_id,course_id,item_id,section_id,completed_at) VALUES (?,?,?,\'assignment\',\'section-2\',NULL)',[randomUUID(),student.id,courseId]);
    const review=await request(app).post(`/api/v1/submissions/${created.body.data.id}/review`).auth(instructor.token,{type:'bearer'}).send({status:'approved',feedback:'Approved'});
    expect(review.status).toBe(200);
    expect(queryOne('SELECT completed_at,progress_pct FROM lesson_completions WHERE user_id=?',[student.id])).toEqual({completed_at:expect.any(String),progress_pct:100});
  });
  it.each([['reading','week-1'],['assignment','week-1']])('rejects an invalid assignment association (%s, %s)', async (itemId,weekId) => {
    const {student,courseId}=seed();
    const res=await request(app).post('/api/v1/submissions').auth(student.token,{type:'bearer'})
      .field('title','Invalid').field('description','Invalid association').field('courseId',courseId).field('weekId',weekId).field('itemId',itemId)
      .attach('file',Buffer.from('work'),{filename:'work.txt',contentType:'text/plain'});
    expect(res.status).toBe(400);
  });
  it('the shared course progress and certificate requirements see completion from every lesson type', async () => {
    const {student,instructor,courseId,quizId}=seed();
    execute("INSERT INTO course_completion_requirements (id,course_id,require_all_lessons,required_quiz_ids,min_quiz_score) VALUES (?,?,1,?,70)",[randomUUID(),courseId,JSON.stringify([quizId])]);
    for(const item of ['video','audio','reading','link','pdf','download']) expect((await request(app).post(`${lesson(courseId,item)}/complete`).auth(student.token,{type:'bearer'})).status).toBe(200);
    await request(app).post(`/api/v1/quizzes/${quizId}/submit`).auth(student.token,{type:'bearer'}).send({answers:{q:'A'}});
    await request(app).post(`/api/v1/courses/${courseId}/students/${student.id}/lessons/assignment/complete`).auth(instructor.token,{type:'bearer'});
    const progress=await request(app).get(`/api/v1/courses/${courseId}/progress`).auth(student.token,{type:'bearer'});
    expect(progress.body.data).toMatchObject({completedLessonItems:8,totalLessonItems:8,lessonPercentage:100,meetsAllRequirements:true,canApplyForCertificate:true});
  });
});
