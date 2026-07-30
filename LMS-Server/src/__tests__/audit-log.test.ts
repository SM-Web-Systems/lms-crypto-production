import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

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

  it('usersController.ts should call auditLog for role change', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/usersController.ts'), 'utf-8');
    expect(src).toContain("import { auditLog }");
    expect(src).toContain('CHANGE_ROLE');
  });

  it('schema.sql should have audit_log table', () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf-8');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS audit_log');
  });
});
