import { seedTestAccount } from './helpers/rbacFixtures.js';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
type UntrustedRoleHint = 'student' | 'lecturer' | 'admin';

const hash = bcrypt.hashSync('audit-password', 4);
function actor(role: string, legacy: UntrustedRoleHint = 'student') {
  const id = randomUUID(), email = `${id}@audit.invalid`;
  seedTestAccount(db, `INSERT INTO users (id,name,email,password_hash) VALUES (?,'Audit account',?,?)`, [id,email,hash], [({student:"role_student",lecturer:"role_instructor",admin:"role_admin"}[(legacy) as "student"|"lecturer"|"admin"])]).changes;
  execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
  execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [id,role]);
  return {id,email,token:generateToken({userId:id,email,role:legacy})};
}
function course(tenantId: string | null = null, status = 'published') {
  const id = randomUUID();
  execute("INSERT INTO courses (id,title,course_code,sections,tenant_id,approval_status) VALUES (?, 'Audit course', ?, '[]', ?, ?)",[id,id,tenantId,status]);
  return id;
}
function tenant(userId: string) {
  const id = randomUUID();
  execute("INSERT INTO tenants (id,name,slug) VALUES (?, 'Audit tenant', ?)",[id,id]);
  execute("INSERT INTO tenant_users (tenant_id,user_id,tenant_role) VALUES (?,?,'admin')",[id,userId]);
  return id;
}
function get(a: ReturnType<typeof actor>, path: string) { return request(app).get('/api/v1'+path).auth(a.token,{type:'bearer'}); }

describe('A03 — effective authorization context', () => {
  it('login and session hydration return the same permissions and workspaces', async () => {
    const a = actor('role_sponsor');
    const login = await request(app).post('/api/v1/auth/login').send({email:a.email,password:'audit-password'});
    const me = await get(a,'/auth/me');
    expect(login.status).toBe(200);
    expect(me.body.data).toMatchObject({rbacRoles:['sponsor'],workspaces:['sponsor'],defaultWorkspace:'sponsor',adminTier:null});
    for (const key of ['permissions','workspaces','rbacRoles','assignedCourses','adminTier']) expect(login.body.data.user[key]).toEqual(me.body.data[key]);
  });
  it('multi-role users retain both workspaces and prioritize staff over student', async () => {
    const a = actor('role_student');
    execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)',[a.id,'role_instructor']);
    const id = course();
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)',[id,a.id]);
    const me = await get(a,'/auth/me');
    expect(me.body.data.workspaces).toEqual(['lecturer','student']);
    expect(me.body.data.defaultWorkspace).toBe('lecturer');
    expect(me.body.data.assignedCourses.instructor).toEqual([id]);
  });
  it('role names and stale legacy admin do not grant admin navigation', async () => {
    execute("INSERT INTO roles (id,name,label,is_system) VALUES ('audit-custom','super-admin-imposter','Read course',0)");
    execute("INSERT INTO role_permissions (role_id,permission_id) VALUES ('audit-custom','perm_course_view')");
    const a = actor('audit-custom','admin');
    const me = await get(a,'/auth/me');
    expect(me.body.data.workspaces).toEqual(['student']);
    expect(me.body.data.adminTier).toBeNull();
    expect((await get(a,'/admin/roles')).status).toBe(403);
  });
  it('no effective roles means no workspace, regardless of legacy role', async () => {
    const a = actor('role_admin','admin');
    execute('DELETE FROM user_roles WHERE user_id = ?',[a.id]);
    const me = await get(a,'/auth/me');
    expect(me.body.data.workspaces).toEqual([]);
    expect(me.body.data.defaultWorkspace).toBeNull();
    expect((await get(a,'/courses')).status).toBe(403);
  });
  it('additive grants invalidate the previous session and a new session receives current context', async () => {
    const admin = actor('role_admin2','admin'), a = actor('role_student');
    expect((await request(app).post(`/api/v1/admin/users/${a.id}/roles`).auth(admin.token,{type:'bearer'}).send({roleId:'role_sponsor'})).status).toBe(201);
    expect((await get(a,'/auth/me')).status).toBe(401);
    a.token=generateToken({userId:a.id,email:a.email,role:'student'});
    const me = await get(a,'/auth/me');
    expect(me.body.data.workspaces).toEqual(['sponsor','student']);
  });
});

