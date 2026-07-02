import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';

const PASSWORD = 'password123';
const HASH = bcrypt.hashSync(PASSWORD, 4); // low rounds for speed in tests

export const TEST_PASSWORD = PASSWORD;

export interface TestIds {
  adminId: string;
  studentUserId: string;
  studentId: string;
  courseId: string;
  courseCode: string;
  course2Id: string;
  course2Code: string;
  documentId: string;
}

export function seedTestData(): TestIds {
  const adminId = uuidv4();
  const studentUserId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const courseCode = 'BLOCK-101';
  const course2Id = uuidv4();
  const course2Code = 'WEB-201';
  const documentId = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'Admin User', 'admin@test.com', '${HASH}', 'admin'),
      ('${studentUserId}', 'Student User', 'student@test.com', '${HASH}', 'student');

    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES ('${studentId}', '${studentUserId}', 'Student User', 'student@test.com', 'STU-001', 'Computer Science', 3);

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES
      ('${courseId}', 'Blockchain 101', 'Intro to blockchain', '${courseCode}', '${JSON.stringify([
        { id: uuidv4(), title: 'Getting Started', items: [] },
      ])}'),
      ('${course2Id}', 'Web Dev 201', 'Advanced web development', '${course2Code}', '[]');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${studentUserId}', '${courseCode}');

    INSERT INTO course_documents (id, title, description, category, file_name, file_size, file_path, file_mime_type, uploaded_by_id)
    VALUES ('${documentId}', 'Lecture 1 Notes', 'First lecture notes', 'Lecture Notes', 'lecture1.pdf', 1024, '/tmp/test/lecture1.pdf', 'application/pdf', '${adminId}');
  `);

  return { adminId, studentUserId, studentId, courseId, courseCode, course2Id, course2Code, documentId };
}
