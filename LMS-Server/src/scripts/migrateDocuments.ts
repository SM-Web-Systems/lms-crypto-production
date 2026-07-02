import dotenv from 'dotenv';
dotenv.config();

import { db, close } from '../config/database.js';

const migrationSQL = `
-- Course Documents table
CREATE TABLE IF NOT EXISTS course_documents (
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

-- Indexes (will fail silently if they exist)
CREATE INDEX IF NOT EXISTS idx_documents_category ON course_documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON course_documents(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON course_documents(uploaded_by_id);
`;

function runMigration() {
  try {
    console.log('🔄 Running course_documents migration...');
    
    // Execute each statement separately
    const statements = migrationSQL.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        db.exec(statement);
      }
    }
    
    console.log('✅ Migration complete! course_documents table is ready.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    close();
  }
}

runMigration();

