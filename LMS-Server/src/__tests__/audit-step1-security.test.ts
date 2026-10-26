import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { db, execute, queryOne, ensureAuthorizationVersionColumn, hashToken } from '../config/database.js';
import { generateToken, verifyToken } from '../config/jwt.js';
import { getUserRoles, hasPermission } from '../middleware/rbac.js';
import { assertNotLastSuperAdmin } from '../services/roleSecurityService.js';
import type { LegacyRole } from '../types/index.js';
import * as sso from '../services/ammaWalletSSOService.js';

function actor(roleId: string, legacy: LegacyRole = 'student') {
  const id = randomUUID();
  const email = `${id}@audit.invalid`;
  execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (?, 'Audit user', ?, 'unused', ?)", [id,email,legacy]);
  execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
  execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [id,roleId]);
  return { id, email, token: generateToken({userId:id,email,role:legacy}) };
}
function revoke(caller: ReturnType<typeof actor>, target: ReturnType<typeof actor>, role: string) {
  return request(app).delete(`/api/v1/admin/users/${target.id}/roles/${role}`).auth(caller.token,{type:'bearer'});
}
function change(caller: ReturnType<typeof actor>, target: ReturnType<typeof actor>, role: LegacyRole) {
  return request(app).put(`/api/v1/admin/users/${target.id}/roles`).auth(caller.token,{type:'bearer'}).send({roleIds:[{student:'role_student',lecturer:'role_instructor',admin:'role_admin'}[role]]});
}
function course(tenantId: string | null = null) {
  const id = randomUUID();
  execute("INSERT INTO courses (id,title,course_code,sections,tenant_id) VALUES (?, 'Audit course', ?, '[]', ?)", [id,id,tenantId]);
  return id;
}
function credential(userId: string, courseId: string | null) {
  const id = randomUUID();
  execute("INSERT INTO nft_credentials (id,user_id,course_id,wallet_address,mint_status,contract_id) VALUES (?,?,?,'audit-wallet','minted','audit-contract')", [id,userId,courseId]);
  return id;
}
function tenant(userId: string) {
  const id = randomUUID();
  execute("INSERT INTO tenants (id,name,slug) VALUES (?, 'Audit tenant', ?)", [id,id]);
  execute("INSERT INTO tenant_users (tenant_id,user_id,tenant_role) VALUES (?,?,'admin')", [id,userId]);
  return id;
}
async function search(a: ReturnType<typeof actor>, type: string) {
  const res = await request(app).get(`/api/v1/search?q=Audit&types=${type}`).auth(a.token,{type:'bearer'});
  expect(res.status).toBe(200);
  return (res.body.data.results[type] ?? []).map((r: {id: string}) => r.id);
}

describe('A01 — revocation hierarchy and atomicity', () => {
  it('denies revocation of a higher-tier role', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_super_admin','admin');
    expect((await revoke(a,target,'role_super_admin')).status).toBe(403);
    expect(getUserRoles(target.id)).toContain('super-admin');
    expect((await request(app).get('/api/v1/auth/me').auth(target.token,{type:'bearer'})).status).toBe(200);
  });
  it('denies peer revocation, including a low role on a privileged peer', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_admin2','admin');
    execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [target.id,'role_student']);
    expect((await revoke(a,target,'role_student')).status).toBe(403);
    expect(getUserRoles(target.id)).toContain('student');
  });
  it('denies self-revocation and preserves the only super-admin', async () => {
    const a = actor('role_super_admin','admin');
    expect((await revoke(a,a,'role_super_admin')).status).toBe(403);
    expect(() => assertNotLastSuperAdmin(a.id)).toThrow('last super-admin');
    actor('role_super_admin','admin');
    expect(() => assertNotLastSuperAdmin(a.id)).not.toThrow();
  });
  it('revokes a lower admin and invalidates its legacy and tracked sessions', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_admin','admin');
    execute(`INSERT INTO active_sessions (id,user_id,token_hash,expires_at)
      VALUES (?,?,?,datetime('now','+1 day'))`, [randomUUID(),target.id,hashToken(target.token)]);
    expect((await revoke(a,target,'role_admin')).status).toBe(200);
    expect(getUserRoles(target.id)).toEqual([]);
    expect(hasPermission(target.id,'course.delete')).toBe(false);
    expect(queryOne<{role: string}>('SELECT role FROM users WHERE id = ?', [target.id])?.role).toBe('admin');
    expect((await request(app).get('/api/v1/auth/me').auth(target.token,{type:'bearer'})).status).toBe(401);
    expect(queryOne<{revoked_at: string}>('SELECT revoked_at FROM active_sessions WHERE user_id = ?', [target.id])?.revoked_at).toBeTruthy();
  });
  it('retains remaining roles and reports a missing assignment', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_instructor','lecturer');
    execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [target.id,'role_student']);
    expect((await revoke(a,target,'role_instructor')).status).toBe(200);
    expect(getUserRoles(target.id)).toEqual(['student']);
    expect((await revoke(a,target,'role_instructor')).status).toBe(404);
  });
  it('rolls back revocation if invalidation fails', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_admin','admin');
    db.exec("CREATE TRIGGER fail_version BEFORE UPDATE OF authorization_version ON users BEGIN SELECT RAISE(ABORT,'test failure'); END");
    expect((await revoke(a,target,'role_admin')).status).toBe(500);
    expect(getUserRoles(target.id)).toContain('admin');
    expect(queryOne<{role: string}>('SELECT role FROM users WHERE id = ?', [target.id])?.role).toBe('admin');
  });
});

