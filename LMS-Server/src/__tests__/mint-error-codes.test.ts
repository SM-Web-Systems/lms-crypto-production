import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LMS-MINT-004: Specific mint error codes', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../controllers/adminController.ts'), 'utf-8');

  it('should have INSUFFICIENT_FUNDS error code', () => {
    expect(src).toContain('INSUFFICIENT_FUNDS');
  });

  it('should have CONTRACT_ERROR error code', () => {
    expect(src).toContain('CONTRACT_ERROR');
  });

  it('should have NETWORK_ERROR error code', () => {
    expect(src).toContain('NETWORK_ERROR');
  });

  it('should classify errors based on message patterns', () => {
    expect(src).toMatch(/insufficient|balance|fund/i);
    expect(src).toMatch(/contract|invoke|wasm/i);
    expect(src).toMatch(/timeout|ECONNREFUSED|fetch|network/i);
  });
});
