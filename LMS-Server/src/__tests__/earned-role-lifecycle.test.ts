import { beforeEach,describe,it,expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { awardSuperStudentIfEligible } from '../services/earnedRoleService.js';
import { getUserRoles } from '../middleware/rbac.js';

beforeEach(()=>{
  db.exec(`DROP TRIGGER IF EXISTS trg_fixture_legacy_roles;
    INSERT INTO users(id,name,email,password_hash,role,authorization_version) VALUES('learner','Synthetic','learner@example.invalid','synthetic','admin',2);
    INSERT INTO user_roles(user_id,role_id) VALUES('learner','role_student');`);
  for(let index=0;index<3;index++) {
    db.prepare("INSERT INTO courses(id,title,course_code) VALUES(?,'Synthetic',?)").run('course-'+index,'CODE-'+index);
    db.prepare("INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id,completed_at) VALUES(?,'learner',?,'item','section',datetime('now'))").run('completion-'+index,'course-'+index);
  }
});
describe('earned RBAC role lifecycle',()=>{
  it('awards once, creates a missing profile and refreshes RBAC context without expiring the active session',async()=>{
    const token=generateToken({userId:'learner',email:'learner@example.invalid',role:'admin'});
    expect(awardSuperStudentIfEligible('learner')).toBe(true);
    expect(awardSuperStudentIfEligible('learner')).toBe(false);
    expect(getUserRoles('learner')).toEqual(expect.arrayContaining(['student','super-student']));
    expect(db.prepare("SELECT authorization_version FROM users WHERE id='learner'").get()).toEqual({authorization_version:2});
    expect(db.prepare("SELECT COUNT(*) AS total FROM students WHERE user_id='learner'").get()).toEqual({total:1});
    expect(db.prepare("SELECT COUNT(*) AS total FROM notifications WHERE user_id='learner'").get()).toEqual({total:1});
    const me=await request(app).get('/api/v1/auth/me').auth(token,{type:'bearer'});
    expect(me.status).toBe(200); expect(me.body.data.rbacRoles).toContain('super-student');
  });
  it('does not restore a managed no-role account through existing completion records',()=>{
    db.exec("DELETE FROM user_roles WHERE user_id='learner'");
    expect(awardSuperStudentIfEligible('learner')).toBe(false);
    expect(getUserRoles('learner')).toEqual([]);
    db.exec("INSERT INTO roles(id,name,label) VALUES('limited','limited-learner','Limited'); INSERT INTO role_permissions(role_id,permission_id) VALUES('limited','perm_course_submit'); INSERT INTO user_roles(user_id,role_id) VALUES('learner','limited')");
    expect(awardSuperStudentIfEligible('learner')).toBe(false);
    expect(getUserRoles('learner')).toEqual(['limited-learner']);
    expect(db.prepare('SELECT COUNT(*) AS total FROM notifications').get()).toEqual({total:0});
  });
  it('does not award an account pending deletion',()=>{
    db.exec("UPDATE users SET deletion_status='pending_deletion' WHERE id='learner'");
    expect(awardSuperStudentIfEligible('learner')).toBe(false);
    expect(getUserRoles('learner')).toEqual(['student']);
  });
  it('does not award a changed canonical role',()=>{
    db.exec("UPDATE roles SET name='changed-award-role' WHERE id='role_supporter_student'");
    expect(awardSuperStudentIfEligible('learner')).toBe(false);
    expect(getUserRoles('learner')).toEqual(['student']);
  });
  it('rolls back grant, profile and notification when audit recording fails',()=>{
    db.exec("CREATE TRIGGER fail_award_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'synthetic'); END");
    expect(()=>awardSuperStudentIfEligible('learner')).toThrow();
    expect(getUserRoles('learner')).toEqual(['student']);
    expect(db.prepare('SELECT COUNT(*) AS total FROM students').get()).toEqual({total:0});
    expect(db.prepare('SELECT COUNT(*) AS total FROM notifications').get()).toEqual({total:0});
  });
});
