import dotenv from 'dotenv';
dotenv.config();

import { db, close } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const createTablesSQL = `
-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS course_documents;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS users;

-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Students table
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  enrollment_number TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 8),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Submissions table
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by_id TEXT REFERENCES users(id),
  feedback TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Course Documents table
CREATE TABLE course_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_mime_type TEXT,
  uploaded_by_id TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_students_department ON students(department);
CREATE INDEX idx_students_semester ON students(semester);
CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_submissions_student_id ON submissions(student_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_submitted_at ON submissions(submitted_at);
CREATE INDEX idx_documents_category ON course_documents(category);
CREATE INDEX idx_documents_uploaded_at ON course_documents(uploaded_at);
CREATE INDEX idx_documents_uploaded_by ON course_documents(uploaded_by_id);
`;

async function initDatabase() {
  try {
    console.log('🔄 Creating database tables...');
    
    // Execute each statement separately
    const statements = createTablesSQL.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        db.exec(statement);
      }
    }
    console.log('✅ Tables created successfully');

    // Create admin user
    const adminId = uuidv4();
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`
    ).run(adminId, 'Admin User', 'admin@kanya.edu', adminPasswordHash, 'admin');
    console.log('✅ Admin user created (email: admin@kanya.edu, password: admin123)');

    // Create sample students with user accounts
    const studentPasswordHash = await bcrypt.hash('student123', 10);
    
    const sampleStudents = [
      { name: 'John Doe', email: 'john@kanya.edu', enrollment: 'KCS2024001', dept: 'Computer Science', sem: 4 },
      { name: 'Jane Smith', email: 'jane@kanya.edu', enrollment: 'KCS2024002', dept: 'Information Technology', sem: 2 },
      { name: 'Bob Wilson', email: 'bob@kanya.edu', enrollment: 'KCS2024003', dept: 'Electronics', sem: 6 },
      { name: 'Alice Brown', email: 'alice@kanya.edu', enrollment: 'KCS2024004', dept: 'Computer Science', sem: 3 },
      { name: 'Charlie Davis', email: 'charlie@kanya.edu', enrollment: 'KCS2024005', dept: 'Information Technology', sem: 5 },
    ];

    const insertUser = db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`
    );
    const insertStudent = db.prepare(
      `INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const student of sampleStudents) {
      const userId = uuidv4();
      const studentId = uuidv4();
      
      insertUser.run(userId, student.name, student.email, studentPasswordHash, 'student');
      insertStudent.run(studentId, userId, student.name, student.email, student.enrollment, student.dept, student.sem);
    }
    console.log('✅ Sample students created (password: student123)');

    // Create a few more students without user accounts (admin-managed)
    const additionalStudents = [
      { name: 'David Miller', email: 'david@kanya.edu', enrollment: 'KCS2024006', dept: 'Electronics', sem: 4 },
      { name: 'Eva Garcia', email: 'eva@kanya.edu', enrollment: 'KCS2024007', dept: 'Computer Science', sem: 1 },
      { name: 'Frank Johnson', email: 'frank@kanya.edu', enrollment: 'KCS2024008', dept: 'Information Technology', sem: 7 },
    ];

    const insertStudentNoUser = db.prepare(
      `INSERT INTO students (id, name, email, enrollment_number, department, semester) VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const student of additionalStudents) {
      const studentId = uuidv4();
      insertStudentNoUser.run(studentId, student.name, student.email, student.enrollment, student.dept, student.sem);
    }
    console.log('✅ Additional students created (no login accounts)');

    console.log('\n📋 Database initialization complete!');
    console.log('\n🔑 Test Credentials:');
    console.log('   Admin: admin@kanya.edu / admin123');
    console.log('   Student: john@kanya.edu / student123');
    console.log('            jane@kanya.edu / student123');
    console.log('            bob@kanya.edu / student123');
    console.log('            alice@kanya.edu / student123');
    console.log('            charlie@kanya.edu / student123');

  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    close();
  }
}

initDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