describe('A02 — effective role replacement and token invalidation', () => {
  it('demotion removes all prior grants and rejects same-second untracked tokens', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_admin','admin');
    execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [target.id,'role_sponsor']);
    const legacyToken = jwt.sign({userId:target.id,email:target.email,role:'admin'}, process.env.JWT_SECRET!, {expiresIn:'1h'});
    expect((await request(app).get('/api/v1/auth/me').auth(legacyToken,{type:'bearer'})).status).toBe(200);
    expect((await change(a,target,'student')).status).toBe(200);
    expect(getUserRoles(target.id)).toEqual(['student']);
    expect(hasPermission(target.id,'course.delete')).toBe(false);
    for (const token of [target.token, legacyToken]) {
      expect((await request(app).get('/api/v1/auth/me').auth(token,{type:'bearer'})).status).toBe(401);
    }
    const fresh = generateToken({userId:target.id,email:target.email,role:'student'});
    expect((await request(app).get('/api/v1/auth/me').auth(fresh,{type:'bearer'})).status).toBe(200);
    expect((await request(app).get('/api/v1/users').auth(fresh,{type:'bearer'})).status).toBe(403);
    // Simulate a login that read the old role before awaiting password verification.
    const staleLogin = generateToken({userId:target.id,email:target.email,role:'admin'});
    expect(verifyToken(staleLogin).role).toBe('student');
  });
  it('cannot demote a peer or higher-tier user via RBAC replacement', async () => {
    const a = actor('role_admin2','admin');
    for (const role of ['role_admin2','role_super_admin']) {
      const target = actor(role,'admin');
      expect((await change(a,target,'student')).status).toBe(403);
      expect(getUserRoles(target.id)).toContain(role === 'role_admin2' ? 'admin-2' : 'super-admin');
    }
  });
  it('promotion updates effective permissions, not just the legacy field', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_student');
    expect((await change(a,target,'lecturer')).status).toBe(200);
    expect(getUserRoles(target.id)).toEqual(['instructor']);
    expect(hasPermission(target.id,'course.manage')).toBe(true);
  });
  it('login provisioning lists cannot undo a managed demotion', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_admin','admin');
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync('audit-password',4),target.id]);
    expect((await change(a,target,'student')).status).toBe(200);
    vi.stubEnv('ADMIN_EMAILS',target.email);
    try {
      const res = await request(app).post('/api/v1/auth/login').send({email:target.email,password:'audit-password'});
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('student');
      expect((await request(app).get('/api/v1/users').auth(res.body.data.token,{type:'bearer'})).status).toBe(403);
    } finally { vi.unstubAllEnvs(); }
  });
  it('SSO login preserves a managed role even when a provisioning list grants admin', async () => {
    // These columns are added by production startup migrations, not schema.sql.
    db.exec('ALTER TABLE users ADD COLUMN auth_provider TEXT; ALTER TABLE users ADD COLUMN ammawallet_user_id TEXT');
    const a = actor('role_admin2','admin');
    const target = actor('role_admin','admin');
    expect((await change(a,target,'student')).status).toBe(200);
    vi.stubEnv('ADMIN_EMAILS',target.email);
    vi.spyOn(sso,'validateState').mockImplementation(() => {});
    execute("UPDATE users SET auth_provider='ammawallet', ammawallet_user_id='audit-wallet-user' WHERE id=?", [target.id]);
    vi.spyOn(sso,'verifyAssertion').mockResolvedValue({userId:'audit-wallet-user',email:target.email,isEmailVerified:true,firstName:null,lastName:null,mainnetWalletAddress:null});
    try {
      const res = await request(app).get('/api/v1/auth/amma-callback?assertion=audit&state=audit');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/sso-callback');
      expect(queryOne<{role: string}>('SELECT role FROM users WHERE id = ?', [target.id])?.role).toBe('admin');
      expect(getUserRoles(target.id)).toEqual(['student']);
    } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
  });
  it('startup migration cannot resurrect explicitly revoked roles', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_student');
    expect((await revoke(a,target,'role_student')).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS total FROM authorization_migrations').get()).toEqual({total:1});
    expect(getUserRoles(target.id)).toEqual([]);
  });
  it('rolls back replacement when invalidation fails', async () => {
    const a = actor('role_admin2','admin');
    const target = actor('role_admin','admin');
    db.exec("CREATE TRIGGER fail_version BEFORE UPDATE OF authorization_version ON users BEGIN SELECT RAISE(ABORT,'test failure'); END");
    expect((await change(a,target,'student')).status).toBe(500);
    expect(getUserRoles(target.id)).toEqual(['admin']);
  });
  it('migrates existing databases idempotently and preserves users', () => {
    const a = actor('role_student');
    db.exec('DROP TRIGGER IF EXISTS trg_fixture_legacy_roles; ALTER TABLE users DROP COLUMN authorization_version');
    ensureAuthorizationVersionColumn();
    ensureAuthorizationVersionColumn();
    expect(queryOne<{authorization_version: number}>('SELECT authorization_version FROM users WHERE id = ?', [a.id])?.authorization_version).toBe(0);
  });
});

