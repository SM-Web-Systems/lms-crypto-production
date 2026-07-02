/**
 * Seed 3 students for access verification:
 *   - student-none@smwebsystems.com  → no courses (0)
 *   - student-one@smwebsystems.com   → 1 course (BLOCKCHAIN-101)
 *   - student-three@smwebsystems.com → 3 courses (BLOCKCHAIN-101, SOLIDITY-201, WEB3-301)
 *
 * Run after: npm run db:seed && npm run db:seed-courses
 * Usage: npm run db:seed-students
 */

import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db, close } from '../config/database.js';

const PASSWORD = 'student123';
const COURSE_CODES = ['BLOCKCHAIN-101', 'SOLIDITY-201', 'WEB3-301'] as const;

const STUDENTS = [
  { name: 'Student No Course', email: 'student-none@smwebsystems.com', courseCodes: [] as string[] },
  { name: 'Student One Course', email: 'student-one@smwebsystems.com', courseCodes: ['BLOCKCHAIN-101'] },
  { name: 'Student Three Courses', email: 'student-three@smwebsystems.com', courseCodes: [...COURSE_CODES] },
];

async function seed() {
  try {
    const now = new Date().toISOString();
    const insertUser = db.prepare(
      `INSERT OR IGNORE INTO users (id, name, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertStudent = db.prepare(
      `INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertCode = db.prepare(
      'INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES (?, ?)'
    );
    const deleteUserCodes = db.prepare('DELETE FROM user_course_codes WHERE user_id = ?');

    for (let i = 0; i < STUDENTS.length; i++) {
      const s = STUDENTS[i];
      const userId = uuidv4();
      const hash = await bcrypt.hash(PASSWORD, 10);
      insertUser.run(userId, s.name, s.email.toLowerCase(), hash, 'student', now, now);

      const row = db.prepare('SELECT id FROM users WHERE email = ?').get(s.email.toLowerCase()) as { id: string } | undefined;
      if (!row) {
        console.error('Failed to get user after insert:', s.email);
        continue;
      }
      const uid = row.id;

      const existingStudent = db.prepare('SELECT id FROM students WHERE user_id = ?').get(uid) as { id: string } | undefined;
      if (!existingStudent) {
        const studentId = uuidv4();
        const enrollmentNumber = `SWS-SEED-${String(i + 1).padStart(3, '0')}`;
        insertStudent.run(studentId, uid, s.name, s.email, enrollmentNumber, 'Computer Science', 1, now, now);
        console.log('Created student profile:', s.email);
      }

      // Sync course codes: set exactly the intended codes for this user (fixes missing/wrong codes)
      deleteUserCodes.run(uid);
      for (const code of s.courseCodes) {
        insertCode.run(uid, code);
      }
      console.log(s.email, '→', s.courseCodes.length, 'course(s):', s.courseCodes.length ? s.courseCodes.join(', ') : '(none)');
    }

    console.log('Seeded 3 students (no course, one course, three courses). Password for all:', PASSWORD);
  } catch (err) {
    console.error('Error seeding students:', err);
    process.exit(1);
  } finally {
    close();
  }
}

seed();
