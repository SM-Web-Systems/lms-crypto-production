/**
 * Set a user's role to admin by email (SQLite).
 * Use after the user exists in `users` (e.g. first Clerk sign-in).
 *
 * Usage: npm run db:promote-admin -- user@example.com
 */

import dotenv from 'dotenv';
dotenv.config();

import { execute, queryOne, close } from '../config/database.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: npm run db:promote-admin -- <email>');
  process.exit(1);
}

const row = queryOne<{ id: string; name: string; role: string }>(
  'SELECT id, name, role FROM users WHERE email = ?',
  [email]
);
if (!row) {
  console.error(`No user with email "${email}". Sign in once with Clerk so a row is created, then run this again.`);
  process.exit(1);
}

if (row.role === 'admin') {
  console.log(`Already admin: ${email} (${row.name})`);
  close();
  process.exit(0);
}

const n = execute("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?", ['admin', row.id]);
if (n === 0) {
  console.error('Update failed unexpectedly.');
  process.exit(1);
}

console.log(`Promoted to admin: ${email} (${row.name})`);
close();
