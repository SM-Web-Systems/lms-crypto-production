/**
 * Add users.description column for Profile API (safe to run multiple times).
 * Usage: npm run db:migrate-profile  or  npx tsx src/scripts/migrateProfile.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { db, close } from '../config/database.js';

const COLUMN = 'description';

try {
  const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === COLUMN)) {
    console.log('Column users.description already exists.');
  } else {
    db.exec(`ALTER TABLE users ADD COLUMN ${COLUMN} TEXT`);
    console.log('Added users.description.');
  }
} finally {
  close();
}
