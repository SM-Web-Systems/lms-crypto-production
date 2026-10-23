import { describe, it, expect } from 'vitest';
import { db } from '../config/database.js';

describe('LMS-DB-001 — quizzes.course_id FK constraint', () => {
  it('prevents references to missing courses', () => {
    expect(() => db.prepare("INSERT INTO quizzes(id,title,course_id) VALUES('bad','Bad','missing')").run()).toThrow();
  });
  it('retains the quiz and clears course association when a course is deleted', () => {
    db.exec("INSERT INTO courses(id,title,course_code) VALUES('course','Course','TEST'); INSERT INTO quizzes(id,title,course_id) VALUES('quiz','Quiz','course')");
    db.prepare("DELETE FROM courses WHERE id='course'").run();
    expect(db.prepare("SELECT course_id FROM quizzes WHERE id='quiz'").get()).toEqual({course_id:null});
  });
});
