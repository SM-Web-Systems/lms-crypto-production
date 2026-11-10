/**
 * Seed admin and student users for SM Web Systems LMS.
 * Uses bcryptjs (same as authController). Idempotent: uses INSERT OR IGNORE on email.
 *
 * Users created:
 *   admin@smwebsystems.com / admin123 (role: admin)
 *   student@smwebsystems.com / student123 (role: student) + linked student profile
 *
 * Usage: npm run db:seed
 */

import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createRbacAccount } from '../services/rbacAccountService.js';
import { db, close } from '../config/database.js';

const STUDENT_EMAIL = 'student@smwebsystems.com';
const USERS = [
  { name: 'Admin', email: 'admin@smwebsystems.com', password: 'admin123', role: 'admin' as const },
  { name: 'Demo Student', email: STUDENT_EMAIL, password: 'student123', role: 'student' as const },
];

async function seed() {
  try {
    const now = new Date().toISOString();
    for (const u of USERS) {
      if(db.prepare('SELECT id FROM users WHERE email=?').get(u.email.toLowerCase())) { console.log('Skipped existing identity'); continue; }
      const hash=await bcrypt.hash(u.password,10);
      createRbacAccount({name:u.name,email:u.email.toLowerCase(),passwordHash:hash,
        initialRoleId:u.role==='admin'?'role_admin':'role_student'});
      console.log('Created synthetic seed identity');
    }

    // Link student user to a student profile so they can use submissions
    const studentUser = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(STUDENT_EMAIL) as
      | { id: string; name: string; email: string }
      | undefined;
    if (studentUser) {
      const existingStudent = db.prepare('SELECT id FROM students WHERE user_id = ?').get(studentUser.id) as
        | { id: string }
        | undefined;
      if (!existingStudent) {
        const studentId = uuidv4();
        db.prepare(
          `INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(studentId, studentUser.id, studentUser.name, studentUser.email, 'SWS-DEMO-001', 'Computer Science', 1, now, now);
        console.log('Created student profile for', STUDENT_EMAIL);
      } else {
        console.log('Student profile already exists for', STUDENT_EMAIL);
      }
    }

    console.log('Seeded admin@smwebsystems.com and student@smwebsystems.com');
  } catch (err) {
    console.error('Error seeding users:', err);
    process.exit(1);
  } finally {
    close();
  }
}

seed();
