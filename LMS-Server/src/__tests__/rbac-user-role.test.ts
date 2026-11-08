/** RBAC role-set replacement and legacy endpoint retirement. */
import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { getUserRoles } from '../middleware/rbac.js';
import { db, execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

/**
 * Create a user with explicit RBAC role assignment.
 * The trg_auto_assign_user_role trigger handles the initial mapping,
 * but we add explicit RBAC roles for higher-tier users.
 */
function createUser(
  legacyRole: 'student' | 'lecturer' | 'admin',
  rbacRoleIds?: string[],
): { userId: string; email: string; token: string } {
  const userId = uuidv4();
  const email = `wi02-${userId.slice(0, 8)}@test.com`;

  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', ?)",
    [userId, `WI02 ${legacyRole}`, email, legacyRole],
  );

  // Add extra RBAC roles if specified (trigger already assigned the base role)
  if (rbacRoleIds) {
    for (const roleId of rbacRoleIds) {
      execute(
        'INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [userId, roleId],
      );
    }
  }

  const token = makeToken({ userId, email, role: legacyRole });
  return { userId, email, token };
}

describe('RBAC user-role replacement',()=>{
  const replace=(actor:ReturnType<typeof createUser>,target:string,roleIds:unknown)=>request(app)
    .put('/api/v1/admin/users/'+target+'/roles').auth(actor.token,{type:'bearer'}).send({roleIds});
  it.each([['role_student','student'],['role_instructor','instructor'],['role_admin','admin']])('assigns %s through current RBAC',async(id,name)=>{
    const actor=createUser('admin',['role_admin2']),target=createUser('student');
    expect((await replace(actor,target.userId,[id])).status).toBe(200);
    expect(getUserRoles(target.userId)).toEqual([name]);
  });
  it.each([null,'student',{},[null],['']])('rejects malformed role IDs %j',async ids=>{
    const actor=createUser('admin',['role_admin2']),target=createUser('student');
    expect((await replace(actor,target.userId,ids)).status).toBe(400);
    expect(getUserRoles(target.userId)).toEqual(['student']);
  });
  it('rejects unknown roles without removing existing grants',async()=>{
    const actor=createUser('admin',['role_admin2']),target=createUser('student');
    expect((await replace(actor,target.userId,['missing-role'])).status).toBe(404);
    expect(getUserRoles(target.userId)).toEqual(['student']);
  });
  it('requires role assignment capability, not only user.manage',async()=>{
    const actor=createUser('admin'),target=createUser('student');
    expect((await replace(actor,target.userId,['role_instructor'])).status).toBe(403);
  });
  it('cannot assign equal/higher privileges or super-admin',async()=>{
    const actor=createUser('admin',['role_admin2']),target=createUser('student');
    for(const id of ['role_admin2','role_super_admin']) expect((await replace(actor,target.userId,[id])).status).toBe(403);
  });
  it('cannot modify a peer or higher-tier target, including their lower grants',async()=>{
    const actor=createUser('admin',['role_admin2']),peer=createUser('admin',['role_admin2']);
    expect((await replace(actor,peer.userId,[])).status).toBe(403);
  });
  it('cannot replace your own roles',async()=>{
    const actor=createUser('admin',['role_admin2']);
    expect((await replace(actor,actor.userId,[])).status).toBe(403);
  });
  it('supports intentional zero grants and preserves inert legacy storage',async()=>{
    const actor=createUser('admin',['role_admin2']),target=createUser('admin');
    expect((await replace(actor,target.userId,[])).status).toBe(200);
    expect(getUserRoles(target.userId)).toEqual([]);
    expect(db.prepare('SELECT role FROM users WHERE id=?').get(target.userId)).toEqual({role:'admin'});
  });
  it('requires authentication and reports a missing target',async()=>{
    expect((await request(app).put('/api/v1/admin/users/absent/roles').send({roleIds:[]})).status).toBe(401);
    const actor=createUser('admin',['role_admin2']); expect((await replace(actor,'absent',[])).status).toBe(404);
  });
  it('returns 410 on the retired endpoint without changing grants',async()=>{
    const actor=createUser('admin',['role_admin2']),target=createUser('student');
    const response=await request(app).patch('/api/v1/users/'+target.userId+'/role').auth(actor.token,{type:'bearer'}).send({role:'admin'});
    expect(response.status).toBe(410); expect(response.body.error.code).toBe('LEGACY_ROLE_ENDPOINT_RETIRED');
    expect(getUserRoles(target.userId)).toEqual(['student']);
  });
});
