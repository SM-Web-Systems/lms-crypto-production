import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

describe('LMS-ADM-001/006 — audit logging for admin mutations', () => {
  it('auditService.ts should exist and export auditLog', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/auditService.ts'), 'utf-8');
    expect(src).toContain('export function auditLog');
    expect(src).toContain('audit_log');
  });

  it('adminController.ts should call auditLog for remint', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/adminController.ts'), 'utf-8');
    expect(src).toContain("import { auditLog }");
    expect(src).toContain('REMINT_CREDENTIAL');
  });

  it('atomic RBAC replacement records actor, target and the exact before/after role set', async () => {
    db.exec(`INSERT INTO users(id,name,email,password_hash,authorization_version) VALUES('audit-actor','Actor','actor@example.invalid','synthetic',1),('audit-target','Target','target@example.invalid','synthetic',1); INSERT INTO user_roles(user_id,role_id) VALUES('audit-actor','role_admin2'),('audit-target','role_admin')`);
    const token=generateToken({userId:'audit-actor',email:'actor@example.invalid',role:'admin'});
    const response=await request(app).put('/api/v1/admin/users/audit-target/roles').auth(token,{type:'bearer'}).send({roleIds:['role_student']});
    expect(response.status).toBe(200);
    const entry=db.prepare("SELECT actor_id,target_id,details FROM audit_log WHERE action='rbac.roles_replaced'").get() as {actor_id:string;target_id:string;details:string};
    expect(entry.actor_id).toBe('audit-actor'); expect(entry.target_id).toBe('audit-target');
    expect(JSON.parse(entry.details)).toEqual({before:['role_admin'],after:['role_student']});
  });

  it('schema.sql should have audit_log table', () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf-8');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS audit_log');
  });
});
