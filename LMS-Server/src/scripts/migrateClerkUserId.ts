/**
 * Adds users.clerk_user_id for Clerk ↔ LMS account linking.
 * Safe to run multiple times.
 */
import dotenv from 'dotenv';
dotenv.config();

import { db, close } from '../config/database.js';

function columnExists(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

try {
  if (!columnExists('users', 'clerk_user_id')) {
    db.exec('ALTER TABLE users ADD COLUMN clerk_user_id TEXT');
    console.log('Added column users.clerk_user_id');
  } else {
    console.log('Column users.clerk_user_id already exists');
  }
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL'
  );
  console.log('Clerk user id migration done.');
} finally {
  close();
}
