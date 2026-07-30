import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-MINT-006 — certificate listing max page size', () => {
  it('listCertificates SQL should have LIMIT', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/adminController.ts'), 'utf-8');
    // Find the listCertificates function and check for LIMIT
    const fnStart = src.indexOf('async function listCertificates');
    const fnEnd = src.indexOf('\nexport', fnStart + 1);
    const fnBody = src.slice(fnStart, fnEnd > -1 ? fnEnd : undefined);
    expect(fnBody).toMatch(/LIMIT\s*\?/i);
  });

  it('listIssuedCredentials SQL should have LIMIT', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/adminController.ts'), 'utf-8');
    const fnStart = src.indexOf('async function listIssuedCredentials');
    const fnEnd = src.indexOf('\nexport', fnStart + 1);
    const fnBody = src.slice(fnStart, fnEnd > -1 ? fnEnd : undefined);
    expect(fnBody).toMatch(/LIMIT\s*\?/i);
  });
});
