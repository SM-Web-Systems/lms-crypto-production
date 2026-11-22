import { describe, expect, it } from 'vitest';
import { activeWorkspace } from '../utils/authorization';
import { requirementsFromRow } from '../services/courseCompletionService';
import type { User } from '../types/api';

const multi = {id:'u',name:'U',email:'u@example.invalid',role:'admin',workspaces:['admin','teacher','sponsor'],defaultWorkspace:'admin',permissions:[]} as unknown as User;

describe('shared pages keep the workspace the user came from', () => {
  it('uses the remembered workspace on /profile instead of the default admin one', () => {
    expect(activeWorkspace(multi, '/profile', 'teacher')).toBe('teacher');
    expect(activeWorkspace(multi, '/messages', 'sponsor')).toBe('sponsor');
  });
  it('ignores a remembered workspace the user no longer has, and prefixed routes win', () => {
    expect(activeWorkspace(multi, '/profile', 'parent')).toBe('admin');
    expect(activeWorkspace(multi, '/sponsor/cohorts', 'teacher')).toBe('sponsor');
    expect(activeWorkspace(multi, '/profile')).toBe('admin');
  });
});

describe('certificate requirements from the API row', () => {
  it('maps the stored snake_case row so saved settings show in the admin form', () => {
    expect(requirementsFromRow({require_all_lessons:1,required_quiz_ids:'["q1","q2"]',min_quiz_score:80,require_submissions:0}))
      .toEqual({requireAllLessons:true,requiredQuizIds:['q1','q2'],minQuizScore:80,requireSubmissions:false});
  });
  it('tolerates bad quiz id JSON', () => {
    expect(requirementsFromRow({required_quiz_ids:'not json'}).requiredQuizIds).toEqual([]);
  });
});