describe('A07 — independent search capabilities and resource scopes', () => {
  it('instructors find assigned credentials but not unrelated credentials', async () => {
    const a = actor('role_instructor','lecturer');
    const student = actor('role_student');
    const assigned = course();
    const unrelated = course();
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)', [assigned,a.id]);
    const yes = credential(student.id,assigned);
    const no = credential(student.id,unrelated);
    expect(await search(a,'credentials')).toEqual([yes]);
    expect(await search(a,'credentials')).not.toContain(no);
    expect(await search(a,'courses')).toEqual([assigned]);
  });
  it('directory-only custom role cannot search credentials or quiz analytics', async () => {
    const a = actor('role_student');
    execute("INSERT INTO roles (id,name,label,is_system) VALUES ('directory-only','directory-only','Directory',0)");
    execute("INSERT INTO role_permissions (role_id,permission_id) VALUES ('directory-only','perm_user_view_all')");
    execute('DELETE FROM user_roles WHERE user_id = ?', [a.id]);
    execute("INSERT INTO user_roles (user_id,role_id) VALUES (?,'directory-only')", [a.id]);
    const target = actor('role_student');
    credential(target.id,null);
    expect(await search(a,'users')).toContain(target.id);
    expect(await search(a,'credentials')).toEqual([]);
    expect(await search(a,'quizzes')).toEqual([]);
  });
  it('student sees own credentials, never another student, including unscoped credentials', async () => {
    const a = actor('role_student');
    const target = actor('role_student');
    const own = credential(a.id,null);
    credential(target.id,null);
    expect(await search(a,'credentials')).toEqual([own]);
  });
  it('tenant administrator cannot search credentials, courses or directory in another tenant', async () => {
    const a = actor('role_admin','admin');
    const b = actor('role_admin','admin');
    const ownTenant = tenant(a.id);
    const otherTenant = tenant(b.id);
    const ownCourse = course(ownTenant);
    const otherCourse = course(otherTenant);
    const own = credential(a.id,ownCourse);
    credential(b.id,otherCourse);
    // A shared platform course and an unscoped legacy credential must not bypass tenant isolation.
    credential(b.id,course());
    credential(b.id,null);
    expect(await search(a,'courses')).toContain(ownCourse);
    expect(await search(a,'courses')).not.toContain(otherCourse);
    expect(await search(a,'credentials')).toEqual([own]);
    expect(await search(a,'users')).not.toContain(b.id);
  });
  it('super-admin can search across tenant boundaries', async () => {
    const a = actor('role_super_admin','admin');
    const b = actor('role_admin','admin');
    const other = course(tenant(b.id));
    const id = credential(b.id,other);
    expect(await search(a,'credentials')).toContain(id);
    expect(await search(a,'courses')).toContain(other);
  });
  it('student course search hides unassigned courses and their access codes', async () => {
    const a = actor('role_student');
    course();
    expect(await search(a,'courses')).toEqual([]);
  });
  it('quiz analytics search is limited to assigned courses', async () => {
    const a = actor('role_instructor','lecturer');
    const yesCourse = course();
    const noCourse = course();
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)', [yesCourse,a.id]);
    for (const id of [yesCourse,noCourse]) {
      execute("INSERT INTO quizzes (id,title,course_id,questions) VALUES (?, 'Audit quiz', ?, '[]')", [id,id]);
    }
    expect(await search(a,'quizzes')).toEqual([yesCourse]);
  });
  it('scopes legacy quiz-linked credentials using the source quiz course', async () => {
    const a = actor('role_instructor','lecturer');
    const student = actor('role_student');
    const c = course();
    execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)', [c,a.id]);
    execute("INSERT INTO quizzes (id,title,course_id,questions) VALUES (?, 'Audit quiz', ?, '[]')", [c,c]);
    const id = credential(student.id,null);
    execute('UPDATE nft_credentials SET quiz_id = ? WHERE id = ?', [c,id]);
    expect(await search(a,'credentials')).toEqual([id]);
  });
});