describe('A04 — shared course assignment and tenant scope', () => {
  it('RBAC instructor with legacy student can list, read and inspect roster without enrollment', async () => {
    const a = actor('role_instructor'), student = actor('role_student');
    const id = course(), other = course();
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)',[id,a.id]);
    execute('INSERT INTO user_course_codes (user_id,course_code) VALUES (?,?)',[student.id,id]);
    expect((await get(a,'/courses')).body.data.courses.map((c: {id:string})=>c.id)).toEqual([id]);
    expect((await get(a,`/courses/${id}`)).status).toBe(200);
    expect((await get(a,`/courses/${id}/members`)).body.data.members[0].id).toBe(student.id);
    expect((await get(a,`/courses/${other}`)).status).toBe(403);
    expect((await get(a,`/courses/${other}/members`)).status).toBe(403);
    expect((await get(a,`/courses/${other}/submissions`)).status).toBe(403);
    expect((await get(a,'/users/me/courses')).body.data.courseIds).toEqual([id]);
  });
  it('instructor cannot edit or import an unassigned course by retaining legacy student', async () => {
    const a = actor('role_instructor'), id = course();
    expect((await request(app).put(`/api/v1/courses/${id}`).auth(a.token,{type:'bearer'}).send({title:'Changed'})).status).toBe(403);
    expect((await request(app).post(`/api/v1/courses/${id}/import`).auth(a.token,{type:'bearer'}).send({sections:[]})).status).toBe(403);
    expect((await request(app).post(`/api/v1/courses/${id}/members`).auth(a.token,{type:'bearer'}).send({userId:a.id})).status).toBe(403);
    expect((await request(app).delete(`/api/v1/courses/${id}`).auth(a.token,{type:'bearer'})).status).toBe(403);
  });
  it('editor discovery excludes courses accessible only through student enrollment', async () => {
    const a = actor('role_instructor');
    const assigned=course(), enrolled=course();
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)',[assigned,a.id]);
    execute('INSERT INTO user_course_codes (user_id,course_code) VALUES (?,?)',[a.id,enrolled]);
    expect((await get(a,'/courses')).body.data.courses).toHaveLength(2);
    expect((await get(a,'/courses?access=manage')).body.data.courses.map((c:{id:string})=>c.id)).toEqual([assigned]);
    expect((await get(a,'/courses?access=enrolled')).body.data.courses.map((c:{id:string})=>c.id)).toEqual([enrolled]);
    expect((await get(a,'/courses?access=unknown')).status).toBe(400);
  });
  it('TA can read assigned courses and rosters but cannot manage them', async () => {
    const a = actor('role_ta'), id = course();
    execute('INSERT INTO course_tas (course_id,user_id,assigned_by) VALUES (?,?,?)',[id,a.id,a.id]);
    expect((await get(a,`/courses/${id}`)).status).toBe(200);
    expect((await get(a,`/courses/${id}/members`)).status).toBe(200);
    expect((await get(a,`/courses/${id}/submissions`)).status).toBe(200);
    expect((await request(app).put(`/api/v1/courses/${id}`).auth(a.token,{type:'bearer'}).send({title:'Changed'})).status).toBe(403);
  });
  it('new instructor drafts are assigned back to their creator and can be read immediately', async () => {
    const a = actor('role_instructor');
    const id = randomUUID();
    const res = await request(app).post('/api/v1/courses').auth(a.token,{type:'bearer'}).send({id,title:'Draft',courseCode:'DRAFT-'+id,sections:[]});
    expect(res.status).toBe(201);
    expect((await get(a,`/courses/${id}`)).status).toBe(200);
    expect(queryOne('SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',[id,a.id])).not.toBeNull();
  });
  it('administrator course reads and writes stay within their administered tenants', async () => {
    const a = actor('role_admin'), b = actor('role_admin');
    const own = course(tenant(a.id)), other = course(tenant(b.id));
    expect((await get(a,'/courses')).body.data.courses.map((c:{id:string})=>c.id)).toEqual([own]);
    expect((await get(a,`/courses/${other}`)).status).toBe(403);
    expect((await get(a,`/courses/${other}/members`)).status).toBe(403);
    expect((await get(a,`/courses/${other}/submissions`)).status).toBe(403);
    expect((await request(app).put(`/api/v1/courses/${other}`).auth(a.token,{type:'bearer'}).send({title:'Changed'})).status).toBe(403);
    expect((await request(app).delete(`/api/v1/courses/${other}`).auth(a.token,{type:'bearer'})).status).toBe(403);
  });
  it('student cannot read a draft through a direct URL despite having its course code', async () => {
    const a = actor('role_student'), id = course(null,'draft');
    execute('INSERT INTO user_course_codes (user_id,course_code) VALUES (?,?)',[a.id,id]);
    expect((await get(a,`/courses/${id}`)).status).toBe(403);
  });
});

