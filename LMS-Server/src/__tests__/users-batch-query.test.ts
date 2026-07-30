import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-ADM-007 — batch course code query', () => {
  it('getUsers should use batch query instead of per-user getUserCourseCodes', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/usersController.ts'), 'utf-8');
    const getUsersStart = src.indexOf('async function getUsers');
    const nextExport = src.indexOf('\nexport', getUsersStart + 1);
    const getUsersBody = src.slice(getUsersStart, nextExport > -1 ? nextExport : undefined);
    const mapIdx = getUsersBody.indexOf('.map(');
    const mapSection = getUsersBody.slice(mapIdx);
    expect(mapSection).not.toContain('getUserCourseCodes');
    expect(getUsersBody).toContain('user_course_codes');
  });
});
