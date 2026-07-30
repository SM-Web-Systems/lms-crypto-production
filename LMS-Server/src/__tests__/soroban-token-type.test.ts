import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LMS-MINT-001: sorobanTokenId as string', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../controllers/adminController.ts'), 'utf-8');

  it('should not declare sorobanTokenId as number type', () => {
    expect(src).not.toMatch(/sorobanTokenId:\s*number/);
  });

  it('should declare sorobanTokenId as string type', () => {
    expect(src).toMatch(/sorobanTokenId:\s*string\s*\|\s*null/);
  });
});