describe('A04 — related resources use effective course scope', () => {
  function seed() {
    execute(`CREATE TABLE announcements (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'general', course_id TEXT, author_id TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
    const instructor=actor('role_instructor'), student=actor('role_student');
    const assigned=course(), outside=course();
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)',[assigned,instructor.id]);
    execute("INSERT INTO students (id,user_id,name,email,enrollment_number,department,semester) VALUES (?,?,'Student',?,?,'Audit',1)",[student.id,student.id,student.email,student.id]);
    for(const id of [assigned,outside]) {
      execute('INSERT INTO user_course_codes (user_id,course_code) VALUES (?,?)',[student.id,id]);
      execute("INSERT INTO course_documents (id,title,description,category,file_name,file_size,file_path,course_ids,uploaded_by_id) VALUES (?, 'Document','Description','Other','file.pdf',10,'unused',?,?)",[id,JSON.stringify([id]),instructor.id]);
      execute("INSERT INTO announcements (id,title,body,scope,course_id,author_id) VALUES (?,'Notice','Body','course',?,?)",[id,id,instructor.id]);
      execute("INSERT INTO quizzes (id,title,course_id,questions) VALUES (?,'Quiz',?,'[]')",[id,id]);
      execute("INSERT INTO quiz_completions (id,quiz_id,user_id,score,total,passed,answers) VALUES (?,?,?,100,100,1,'{}')",[id,id,student.id]);
      execute("INSERT INTO lesson_completions (id,user_id,course_id,item_id,section_id) VALUES (?,?,?,'lesson','section')",[id,student.id,id]);
      execute("INSERT INTO submissions (id,student_id,title,description,file_name,file_size,file_path,course_id) VALUES (?,?,'Work','Description','file.pdf',10,'unused',?)",[id,student.id,id]);
      execute("INSERT INTO course_nft_applications (id,user_id,course_id,wallet_address) VALUES (?,?,?,'GTEST')",[id,student.id,id]);
    }
    return {instructor,student,assigned,outside};
  }
  it('instructor resources include assignments and exclude unrelated courses', async () => {
    const {instructor:a,assigned,outside}=seed();
    for (const [path,key] of [['/documents','documents'],['/announcements','announcements'],['/quizzes','quizzes'],['/submissions','submissions']] as const) {
      const res=await get(a,path);
      expect(res.status,path).toBe(200);
      expect(res.body.data[key].map((r:{id:string})=>r.id),path).toEqual([assigned]);
    }
    expect((await get(a,`/documents/${assigned}`)).status).toBe(200);
    expect((await get(a,`/documents/${outside}`)).status).toBe(403);
    expect((await get(a,`/quizzes/${outside}`)).status).toBe(403);
    expect((await get(a,`/submissions/${outside}`)).status).toBe(403);
  });
  it('completion reads support RBAC instructors and deny unrelated analytics', async () => {
    const {instructor:a,student,assigned,outside}=seed();
    const lessons=await get(a,`/courses/${assigned}/lessons/completions`);
    expect(lessons.status).toBe(200);
    expect(lessons.body.data.completions[0].user_id).toBe(student.id);
    expect((await get(a,`/courses/${assigned}/lessons/completions?view=own`)).body.data.completions).toEqual([]);
    expect((await get(a,`/courses/${outside}/lessons/completions`)).status).toBe(403);
    expect((await get(a,`/quizzes/completions?userId=${student.id}`)).body.data.completions.map((c:{quizId:string})=>c.quizId)).toEqual([assigned]);
    expect((await get(a,`/quizzes/${outside}/completion?userId=${student.id}`)).status).toBe(403);
    expect((await get(a,`/courses/${assigned}/progress/all`)).status).toBe(200);
  });
  it('certificate review lists follow assignment and personal queries stay personal', async () => {
    const {instructor:a,assigned,outside}=seed();
    expect((await get(a,`/courses/${assigned}/completions/applications`)).body.data.applications).toHaveLength(1);
    expect((await get(a,`/courses/${outside}/completions/applications`)).status).toBe(403);
    expect((await get(a,'/admin/certificates')).body.data.certificates.map((c:{courseId:string})=>c.courseId)).toEqual([assigned]);
    expect((await get(a,'/submissions?view=own')).body.data.submissions).toEqual([]);
  });
  it('stale legacy admin cannot use other learners completion IDs', async () => {
    const {student,assigned}=seed();
    const a=actor('role_student','admin');
    expect((await get(a,`/quizzes/completions?userId=${student.id}`)).status).toBe(403);
    expect((await get(a,`/quizzes/${assigned}/completion?userId=${student.id}`)).status).toBe(403);
    expect((await get(a,`/courses/${assigned}/lessons/completions`)).status).toBe(403);
  });
});

describe('A09 — role actions match enforced privilege boundaries', () => {
  it('baseline admin has no role-management actions', async () => {
    const a = actor('role_admin','admin'), target = actor('role_student');
    expect((await get(a,`/admin/users/${target.id}/role-options`)).status).toBe(403);
    expect((await get(a,'/auth/me')).body.data.permissions).not.toContain('user.assign_role');
  });
  it('admin-2 options exclude assigned, peer and super-admin role grants', async () => {
    const a = actor('role_admin2','admin'), target = actor('role_student');
    const res = await get(a,`/admin/users/${target.id}/role-options`);
    expect(res.status).toBe(200);
    expect(res.body.data.canModify).toBe(true);
    expect(res.body.data.revocableRoleIds).toEqual(['role_student']);
    const ids=res.body.data.assignableRoles.map((r:{id:string})=>r.id);
    expect(ids).toContain('role_instructor');
    expect(ids).not.toContain('role_student');
    expect(ids).not.toContain('role_admin2');
    expect(ids).not.toContain('role_super_admin');
  });
  it('self and peer targets have no actions, and forged peer assignments are rejected', async () => {
    const a = actor('role_admin2','admin'), peer=actor('role_admin2','admin');
    for(const target of [a,peer]) {
      const res=await get(a,`/admin/users/${target.id}/role-options`);
      expect(res.body.data).toMatchObject({canModify:false,assignableRoles:[],revocableRoleIds:[]});
    }
    expect((await request(app).post(`/api/v1/admin/users/${peer.id}/roles`).auth(a.token,{type:'bearer'}).send({roleId:'role_sponsor'})).status).toBe(403);
  });
});
